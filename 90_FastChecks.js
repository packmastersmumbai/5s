/**
 * Server-side assertions, runnable in one `clasp run` call.
 *
 * Most of what the browser suites assert is server truth: which route serves
 * which page, how many rows a page will get, whether the cache hit and whether
 * a write dropped it. A headed Playwright run answers those in 3-7 MINUTES
 * because it pays for a browser launch, a PIN sign-in and a GAS iframe load
 * per page. This answers the same questions in seconds.
 *
 * It does NOT replace the browser suites, and is not meant to: it cannot see
 * layout, z-index, click interception or whether a control is reachable. Those
 * are real defects this file would miss — the unclickable Kaizen submit button
 * was exactly that. Run this while iterating; run the browser suites before
 * shipping.
 *
 *   clasp run fastChecks
 */
function fastChecks() {
  var R = [];
  function ok(name, cond, detail) {
    R.push({ name: name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  }
  function timed(fn) {
    var a = Date.now();
    var v = fn();
    return { ms: Date.now() - a, v: v };
  }

  // ── Routing: which page does each action serve, and is it public? ────────
  function route(params) {
    try {
      var out = doGet({ parameter: params });
      var s = out.getContent();
      var m = s.match(/<title[^>]*>([^<]*)<\/title>/i);
      return { bytes: s.length, title: m ? m[1] : '' };
    } catch (e) { return { error: String(e).substring(0, 90) }; }
  }

  var bare = route({});
  ok('bare root serves the PIN login', /login/i.test(bare.title), bare.title);

  var qr = route({ zone: 'Z-07' });
  ok('QR zone opens Quick Audit', /quick ?audit/i.test(qr.title), qr.title);

  var bad = route({ zone: 'Z-99' });
  ok('unknown zone opens no audit', !/quick ?audit/i.test(bad.title), bad.title);

  var daily = route({ zone: 'Z-07', type: 'daily' });
  ok('explicit type wins over implied audit', !/quick ?audit/i.test(daily.title), daily.title);

  // ── Row counts: what each record page will actually render ──────────────
  var EXPECT = { AUDIT: 27, NC: 34, TASK: 127, GEMBA: 11, KAIZEN: 13 };
  var counts = {};
  Object.keys(EXPECT).forEach(function (t) {
    var r = getActionListFast({ type: t });
    counts[t] = (r.items || []).length;
    ok(t + ' page has rows', counts[t] === EXPECT[t], counts[t] + ' (want ' + EXPECT[t] + ')');
  });

  /* A page rendering zero rows is the failure that slipped through twice, so
     it is asserted on its own rather than only via the per-type counts. */
  var empties = Object.keys(counts).filter(function (t) { return counts[t] === 0; });
  ok('no record type is empty', empties.length === 0, empties.join(',') || 'none');

  // ── Cache: hit, miss, reuse, and invalidation on write ──────────────────
  invalidateActionListCache_();
  var cold = timed(function () { return getActionListFast({ type: 'AUDIT' }); });
  ok('cold read rebuilds', cold.v.cached === false, cold.ms + 'ms');

  var warm = timed(function () { return getActionListFast({ type: 'AUDIT' }); });
  ok('warm read hits the cache', warm.v.cached === true, warm.ms + 'ms');
  ok('warm read is much faster', warm.ms < cold.ms / 3, warm.ms + 'ms vs ' + cold.ms + 'ms');

  var other = timed(function () { return getActionListFast({ type: 'TASK' }); });
  ok('a second type reuses the same entry', other.v.cached === true, other.ms + 'ms');

  v2InvalidateCache('TaskBoard', null);
  var afterWrite = getActionListFast({ type: 'TASK' });
  ok('a write drops the cache', afterWrite.cached === false, 'cached=' + afterWrite.cached);
  ok('rows survive the invalidation', (afterWrite.items || []).length === EXPECT.TASK,
     (afterWrite.items || []).length);

  var w = warmActionListCache();
  ok('the warmer succeeds', w.ok === true, w.ms + 'ms, n=' + w.n);

  // ── Payload headroom: the cache silently stops working past 100 KB ──────
  /* The payload is chunked now, so 100 KB is no longer a cliff. It is still
     worth watching: every 60 KB adds a key to the read, and CacheService caps
     a putAll batch too. Flag well before either becomes a problem. */
  var bytes = JSON.stringify(getUnifiedActionList({})).length;
  ok('payload size is sane', bytes < 500000,
     bytes + ' bytes across ' + Math.ceil(bytes / 60000) + ' chunk(s)');

  var failed = R.filter(function (r) { return !r.pass; });
  return {
    passed: R.length - failed.length,
    failed: failed.length,
    failures: failed,
    all: R
  };
}
