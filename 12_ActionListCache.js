/**
 * Cached read path for the unified action list.
 *
 * getUnifiedActionList() reads six sheets and derives ages, due dates and
 * counts on every call. Measured cost: 5.3s cold, ~2.1s warm, against a 97 KB
 * payload. Every record page paid that on load, which is why Audits and Issues
 * sat on a spinner for seven-plus seconds.
 *
 * The whole plant is cached across as many keys as it needs (100 KB each) and
 * read back in ~76ms — far faster than rebuilding it. The list is built once,
 * cached, and sliced per type in memory; the PIN screen warms it while the
 * user is still tapping digits, so the first page after sign-in reads a cache
 * that is already hot.
 *
 * Correctness over speed: any write invalidates the blob (hooked into
 * v2InvalidateCache), and the TTL is deliberately short. A stale action list
 * is worse than a slow one — it shows work that is already done.
 */

/* The key carries a build stamp because CacheService is script-scoped, not
   version-scoped: a `clasp push` does NOT clear it (verified — the entry was
   still present straight after a push). Without the stamp, a deploy that
   changed a record's shape would keep serving the old shape until the TTL
   expired, and the new code would read fields that were not in the cached
   rows. Bump this string in the same commit as any change to what
   getUnifiedActionList returns; the old entry is then simply orphaned and
   ages out on its own. */
var ACTION_LIST_BUILD = '2026-09-07a';
var ACTION_LIST_CACHE_KEY = 'pm5s_actionlist_' + ACTION_LIST_BUILD;

/* Six minutes. Long enough to cover a sign-in plus a walk through every page,
   short enough that a write from another device surfaces quickly even if its
   invalidation never reached this cache. */
var ACTION_LIST_TTL = 360;

/**
 * The cached whole-plant action list. Reads the cache, rebuilds on a miss.
 *
 * @param {boolean} force  Skip the cache and rebuild (used by the warmer).
 * @returns {Object} The same shape getUnifiedActionList({}) returns.
 */
function getActionListCached_(force) {
  var cache = CacheService.getScriptCache();

  if (!force) {
    try {
      var hit = readChunked_(cache);
      if (hit) {
        var parsed = JSON.parse(hit);
        if (parsed && parsed.items) return parsed;
      }
    } catch (e) {
      /* A corrupt or half-expired entry must not take the page down with it —
         fall through and rebuild. */
      Logger.log('actionlist cache read failed: ' + e.message);
    }
  }

  var fresh = getUnifiedActionList({});
  try {
    writeChunked_(cache, JSON.stringify(fresh));
  } catch (e) {
    Logger.log('actionlist cache write failed: ' + e.message);
  }
  return fresh;
}

/* CacheService caps a single value at 100 KB. The payload measured 99,362
   bytes — 99% of the ceiling — so it was days of new records away from
   silently falling back to the slow path with nothing to show why. Splitting
   it across keys costs one extra round trip (76ms for two chunks, measured)
   and removes the cliff.

   An index key holds the chunk count so a reader knows how many to ask for,
   and getAll fetches them in one call. */
var ACTION_LIST_CHUNK = 60000;

function chunkKeys_(n) {
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(ACTION_LIST_CACHE_KEY + '_' + i);
  return keys;
}

function writeChunked_(cache, blob) {
  var parts = [];
  for (var i = 0; i < blob.length; i += ACTION_LIST_CHUNK) {
    parts.push(blob.substring(i, i + ACTION_LIST_CHUNK));
  }
  var map = {};
  chunkKeys_(parts.length).forEach(function (k, n) { map[k] = parts[n]; });
  cache.putAll(map, ACTION_LIST_TTL);
  /* The index is written LAST and expires FIRST (a few seconds early), so a
     reader can never find an index pointing at chunks that have already gone.
     A missing index just means a rebuild, which is correct; a torn read would
     mean corrupt JSON. */
  cache.put(ACTION_LIST_CACHE_KEY + '_n', String(parts.length), ACTION_LIST_TTL - 10);
}

function readChunked_(cache) {
  var n = parseInt(cache.get(ACTION_LIST_CACHE_KEY + '_n'), 10);
  if (!n || n < 1) return null;
  var keys = chunkKeys_(n);
  var got = cache.getAll(keys);
  var out = '';
  for (var i = 0; i < keys.length; i++) {
    var part = got[keys[i]];
    /* Any missing chunk makes the whole blob unusable — rebuild rather than
       parse a hole. */
    if (part === null || part === undefined) return null;
    out += part;
  }
  return out;
}

/**
 * Drops the cached list. Called from v2InvalidateCache on every write, so a
 * new NC or a closed task shows up immediately rather than after the TTL.
 */
function invalidateActionListCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var n = parseInt(cache.get(ACTION_LIST_CACHE_KEY + '_n'), 10) || 0;
    /* Drop the index first: from that moment no reader can assemble the blob,
       so the chunks going a moment later cannot produce a torn read. */
    cache.remove(ACTION_LIST_CACHE_KEY + '_n');
    if (n > 0) cache.removeAll(chunkKeys_(n));
  } catch (e) {}
}

/**
 * Client entry point: the whole plant, or one type of it, from cache.
 *
 * Filtering happens here rather than in the query so that every page shares
 * one cache entry — a per-type key would mean five rebuilds instead of one,
 * and the type slice is a millisecond of array work against a two-second read.
 *
 * @param {Object} filters  { type } — status, zone and priority stay client-side.
 * @returns {Object} { items, counts, cached, elapsedMs }
 */
function getActionListFast(filters) {
  var t0 = Date.now();
  filters = filters || {};
  var type = String(filters.type || '').toUpperCase();

  var cache = CacheService.getScriptCache();
  var wasCached = false;
  try { wasCached = !!cache.get(ACTION_LIST_CACHE_KEY + '_n'); } catch (e) {}

  var all = getActionListCached_(false);
  var items = all.items || [];

  if (type) {
    items = items.filter(function (i) { return i.type === type; });
  }

  return {
    items: items,
    counts: all.counts || {},
    cached: wasCached,
    elapsedMs: Date.now() - t0
  };
}

/**
 * Warms the cache. Called from the PIN screen the moment a user is picked, so
 * the rebuild overlaps the four digits being tapped instead of running after
 * sign-in while the user waits on a spinner.
 *
 * Returns quickly and never throws: a failed warm must not block a login. The
 * page it warms for still works, just at the uncached speed.
 */
function warmActionListCache() {
  var t0 = Date.now();
  try {
    var r = getActionListCached_(true);
    return { ok: true, n: (r.items || []).length, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e).substring(0, 120), ms: Date.now() - t0 };
  }
}
