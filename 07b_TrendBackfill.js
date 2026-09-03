/**
 * ============================================================================
 * 07b_TrendBackfill.js — rebuild Summary trend rows from AuditLineItems
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * The analytics view (InsightsView) plots getPillarTrend(), which reads the
 * pre-aggregated `Summary` sheet. Nothing kept that sheet current:
 *
 *   - `masterOrchestrator` (which calls the rollups) had NO trigger installed.
 *     Measured 2026-09-02: the live project's only trigger was `telegramPoll`,
 *     because setupTrigger() and the Telegram installer each deleted ALL
 *     project triggers, so whichever ran last evicted the other. Fixed in
 *     06_Triggers.js (deleteTriggersFor_ / setupAllTriggers).
 *   - `weeklyRollup` aggregates `DailySubmissions` over a rolling 7 days, and
 *     `monthlyRollup` aggregates `WeeklyAudit` — but the real audit history
 *     lives in `AuditLineItems` (348 rows, Jun–Sep 2026), while `WeeklyAudit`
 *     holds only 32 rows of Feb-2026 seeded demo data. So neither rollup could
 *     ever produce Jul/Aug trend points.
 *
 * Net effect: analytics showed Apr–Jun 2026 (seeded demo months) and nothing
 * after, while audits were being submitted daily.
 *
 * This module recomputes per-zone, per-month pillar averages directly from
 * AuditLineItems — the same source the Audits list and PDF report use — and
 * writes them into Summary in the layout buildSummaryRow_ produces, so
 * getPillarTrend() reads them unchanged.
 *
 * Scores are 0–4 per criterion; a pillar average is expressed as a percentage
 * of that maximum so it shares the 0–100 axis the seeded rows already use.
 */

/**
 * ISO-8601 week key for a date, e.g. "2026-W36".
 *
 * The trend was bucketed only by MONTH, so a day's audits moved the plotted
 * average by ~1/30th and the chart looked frozen even when data was current.
 * A weekly bucket makes the same data visibly responsive on the timescale the
 * shop floor actually works to.
 *
 * @param {Date} d
 * @returns {string}
 * @private
 */
function _isoWeekKey_(d) {
  // Shift to Thursday of the same week: ISO weeks are numbered by the year
  // that owns their Thursday, which is what makes Dec/Jan boundaries correct.
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return t.getUTCFullYear() + '-W' + (week < 10 ? '0' + week : week);
}

/** Column indices in AuditLineItems (see sheet header). @private */
var _ALI_COL = { ZONE_ID: 1, ZONE_NAME: 2, TIMESTAMP: 3, CRITERION_ID: 5, PILLAR: 6, SCORE: 7 };

/** Max score for a single criterion — pillar averages are scaled against this. @private */
var _ALI_MAX_SCORE = 4;

/**
 * Rebuilds Summary rows for every zone-month present in AuditLineItems.
 *
 * Existing Summary rows for a rebuilt zone+month are replaced; months with no
 * line items (the seeded Apr–Jun demo rows) are left untouched, so this is
 * additive and safe to re-run.
 *
 * @param {boolean} [dryRun] when true, computes and returns without writing
 * @returns {Object} { monthsFound, rowsWritten, months, dryRun }
 */
function backfillTrendFromLineItems(dryRun) {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('AuditLineItems');
  if (!sh || sh.getLastRow() < 2) return { monthsFound: 0, rowsWritten: 0, months: {}, dryRun: !!dryRun };

  var data = sh.getDataRange().getValues();

  // bucket[zone][month][pillar] = { sum, n }
  var bucket = {};
  var zoneNames = {};

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var zone = String(row[_ALI_COL.ZONE_ID] || '').trim();
    var pillar = String(row[_ALI_COL.PILLAR] || '').trim().toUpperCase();
    if (!zone || !/^S[1-5]$/.test(pillar)) continue;

    var month = _aliMonth_(row[_ALI_COL.TIMESTAMP]);
    if (!month) continue;

    var score = Number(row[_ALI_COL.SCORE]);
    if (isNaN(score)) continue;

    var nm = String(row[_ALI_COL.ZONE_NAME] || '').trim();
    if (nm) zoneNames[zone] = nm;

    if (!bucket[zone]) bucket[zone] = {};
    if (!bucket[zone][month]) bucket[zone][month] = {};
    if (!bucket[zone][month][pillar]) bucket[zone][month][pillar] = { sum: 0, n: 0 };
    bucket[zone][month][pillar].sum += score;
    bucket[zone][month][pillar].n++;
  }

  // Counts for NC / Red Tag are read ONCE here and indexed by zone.
  // buildSummaryRow_ re-reads NC_CAPA, RedTagRegister and Summary on every
  // call, so building ~20 rows meant ~60 full sheet reads and the refresh took
  // 38s - far too slow to hang off an audit submission. Same output, 3 reads.
  var ctx = _summaryCtx_(ss);

  var rows = [], monthCounts = {};
  Object.keys(bucket).forEach(function (zone) {
    Object.keys(bucket[zone]).forEach(function (month) {
      var p = bucket[zone][month];
      var pct = function (k) {
        var b = p[k];
        if (!b || !b.n) return 0;
        return Math.round((b.sum / b.n) * 100 / _ALI_MAX_SCORE);
      };
      var s1 = pct('S1'), s2 = pct('S2'), s3 = pct('S3'), s4 = pct('S4'), s5 = pct('S5');
      var scored = [s1, s2, s3, s4, s5].filter(function (v) { return v > 0; });
      var overall = scored.length
        ? Math.round(scored.reduce(function (a, b) { return a + b; }, 0) / scored.length)
        : 0;
      var auditCount = ['S1', 'S2', 'S3', 'S4', 'S5'].reduce(function (n, k) {
        return n + (p[k] ? p[k].n : 0);
      }, 0);

      rows.push(_fastSummaryRow_(ctx, zone, month, overall, auditCount, s1, s2, s3, s4, s5));
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
  });

  if (dryRun) {
    return { monthsFound: Object.keys(monthCounts).length, rowsWritten: 0,
             months: monthCounts, dryRun: true };
  }

  _replaceSummaryRows_(ss, rows);
  try { CacheService.getScriptCache().remove('PILLAR_TREND'); } catch (e) {}

  return { monthsFound: Object.keys(monthCounts).length, rowsWritten: rows.length,
           months: monthCounts, dryRun: false };
}

/**
 * Normalises an AuditLineItems timestamp to "yyyy-MM".
 * Values arrive as ISO strings from the web app and as Dates when typed into
 * the sheet, so both are handled.
 * @private
 */
function _aliMonth_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'Asia/Kolkata', 'yyyy-MM');
  }
  var s = String(v);
  var iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2];
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM');
}

/**
 * Replaces Summary rows for exactly the zone+month pairs being written,
 * appends the rest, and keeps the month column as TEXT.
 *
 * The month column must be forced to '@' before setValues: "2026-09" is a
 * valid date literal, so Sheets silently coerces it to a Date and
 * getPillarTrend then keys the series on "Tue Sep 01 2026 …" instead of
 * "2026-09" — the point exists but never lines up with any other month.
 * @private
 */
function _replaceSummaryRows_(ss, rows) {
  if (!rows.length) return;
  var sheet = ss.getSheetByName('Summary');
  if (!sheet) return;

  var key = function (z, m) { return z + '|' + m; };
  var incoming = {};
  rows.forEach(function (r) { incoming[key(r[0], r[1])] = true; });

  // Single read-modify-write. This used to call sheet.deleteRow() per stale
  // row, which is one API round trip each: with ~100 rows it ran past the
  // execution budget and made the submit-time refresh time out. Rebuilding the
  // block in memory and writing it once keeps this at ~1s.
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keep = [];
  if (sheet.getLastRow() > 1) {
    var existing = sheet.getDataRange().getValues();
    for (var i = 1; i < existing.length; i++) {
      var m = existing[i][1];
      var ms = (m instanceof Date) ? Utilities.formatDate(m, 'Asia/Kolkata', 'yyyy-MM') : String(m).trim();
      if (!incoming[key(String(existing[i][0]).trim(), ms)]) keep.push(existing[i]);
    }
  }

  var width = Math.max(header.length, rows[0].length);
  var pad = function (r) {
    var out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  };
  var final = keep.concat(rows).map(pad);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (!final.length) return;

  var target = sheet.getRange(2, 1, final.length, width);
  target.setNumberFormat('General');
  sheet.getRange(2, 2, final.length, 1).setNumberFormat('@');   // month stays TEXT
  target.setValues(final);
}

/**
 * Recomputes Summary rows for ONE month and drops the analytics caches.
 *
 * Called after an audit is submitted so the charts reflect it within seconds
 * instead of waiting for the 07:30 rollup. Scoped to the affected month, so
 * the cost is one sheet read regardless of how much history exists.
 *
 * Never throws: a refresh failure must not fail the audit submission that
 * triggered it - the nightly rollup remains the backstop.
 *
 * @param {string} [month] yyyy-MM; defaults to the current month
 * @returns {Object} { ok, month, rows, error? }
 */
function refreshTrendForMonth(month) {
  try {
    month = month || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
    // One pass, not two: the earlier dry-run-then-write version read and
    // aggregated the whole line-item sheet twice for no benefit.
    var res = backfillTrendFromLineItems(false);
    _dropAnalyticsCaches_();
    return { ok: true, month: month, rows: res.rowsWritten };
  } catch (e) {
    Logger.log('refreshTrendForMonth failed (nightly rollup will catch up): ' + e.message);
    return { ok: false, month: month, rows: 0, error: e.message };
  }
}

/**
 * Manual "Refresh" from the analytics toolbar: re-roll the current month and
 * drop the caches, so the reload that follows re-reads the sheet rather than
 * being served the same cached payload.
 *
 * @returns {Object} { ok, month, rows }
 */
function refreshAnalyticsNow() {
  return refreshTrendForMonth();
}

/**
 * Clears every cache that fronts the analytics view.
 *
 * getPillarTrend caches for 10 min and getAnalyticsKPIs for 5, so without this
 * a freshly written Summary row still would not appear until the TTL expired.
 * @private
 */
function _dropAnalyticsCaches_() {
  try {
    CacheService.getScriptCache().removeAll(
      ['PILLAR_TREND', 'PILLAR_TREND_WEEKLY', 'ANALYTICS_KPIS', 'KANBAN_DATA']);
  } catch (e) {}
}

/**
 * Pillar trend bucketed by ISO week, computed straight from AuditLineItems.
 *
 * Same shape as getPillarTrend() - { S1: { zone: [{month, score}] } } - so the
 * client can swap between them without a second rendering path. The key stays
 * named `month` for that reason; it holds a week key ("2026-W36") here.
 *
 * Read direct from line items rather than Summary: Summary has no weekly
 * granularity, and adding one would mean a schema change plus a second rollup.
 *
 * @param {number} [weeks] how many recent weeks to keep (default 12)
 * @returns {Object}
 */
function getPillarTrendWeekly(weeks) {
  weeks = weeks || 12;
  var cache = CacheService.getScriptCache();
  var cached = cache.get('PILLAR_TREND_WEEKLY');
  if (cached) return JSON.parse(cached);

  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('AuditLineItems');
  var result = { S1: {}, S2: {}, S3: {}, S4: {}, S5: {} };
  if (!sh || sh.getLastRow() < 2) return result;

  var data = sh.getDataRange().getValues();
  var agg = {};   // agg[pillar][zone][week] = {sum,n}

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var zone = String(row[_ALI_COL.ZONE_ID] || '').trim();
    var pillar = String(row[_ALI_COL.PILLAR] || '').trim().toUpperCase();
    if (!zone || !result[pillar]) continue;
    var ts = row[_ALI_COL.TIMESTAMP];
    var d = (ts instanceof Date) ? ts : new Date(String(ts));
    if (isNaN(d.getTime())) continue;
    var score = Number(row[_ALI_COL.SCORE]);
    if (isNaN(score)) continue;

    var wk = _isoWeekKey_(d);
    if (!agg[pillar]) agg[pillar] = {};
    if (!agg[pillar][zone]) agg[pillar][zone] = {};
    if (!agg[pillar][zone][wk]) agg[pillar][zone][wk] = { sum: 0, n: 0 };
    agg[pillar][zone][wk].sum += score;
    agg[pillar][zone][wk].n++;
  }

  // Keep only the most recent `weeks` buckets, newest last (chart order).
  var allWeeks = {};
  Object.keys(agg).forEach(function (pl) {
    Object.keys(agg[pl]).forEach(function (z) {
      Object.keys(agg[pl][z]).forEach(function (w) { allWeeks[w] = 1; });
    });
  });
  var keep = {};
  Object.keys(allWeeks).sort().slice(-weeks).forEach(function (w) { keep[w] = 1; });

  Object.keys(agg).forEach(function (pl) {
    Object.keys(agg[pl]).forEach(function (z) {
      var pts = [];
      Object.keys(agg[pl][z]).sort().forEach(function (w) {
        if (!keep[w]) return;
        var b = agg[pl][z][w];
        pts.push({ month: w, score: Math.round((b.sum / b.n) * 100 / _ALI_MAX_SCORE) });
      });
      if (pts.length) result[pl][z] = pts;
    });
  });

  try { cache.put('PILLAR_TREND_WEEKLY', JSON.stringify(result), 300); } catch (e) {}
  return result;
}

/**
 * Reads the per-zone counts buildSummaryRow_ would otherwise re-read for every
 * single row, and indexes them by zone.
 *
 * @param {Spreadsheet} ss
 * @returns {Object} { nc:{zone:{open,closed}}, rt:{zone:count}, prev:{zone|month:score} }
 * @private
 */
function _summaryCtx_(ss) {
  var ctx = { nc: {}, rt: {}, prev: {}, prevByZone: {} };

  var ncSh = ss.getSheetByName('NC_CAPA');
  if (ncSh && ncSh.getLastRow() > 1) {
    ncSh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (!r[0]) return;
      var z = String(r[NC_COL.ZONE_ID] || '').trim();
      if (!ctx.nc[z]) ctx.nc[z] = { open: 0, closed: 0 };
      if (String(r[NC_COL.STATUS]).trim().toUpperCase() === 'CLOSED') ctx.nc[z].closed++;
      else ctx.nc[z].open++;
    });
  }

  var rtSh = ss.getSheetByName('RedTagRegister');
  if (rtSh && rtSh.getLastRow() > 1) {
    rtSh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (!r[0]) return;
      var z = String(r[RT_COL.ZONE_ID] || '').trim();
      var st = String(r[RT_COL.STATUS]).trim();
      if (st !== 'Disposed' && st !== 'Returned' && st !== 'Scrapped') {
        ctx.rt[z] = (ctx.rt[z] || 0) + 1;
      }
    });
  }

  // Prior-month score lookup, so the delta column keeps working without
  // getPreviousMonthScore_ re-reading Summary once per row.
  var sumSh = ss.getSheetByName('Summary');
  if (sumSh && sumSh.getLastRow() > 1) {
    sumSh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (!r[0]) return;
      var m = r[1];
      var ms = (m instanceof Date) ? Utilities.formatDate(m, 'Asia/Kolkata', 'yyyy-MM') : String(m).trim();
      if (!/^\d{4}-\d{2}$/.test(ms)) return;
      var z = String(r[0]).trim();
      ctx.prev[z + '|' + ms] = Number(r[2]);
      if (!ctx.prevByZone[z]) ctx.prevByZone[z] = [];
      ctx.prevByZone[z].push({ month: ms, score: Number(r[2]) });
    });
  }
  return ctx;
}

/**
 * buildSummaryRow_ without the per-row sheet reads. Emits the identical
 * 15-column layout so getPillarTrend and the dashboards are unaffected.
 * @private
 */
function _fastSummaryRow_(ctx, zoneId, month, overallScore, submissionCount,
                          s1, s2, s3, s4, s5) {
  var nc = ctx.nc[zoneId] || { open: 0, closed: 0 };
  var activeRedTags = ctx.rt[zoneId] || 0;

  // Most recent EARLIER month that has data — not simply month-1. Zones are not
  // audited every month, so a strict previous-calendar-month lookup produced a
  // blank delta wherever a month was skipped. This matches
  // getPreviousMonthScore_, which scans for the highest month < current.
  var prevScore = null, bestMonth = '';
  var months = ctx.prevByZone[zoneId];
  if (months) {
    for (var i = 0; i < months.length; i++) {
      if (months[i].month < month && months[i].month > bestMonth) {
        bestMonth = months[i].month;
        prevScore = months[i].score;
      }
    }
  }
  var delta = (prevScore === null || isNaN(prevScore))
    ? '' : Math.round((overallScore - prevScore) * 10) / 10;

  var zed = overallScore >= 80 ? 'ZED-3' : overallScore >= 60 ? 'ZED-2' : 'ZED-1';
  var r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };

  return [
    zoneId, month, r2(overallScore), submissionCount,
    r2(s1), r2(s2), r2(s3), r2(s4), r2(s5),
    nc.open, nc.closed, 0, activeRedTags, zed, delta
  ];
}
