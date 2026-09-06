/**
 * Cached read path for the unified action list.
 *
 * getUnifiedActionList() reads six sheets and derives ages, due dates and
 * counts on every call. Measured cost: 5.3s cold, ~2.1s warm, against a 97 KB
 * payload. Every record page paid that on load, which is why Audits and Issues
 * sat on a spinner for seven-plus seconds.
 *
 * The whole plant fits in one CacheService entry (97 KB against the 100 KB
 * per-key ceiling), and reading it back costs ~48ms — 44x faster than
 * rebuilding it. So the list is built once, cached, and sliced per type in
 * memory; the PIN screen warms it while the user is still tapping digits, so
 * the first page after sign-in reads a cache that is already hot.
 *
 * Correctness over speed: any write invalidates the blob (hooked into
 * v2InvalidateCache), and the TTL is deliberately short. A stale action list
 * is worse than a slow one — it shows work that is already done.
 */

var ACTION_LIST_CACHE_KEY = 'pm5s_actionlist_v1';

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
      var hit = cache.get(ACTION_LIST_CACHE_KEY);
      if (hit) {
        var parsed = JSON.parse(hit);
        if (parsed && parsed.items) return parsed;
      }
    } catch (e) {
      /* A corrupt or truncated entry must not take the page down with it —
         fall through and rebuild. */
      Logger.log('actionlist cache read failed: ' + e.message);
    }
  }

  var fresh = getUnifiedActionList({});
  try {
    var blob = JSON.stringify(fresh);
    /* CacheService rejects values over 100 KB. The payload measured 97 KB and
       grows with the record count, so this will eventually cross the line:
       skip the cache rather than throw, and the page still renders — slowly,
       but correctly. */
    if (blob.length < 100000) {
      cache.put(ACTION_LIST_CACHE_KEY, blob, ACTION_LIST_TTL);
    } else {
      Logger.log('actionlist too large to cache: ' + blob.length + ' bytes');
    }
  } catch (e) {
    Logger.log('actionlist cache write failed: ' + e.message);
  }
  return fresh;
}

/**
 * Drops the cached list. Called from v2InvalidateCache on every write, so a
 * new NC or a closed task shows up immediately rather than after the TTL.
 */
function invalidateActionListCache_() {
  try { CacheService.getScriptCache().remove(ACTION_LIST_CACHE_KEY); } catch (e) {}
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
  try { wasCached = !!cache.get(ACTION_LIST_CACHE_KEY); } catch (e) {}

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
