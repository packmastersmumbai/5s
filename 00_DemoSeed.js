/**
 * 00_DemoSeed.js — Demo/test data seeder for all 28 zones.
 * Run via: clasp run seedDemoData
 *
 * Steps:
 *  1. refreshConfig() — rewrites ZONE_CONFIG ScriptProperty to all 28 zones
 *  2. Seeds Summary (3 months), NC_CAPA, RedTags with realistic demo data
 *
 * Idempotent: clears prior demo rows (keeps headers) before writing.
 * Note: Node E2E files (e2e-*.js) are excluded from clasp via .claspignore.
 */
function listSheetNames() {
  var ss = v2GetSpreadsheet_();
  return ss.getSheets().map(function(s) {
    return s.getName() + ' (' + s.getLastRow() + 'r/' + s.getLastColumn() + 'c)';
  }).join(' | ');
}

/** Remove any RedTagRegister rows whose item description starts with 'E2E_TEST'
 *  (created by the interaction E2E). Idempotent. Returns count deleted. */
function deleteTestRedTags() {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('RedTagRegister');
  if (!sh || sh.getLastRow() < 2) return 'deleted 0';
  var data = sh.getDataRange().getValues();
  var deleted = 0;
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][RT_COL.ITEM_DESC] || '').indexOf('E2E_TEST') === 0) {
      sh.deleteRow(r + 1);
      deleted++;
    }
  }
  try { clearAnalyticsCache(); } catch (e) {}
  return 'deleted ' + deleted;
}

function checkSummaryZones() {
  var ss = v2GetSpreadsheet_();
  var d = ss.getSheetByName('Summary').getDataRange().getValues();
  var valid = {}, bad = [];
  d.slice(1).forEach(function(r) {
    if (!r[0]) return;
    var m = String(r[1]);
    if (/^\d{4}-\d{2}$/.test(m) && Number(r[2]) >= 0 && Number(r[2]) <= 100) valid[r[0]] = true;
    else bad.push(r[0] + '|' + m + '|' + r[2]);
  });
  return 'validZones=' + Object.keys(valid).length + ' badRows=' + bad.length +
         ' samples: ' + bad.slice(0, 6).join(' , ');
}

function seedDemoData() {
  refreshConfig();

  var ss = v2GetSpreadsheet_();
  var zoneIds = getAllZoneIds();           // 28 zones after refresh
  var zoneConfig = getZoneConfig();

  var now = new Date();
  function ym(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  var months = [];
  for (var m = 2; m >= 0; m--) {
    months.push(ym(new Date(now.getFullYear(), now.getMonth() - m, 1)));
  }

  // Deterministic pseudo-random from zone index so reruns are stable
  function seedScore(zi, mi, pillar) {
    var base = 60 + ((zi * 7 + pillar * 3 + mi * 5) % 35);   // 60..94
    return Math.min(95, base + mi * 2);                       // slight upward trend
  }

  // ---- Summary ----
  var sumSh = ss.getSheetByName('Summary');
  if (sumSh.getLastRow() > 1) {
    sumSh.getRange(2, 1, sumSh.getLastRow() - 1, sumSh.getLastColumn()).clearContent();
  }
  var sumRows = [];
  zoneIds.forEach(function(zid, zi) {
    months.forEach(function(mo, mi) {
      var s = [];
      var overall = 0;
      for (var p = 1; p <= 5; p++) { s[p] = seedScore(zi, mi, p); overall += s[p]; }
      overall = Math.round(overall / 5 * 10) / 10;
      var openNcs = (zi % 4 === 0) ? 2 : (zi % 3 === 0 ? 1 : 0);
      var closedNcs = (zi % 5 === 0) ? 3 : 1;
      var activeRt = (zi % 6 === 0) ? 2 : 0;
      var prevOverall = mi > 0 ? null : null;
      var zed = overall >= 80 ? 'ZED-3' : overall >= 60 ? 'ZED-2' : 'ZED-1';
      var delta = mi === 0 ? '' : 2;
      sumRows.push([
        zid, mo, overall, 4,
        s[1], s[2], s[3], s[4], s[5],
        openNcs, closedNcs, 0, activeRt, zed, delta
      ]);
    });
  });
  // Reset stale formatting (old date formats stored scores as 1900 dates), then
  // force month column (B) to plain text so "2026-06" is not coerced to a Date.
  sumSh.getRange(2, 1, sumRows.length, 15).setNumberFormat('General');
  sumSh.getRange(2, 2, sumRows.length, 1).setNumberFormat('@');
  sumSh.getRange(2, 1, sumRows.length, 15).setValues(sumRows);

  // ---- NC_CAPA (20 cols) ----
  var ncSh = ss.getSheetByName('NC_CAPA');
  if (ncSh.getLastRow() > 1) {
    ncSh.getRange(2, 1, ncSh.getLastRow() - 1, ncSh.getLastColumn()).clearContent();
  }
  var ncRows = [];
  var ncDescs = [
    'Unnecessary items found on floor', 'Tools not returned to shadow board',
    'Spillage near machine base', 'Labels missing on bins',
    'Walkway markings faded', 'Daily checklist not signed'
  ];
  var pillars = ['S1', 'S2', 'S3', 'S4', 'S5'];
  var sqcdpByPillar = { S1: 'S', S2: 'Q', S3: 'C', S4: 'D', S5: 'P' };
  var ncSeq = 0;
  zoneIds.forEach(function(zid, zi) {
    var ncCount = (zi % 3 === 0) ? 2 : 1;            // 1-2 NCs per zone
    for (var k = 0; k < ncCount; k++) {
      ncSeq++;
      var pillar = pillars[(zi + k) % 5];
      var criterion = pillar + '-C' + ((zi + k) % 4 + 1);
      var created = new Date(now.getFullYear(), now.getMonth(), 1 + ((zi + k) % 20));
      var isOverdue = (zi + k) % 2 === 0;
      var target = new Date(now.getTime() + (isOverdue ? -5 : 10) * 86400000);
      var closed = (zi % 5 === 0 && k === 0);
      var status = closed ? 'CLOSED' : (k === 1 ? 'IN_PROGRESS' : 'OPEN');
      ncRows.push([
        'NC-' + ('000' + ncSeq).slice(-4),                 // 0 NC_ID
        created,                                            // 1 CREATED_DATE
        zid,                                                // 2 ZONE_ID
        (zoneConfig[zid] && zoneConfig[zid].name) || zid,   // 3 ZONE_NAME
        created,                                            // 4 AUDIT_DATE
        criterion,                                          // 5 PILLAR (criterion id)
        ncDescs[(zi + k) % ncDescs.length],                 // 6 DESCRIPTION
        2,                                                  // 7 SCORE_GIVEN
        'auditor',                                          // 8 AUDITOR
        '',                                                 // 9 ROOT_CAUSE
        'Corrective action assigned',                       // 10 CORRECTIVE_ACTION
        '',                                                 // 11 PREVENTIVE_ACTION
        (zoneConfig[zid] && zoneConfig[zid].leader) || 'Owner', // 12 RESPONSIBLE
        target,                                             // 13 TARGET_DATE
        status,                                             // 14 STATUS
        closed ? new Date() : '',                           // 15 CLOSURE_DATE
        '',                                                 // 16 VERIFIED_BY
        '',                                                 // 17 VERIFICATION_REMARKS
        (zi % 7 === 0) ? 'true' : 'false',                  // 18 IS_REPEAT
        (zi % 7 === 0) ? 1 : 0                               // 19 RECURRENCE_COUNT
      ]);
    }
  });
  ncSh.getRange(2, 1, ncRows.length, 20).setValues(ncRows);

  // ---- RedTagRegister (19 cols, RT_COL) — the REAL red tag sheet ----
  var rtSh = ss.getSheetByName('RedTagRegister');
  var rtRows = [];
  if (rtSh) {
    if (rtSh.getLastRow() > 1) {
      rtSh.getRange(2, 1, rtSh.getLastRow() - 1, rtSh.getLastColumn()).clearContent();
    }
    var rtItems = ['Broken pallet', 'Obsolete fixture', 'Unused drum', 'Old signage', 'Scrap cabling'];
    var rtSeq = 0;
    zoneIds.forEach(function(zid, zi) {
      if (zi % 4 !== 0) return;                 // red tags in ~1/4 of zones
      rtSeq++;
      var disposed = (zi % 8 === 0);
      rtRows.push([
        'RT-' + ('000' + rtSeq).slice(-4),                     // 0 TAG_ID
        new Date(now.getTime() - 3 * 86400000),                // 1 CREATED
        zid,                                                   // 2 ZONE_ID
        (zoneConfig[zid] && zoneConfig[zid].name) || zid,      // 3 ZONE_NAME
        rtItems[zi % rtItems.length],                          // 4 ITEM_DESC
        'Equipment',                                           // 5 ITEM_CATEGORY
        5000,                                                  // 6 EST_VALUE
        'Dispose to scrap yard',                               // 7 PROPOSED_ACTION
        '',                                                    // 8 PHOTO_URL
        '',                                                    // 9 PHOTO_FILE_ID
        'worker',                                              // 10 TAGGED_BY
        (zoneConfig[zid] && zoneConfig[zid].leader) || 'Owner',// 11 OWNER
        new Date(now.getTime() + 7 * 86400000),                // 12 DEADLINE
        disposed ? 'Scrap' : '',                               // 13 DISPOSITION
        disposed ? new Date() : '',                            // 14 DISPOSED_DATE
        disposed ? 'manager' : '',                             // 15 DISPOSED_BY
        '',                                                    // 16 REVIEW_NOTES
        disposed ? 'Disposed' : 'Open',                        // 17 STATUS
        ''                                                     // 18 REMARKS
      ]);
    });
    if (rtRows.length) rtSh.getRange(2, 1, rtRows.length, 19).setValues(rtRows);
  }

  // Clear cached analytics so pages recompute
  try { clearAnalyticsCache(); } catch (e) {}

  return 'Seeded ' + zoneIds.length + ' zones | Summary ' + sumRows.length +
         ' rows | NC ' + ncRows.length + ' | RedTags ' + rtRows.length;
}
