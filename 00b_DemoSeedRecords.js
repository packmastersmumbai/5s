/**
 * 00b_DemoSeedRecords.js — demo Gemba walks, Kaizen suggestions and audits.
 *
 * Why this exists separately from 00_DemoSeed.js: that seeder covers Summary,
 * NC_CAPA and RedTags. Nothing ever seeded the three record types that were
 * only just made visible in the records list, so there was no way to see how
 * they render without waiting for real ones.
 *
 * Rows carry REAL staff names and real zone activities, because seeded rows
 * are read by the same people whose names they carry: invented surnames that
 * shadowed real staff (an "Anuj Sharma" beside the real Anuj Pathak, a
 * "Khushi Patel" beside Khushi Paswan) made the list look like a data-entry
 * error rather than a demo.
 *
 * Removal is by ID PREFIX — GW-DEMO-, KZ-DEMO-, demo- — never by name, so
 * cleanup stays exact even though nothing user-visible says "demo":
 *   clasp run seedDemoRecords     — create
 *   clasp run purgeDemoRecords    — remove exactly what was created
 *
 * The Gemba walks matter most here: the seven live walks all carry
 * responses_json "{}" (counts but no per-question answers), so the findings
 * block on the record view had nothing to draw. These write real answers
 * against the CURRENT question config, so findings render as intended.
 */

var DEMO_TAG = "[demo]";

/* Kept for any legacy row still carrying the tag, and for _isDemo_ below.
   NOT applied to new rows: it appeared in kaizen titles and owner names on
   screen, so every seeded record read as clutter in a live list. Identity now
   comes from the ID prefix, which is what purgeDemoRecords already matched. */
function _demoMark_(s) { return String(s || ""); }
function _isDemo_(s) { return String(s || "").indexOf(DEMO_TAG) > -1; }

/** n days ago, at a plausible shift hour. */
function _demoDate_(daysAgo, hour) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour || 10, (daysAgo * 7) % 60, 0, 0);
  return d;
}

// ────────────────────────────────────────────────────────────────────────────
//  GEMBA WALKS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Writes walks whose responses are real question ids drawn from the live
 * GEMBA_WALK_CONFIG, so the record view resolves them to question text rather
 * than falling back to bare ids.
 */
function seedDemoGembaWalks() {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("GembaWalks");
  if (!sheet) return "GembaWalks sheet not found";

  var cfg = {};
  try {
    cfg = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty("GEMBA_WALK_CONFIG") || "{}");
  } catch (e) { return "GEMBA_WALK_CONFIG unreadable: " + e.message; }

  var types = Object.keys(cfg);
  if (!types.length) return "GEMBA_WALK_CONFIG is empty — run the setup first";

  /* Spread across walk types, zones and scores so the list shows a range
     rather than three identical rows. failEvery: 1 = every question fails,
     4 = one in four, 0 = a clean walk. */
  var plan = [
    { type: types[0], zone: "Z-04", walker: "Rajesh Kumar",   daysAgo: 2,  failEvery: 3 },
    { type: types[Math.min(1, types.length - 1)], zone: "Z-08", walker: "Anuj Pathak",   daysAgo: 5,  failEvery: 5 },
    { type: types[Math.min(2, types.length - 1)], zone: "Z-16", walker: "Khushi Paswan", daysAgo: 9,  failEvery: 0 },
    { type: types[Math.min(3, types.length - 1)], zone: "Z-21", walker: "Santosh Maurya", daysAgo: 14, failEvery: 2 }
  ];

  var written = [];
  plan.forEach(function (p, idx) {
    var qs = cfg[p.type] || [];
    if (!qs.length) return;

    var responses = {}, yes = 0, no = 0, na = 0;
    qs.forEach(function (q, i) {
      var a;
      if (p.failEvery === 0)               a = (i % 9 === 8) ? "na" : "yes";
      else if ((i + 1) % p.failEvery === 0) a = "no";
      else if (i % 7 === 6)                 a = "na";
      else                                  a = "yes";
      responses[q.questionId] = a;
      if (a === "yes") yes++; else if (a === "no") no++; else na++;
    });

    var answered = yes + no;
    var pct = answered > 0 ? Math.round((yes / answered) * 100) : 0;
    var when = _demoDate_(p.daysAgo, 9 + idx);
    var walkId = "GW-DEMO-" + Utilities.formatDate(when, TZ, "yyyyMMdd") + "-" + (idx + 1);

    var row = [];
    row[GW_COL.WALK_ID] = walkId;
    row[GW_COL.TIMESTAMP] = when;
    row[GW_COL.WALK_TYPE] = p.type;
    row[GW_COL.WALKER_NAME] = _demoMark_(p.walker);
    row[GW_COL.WALKER_EMAIL] = "";
    row[GW_COL.ZONE_ID] = p.zone;
    row[GW_COL.ZONE_NAME] = v2GetZoneName_(p.zone);
    row[GW_COL.RESPONSES_JSON] = JSON.stringify(responses);
    row[GW_COL.OBSERVATIONS] = no > 0
      ? _demoMark_("Walked the line with the shift in-charge; " + no + " item(s) need follow-up.")
      : _demoMark_("Walked the line with the shift in-charge; zone in good order.");
    row[GW_COL.TASK_IDS_JSON] = "[]";
    row[GW_COL.PHOTO_URLS] = "";
    row[GW_COL.TOTAL_Q] = qs.length;
    row[GW_COL.YES_COUNT] = yes;
    row[GW_COL.NO_COUNT] = no;
    row[GW_COL.NA_COUNT] = na;
    row[GW_COL.COMPLIANCE_PCT] = pct;
    sheet.appendRow(row);
    written.push(walkId + " " + p.type + " " + pct + "% (" + no + " fail of " + qs.length + ")");
  });

  return "Gemba walks written: " + written.length + "\n" + written.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
//  KAIZEN
// ────────────────────────────────────────────────────────────────────────────

/** Covers the whole lifecycle so every status pill and the savings line show. */
function seedDemoKaizen() {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("KaizenSuggestions");
  if (!sheet) return "KaizenSuggestions sheet not found";

  var plan = [
    { zone: "Z-04", by: "Rajesh Kumar", cat: "Safety", daysAgo: 3,
      title: "Foot-operated bin lids at the packing bench",
      desc: "Operators open bin lids by hand with gloves that have just touched product. A foot pedal keeps hands off the lid entirely.",
      benefit: "Removes a contamination route and saves a glove change each time",
      est: 12000, status: STATUS.SUBMITTED },
    /* Moved out of Z-08 (Wash Bays): pallets are not staged in a wash bay.
       Z-04 Production Area is where the evening despatch is actually built. */
    { zone: "Z-04", by: "Anuj Pathak", cat: "Delivery", daysAgo: 12,
      title: "Pre-staged pallet lanes for the evening despatch",
      desc: "Loading waits while pallets are found. Marking three lanes and staging by route the shift before removes the search.",
      benefit: "Target 20 minutes off each evening load",
      est: 45000, status: STATUS.APPROVED, reviewer: "Manoj Tiwari", assigned: "Anuj Pathak", targetDays: 10 },
    { zone: "Z-16", by: "Khushi Paswan", cat: "Quality", daysAgo: 26,
      title: "Colour-coded scoops per raw material bin",
      desc: "One scoop is shared between bins, which is how cross-contamination happens. One scoop per bin, colour matched to the bin label.",
      benefit: "Removes cross-contamination risk at the point of use",
      est: 6000, status: STATUS.IMPLEMENTING, reviewer: "Manoj Tiwari", assigned: "Khushi Paswan", targetDays: 5 },
    /* Z-21 is the Maintenance Area, so the idea is framed around what is
       consumed there rather than an assembly line the plant does not have. */
    { zone: "Z-21", by: "Santosh Maurya", cat: "Cost", daysAgo: 48,
      title: "Reuse inner cartons as parts bins on the maintenance bench",
      desc: "Inner cartons are discarded after de-boxing. Cut down they replace the bought parts bins on the maintenance bench and the spares rack.",
      benefit: "Stops a recurring consumable purchase",
      est: 30000, actual: 34500, status: STATUS.COMPLETED,
      reviewer: "Manoj Tiwari", assigned: "Santosh Maurya", targetDays: 14, doneDaysAgo: 6,
      implNotes: "Rolled out on the bench and the spares rack; cartons cut on the existing table.",
      verifiedBy: "Manoj Tiwari" },
    { zone: "Z-12", by: "Harish", cat: "Morale", daysAgo: 64,
      title: "Shift handover board by the canteen door",
      desc: "Handover happens by word of mouth and gets lost. A board on the route everyone already walks makes it visible.",
      benefit: "Fewer repeat questions at shift start",
      est: 8000, actual: 9200, status: STATUS.BENEFIT_VERIFIED,
      reviewer: "Manoj Tiwari", assigned: "Harish", targetDays: 7, doneDaysAgo: 21,
      implNotes: "Board mounted and in daily use since week 2.",
      verifiedBy: "Manoj Tiwari" }
  ];

  var written = [];
  plan.forEach(function (p, idx) {
    var when = _demoDate_(p.daysAgo, 11);
    var kzId = "KZ-DEMO-" + Utilities.formatDate(when, TZ, "yyyyMMdd") + "-" + (idx + 1);
    var row = [];
    for (var i = 0; i <= KZ_COL.VERIFICATION_DATE; i++) row[i] = "";
    row[KZ_COL.KAIZEN_ID] = kzId;
    row[KZ_COL.CREATED] = when;
    row[KZ_COL.ZONE_ID] = p.zone;
    row[KZ_COL.ZONE_NAME] = v2GetZoneName_(p.zone);
    row[KZ_COL.SUBMITTER] = _demoMark_(p.by);
    row[KZ_COL.CATEGORY] = p.cat;
    row[KZ_COL.TITLE] = _demoMark_(p.title);
    row[KZ_COL.DESCRIPTION] = p.desc;
    row[KZ_COL.EXPECTED_BENEFIT] = p.benefit;
    row[KZ_COL.EST_SAVINGS] = p.est;
    row[KZ_COL.STATUS] = p.status;
    if (p.reviewer) { row[KZ_COL.REVIEWER] = p.reviewer; row[KZ_COL.REVIEW_DATE] = _demoDate_(p.daysAgo - 1, 15); }
    if (p.assigned) row[KZ_COL.ASSIGNED_TO] = p.assigned;
    if (p.targetDays) row[KZ_COL.TARGET_DATE] = _demoDate_(p.daysAgo - p.targetDays, 17);
    if (p.doneDaysAgo) row[KZ_COL.COMPLETED_DATE] = _demoDate_(p.doneDaysAgo, 16);
    if (p.actual) row[KZ_COL.ACTUAL_SAVINGS] = p.actual;
    if (p.implNotes) row[KZ_COL.IMPLEMENTATION_NOTES] = p.implNotes;
    if (p.verifiedBy) {
      row[KZ_COL.BENEFIT_VERIFIED_BY] = p.verifiedBy;
      row[KZ_COL.VERIFICATION_DATE] = _demoDate_(Math.max(0, (p.doneDaysAgo || 5) - 3), 16);
    }
    sheet.appendRow(row);
    written.push(kzId + " " + p.status + " est " + p.est + (p.actual ? " actual " + p.actual : ""));
  });

  return "Kaizen written: " + written.length + "\n" + written.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
//  AUDITS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Writes AuditLineItems rows grouped by submission id — the same shape
 * QuickAudit produces, so getRecentAudits/getAuditDetail read them normally.
 */
function seedDemoAudits() {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("AuditLineItems");
  if (!sheet) return "AuditLineItems sheet not found";

  /* Scores chosen to land either side of the record list's priority
     thresholds (<70 HIGH, <85 MEDIUM) so all three colours appear. */
  var plan = [
    { zone: "Z-04", by: "Rajesh Kumar",   daysAgo: 1,  scores: [4,4,3,4,4,3,4,4,4,3,4,4,3,4,4] },
    { zone: "Z-08", by: "Anuj Pathak",    daysAgo: 4,  scores: [3,3,2,3,4,3,3,2,3,3,4,3,3,2,3] },
    { zone: "Z-16", by: "Khushi Paswan",  daysAgo: 8,  scores: [2,2,1,2,3,2,2,1,2,2,3,2,2,1,2] },
    { zone: "Z-21", by: "Santosh Maurya", daysAgo: 15, scores: [4,3,4,4,3,4,4,4,3,4,4,3,4,4,4] }
  ];

  var written = [];
  plan.forEach(function (p, idx) {
    var when = _demoDate_(p.daysAgo, 8 + idx);
    var sid = "demo-" + Utilities.formatDate(when, TZ, "yyyyMMdd") + "-" + (idx + 1);
    var zoneName = v2GetZoneName_(p.zone);
    var rows = [], sum = 0;
    p.scores.forEach(function (sc, i) {
      var pillar = "S" + (Math.floor(i / 3) + 1);
      var critId = pillar + "-" + ((i % 3) + 1);
      sum += sc;
      var r = [];
      r[0]  = sid;
      r[1]  = p.zone;
      r[2]  = zoneName;
      r[3]  = when;
      r[4]  = _demoMark_(p.by);
      r[5]  = critId;
      r[6]  = pillar;
      r[7]  = sc;
      /* A remark only where the score is low — that is where a remark is
         actually expected, and it exercises the detail view's remark line. */
      r[8]  = sc <= 2 ? _demoMark_("Below standard at the time of audit; corrective action needed.") : "";
      r[9]  = "";
      r[10] = "";
      r[11] = "";
      r[12] = "";
      rows.push(r);
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    var pct = Math.round(100 * sum / (p.scores.length * 4));
    written.push(sid + " " + p.zone + " " + pct + "%");
  });

  return "Audits written: " + written.length + "\n" + written.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
//  RUN / PURGE
// ────────────────────────────────────────────────────────────────────────────

/** Seeds all three, then clears the caches the records list reads through. */
function seedDemoRecords() {
  var out = [];
  out.push(seedDemoGembaWalks());
  out.push(seedDemoKaizen());
  out.push(seedDemoAudits());
  try { CacheService.getScriptCache().removeAll(["KANBAN_DATA", "ANALYTICS_KPIS"]); } catch (e) {}
  try { if (typeof clearAnalyticsCache === "function") clearAnalyticsCache(); } catch (e) {}
  var msg = out.join("\n\n");
  Logger.log(msg);
  return msg;
}

/** Removes every row this file created. Matches on the demo tag / id prefix. */
function purgeDemoRecords() {
  var ss = v2GetSpreadsheet_(), removed = [];

  function purge(sheetName, matcher) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) { removed.push(sheetName + ": 0"); return; }
    var data = sh.getDataRange().getValues(), n = 0;
    for (var r = data.length - 1; r >= 1; r--) {
      if (matcher(data[r])) { sh.deleteRow(r + 1); n++; }
    }
    removed.push(sheetName + ": " + n);
  }

  purge("GembaWalks", function (row) {
    return String(row[GW_COL.WALK_ID] || "").indexOf("GW-DEMO-") === 0;
  });
  purge("KaizenSuggestions", function (row) {
    return String(row[KZ_COL.KAIZEN_ID] || "").indexOf("KZ-DEMO-") === 0;
  });
  purge("AuditLineItems", function (row) {
    return String(row[0] || "").indexOf("demo-") === 0;
  });

  try { CacheService.getScriptCache().removeAll(["KANBAN_DATA", "ANALYTICS_KPIS"]); } catch (e) {}
  try { if (typeof clearAnalyticsCache === "function") clearAnalyticsCache(); } catch (e) {}
  var msg = "Purged — " + removed.join(" · ");
  Logger.log(msg);
  return msg;
}
