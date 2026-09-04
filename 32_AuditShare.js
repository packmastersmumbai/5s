/**
 * ============================================================================
 * 32_AuditShare.js — PackMasters 5S
 * Share a completed audit: generate a PDF (Sheet-tab → export URL → Drive) and
 * a WhatsApp deep link. Ported from Pack Masters MMT (savePDFtoDriveAndGetUrl).
 *
 * No API/token for WhatsApp (wa.me deep link). PDF auth uses the script's own
 * OAuth token. PDFs are stored in the zone's existing Drive folder (Phase 1).
 * ============================================================================
 */

var AUDIT_SLIP_SHEET = "AUDIT_SLIP_VIEW";

/**
 * Generate (or reuse) the PDF for a submitted audit + build a WhatsApp share link.
 * @param {string} submissionId
 * @returns {Object} { success, pdfUrl, waUrl, overall, ncCount } or { success:false, message }
 */
function generateAuditPdf(submissionId) {
  return v2SafeExecute_(function () {
    var detail = getAuditDetail(submissionId);
    if (!detail || !detail.found) return { success: false, message: "Audit not found: " + submissionId };

    var ss = v2GetSpreadsheet_();
    var zoneId = detail.header.zoneId;
    var zoneCfg = (typeof getZoneConfig === "function" ? getZoneConfig()[zoneId] : null) || {};

    // overall % + per-pillar from line items
    var sum = 0, max = 0, byPillar = {};
    detail.items.forEach(function (it) {
      if (it.score == null) return;
      sum += it.score; max += 4;
      var p = it.pillar || "?";
      if (!byPillar[p]) byPillar[p] = { sum: 0, n: 0 };
      byPillar[p].sum += it.score; byPillar[p].n++;
    });
    var overall = max > 0 ? Math.round(100 * sum / max) : 0;
    var ncCount = detail.items.filter(function (it) { return it.score != null && it.score <= 1; }).length;

    var slipName = "Audit_" + zoneId + "_" + _auditDateSlug_(detail.header.timestamp);

    // reuse cached pdf if present in the zone folder
    var folderId = zoneCfg.driveFolderId;
    var pdfUrl = "";
    if (folderId) {
      try {
        var existing = DriveApp.getFolderById(folderId).getFilesByName(slipName + ".pdf");
        if (existing.hasNext()) pdfUrl = "https://drive.google.com/file/d/" + existing.next().getId() + "/preview";
      } catch (e) {}
    }

    if (!pdfUrl && folderId) {
      _fillAuditSlipView_(ss, detail, zoneCfg, overall, byPillar, ncCount);
      SpreadsheetApp.flush();
      var slip = ss.getSheetByName(AUDIT_SLIP_SHEET);
      var url = "https://docs.google.com/spreadsheets/d/" + ss.getId() +
        "/export?format=pdf&gid=" + slip.getSheetId() +
        "&portrait=true&fitw=true&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3&gridlines=false";
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
      var blob = resp.getBlob().setName(slipName + ".pdf");
      var file = DriveApp.getFolderById(folderId).createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = "https://drive.google.com/file/d/" + file.getId() + "/preview";
    }

    var waUrl = _buildAuditWhatsApp_(detail, zoneCfg, overall, ncCount, pdfUrl);
    return { success: true, pdfUrl: pdfUrl, waUrl: waUrl, overall: overall, ncCount: ncCount };
  }, "generateAuditPdf:" + submissionId, { success: false, message: "Could not generate audit PDF" });
}

var ACTION_SLIP_SHEET = "ACTION_SLIP_VIEW";

/**
 * Generate a PDF + WhatsApp link for an NC / Task / Red Tag record.
 * @param {string} type  'NC' | 'TASK' | 'RED_TAG'
 * @param {string} id     record id (NC_ID / TASK_ID / TAG_ID)
 * @returns {Object} { success, pdfUrl, waUrl } or { success:false, message }
 */
function generateActionPdf(type, id) {
  return v2SafeExecute_(function () {
    var rec = _loadActionRecord_(type, id);
    if (!rec) return { success: false, message: type + " not found: " + id };

    var ss = v2GetSpreadsheet_();
    var zoneCfg = (typeof getZoneConfig === "function" ? getZoneConfig()[rec.zoneId] : null) || {};
    var folderId = zoneCfg.driveFolderId;
    var slipName = type + "_" + String(id).replace(/[^A-Za-z0-9\-]/g, "");

    var pdfUrl = "";
    if (folderId) {
      try {
        var ex = DriveApp.getFolderById(folderId).getFilesByName(slipName + ".pdf");
        if (ex.hasNext()) pdfUrl = "https://drive.google.com/file/d/" + ex.next().getId() + "/preview";
      } catch (e) {}
    }
    // Always regenerate (record fields change over time) — remove any stale copy first.
    if (folderId) {
      try {
        var old = DriveApp.getFolderById(folderId).getFilesByName(slipName + ".pdf");
        while (old.hasNext()) old.next().setTrashed(true);
      } catch (e) {}

      _fillActionSlipView_(ss, rec);
      SpreadsheetApp.flush();
      var slip = ss.getSheetByName(ACTION_SLIP_SHEET);
      var url = "https://docs.google.com/spreadsheets/d/" + ss.getId() +
        "/export?format=pdf&gid=" + slip.getSheetId() +
        "&portrait=true&fitw=true&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3&gridlines=false";
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
      var file = DriveApp.getFolderById(folderId).createFile(resp.getBlob().setName(slipName + ".pdf"));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = "https://drive.google.com/file/d/" + file.getId() + "/preview";
    }

    return { success: true, pdfUrl: pdfUrl, waUrl: _buildActionWhatsApp_(rec, pdfUrl) };
  }, "generateActionPdf:" + type + ":" + id, { success: false, message: "Could not generate PDF" });
}

/** Read an NC/Task/RedTag into a normalized slip record. */
function _loadActionRecord_(type, id) {
  var ss = v2GetSpreadsheet_();
  if (type === "NC") {
    var d = getNcDetail(id);
    if (!d || !d.id) return null;
    return {
      type: "NC", id: d.id, zoneId: d.zoneId,
      title: "NON-CONFORMANCE / CAPA", headerColor: "#b71c1c", photoUrl: "",
      summaryTitle: d.description || d.id,
      fields: [
        ["NC No.", d.id], ["Zone", d.zoneId + " — " + d.zoneName], ["Pillar", d.pillar],
        ["Description", d.description], ["Score Given", d.scoreGiven],
        ["Status", d.status], ["Auditor", d.auditor], ["Responsible", d.responsible],
        ["Created", _fmtSlipDate_(d.createdDate)], ["Target Date", _fmtSlipDate_(d.targetDate)],
        ["Root Cause", d.rootCause], ["Corrective Action", d.correctiveAction],
        ["Preventive Action", d.preventiveAction], ["Verified By", d.verifiedBy],
        ["Closure Date", _fmtSlipDate_(d.closureDate)], ["Remarks", d.verificationRemarks]
      ]
    };
  }
  if (type === "TASK") {
    var ts = ss.getSheetByName("TaskBoard"); if (!ts) return null;
    var td = ts.getDataRange().getValues();
    for (var i = 1; i < td.length; i++) {
      if (String(td[i][TASK_COL.TASK_ID]).trim() !== String(id).trim()) continue;
      var r = td[i];
      return {
        type: "TASK", id: id, zoneId: String(r[TASK_COL.ZONE_ID]),
        title: "TASK", headerColor: "#1b5e20", photoUrl: String(r[TASK_COL.PHOTO_URL] || ""),
        summaryTitle: String(r[TASK_COL.TITLE] || id),
        fields: [
          ["Task No.", id], ["Zone", r[TASK_COL.ZONE_ID] + " — " + r[TASK_COL.ZONE_NAME]],
          ["Title", r[TASK_COL.TITLE]], ["Description", r[TASK_COL.DESCRIPTION]],
          ["Priority", r[TASK_COL.PRIORITY]], ["Status", r[TASK_COL.STATUS]],
          ["Assigned To", r[TASK_COL.ASSIGNED_TO]], ["Source", r[TASK_COL.SOURCE]],
          ["Created", _fmtSlipDate_(r[TASK_COL.CREATED])], ["Due Date", _fmtSlipDate_(r[TASK_COL.DUE_DATE])],
          ["Remarks", r[TASK_COL.REMARKS]]
        ]
      };
    }
    return null;
  }
  if (type === "RED_TAG") {
    var rs = ss.getSheetByName("RedTagRegister"); if (!rs) return null;
    var rd = rs.getDataRange().getValues();
    for (var j = 1; j < rd.length; j++) {
      if (String(rd[j][RT_COL.TAG_ID]).trim() !== String(id).trim()) continue;
      var rr = rd[j];
      return {
        type: "RED_TAG", id: id, zoneId: String(rr[RT_COL.ZONE_ID]),
        title: "RED TAG", headerColor: "#b71c1c", photoUrl: String(rr[RT_COL.PHOTO_URL] || ""),
        summaryTitle: String(rr[RT_COL.ITEM_DESC] || id),
        fields: [
          ["Tag No.", id], ["Zone", rr[RT_COL.ZONE_ID] + " — " + rr[RT_COL.ZONE_NAME]],
          ["Item", rr[RT_COL.ITEM_DESC]], ["Category", rr[RT_COL.ITEM_CATEGORY]],
          ["Est. Value (₹)", rr[RT_COL.EST_VALUE]], ["Proposed Action", rr[RT_COL.PROPOSED_ACTION]],
          ["Status", rr[RT_COL.STATUS]], ["Tagged By", rr[RT_COL.TAGGED_BY]], ["Owner", rr[RT_COL.OWNER]],
          ["Created", _fmtSlipDate_(rr[RT_COL.CREATED])], ["Deadline", _fmtSlipDate_(rr[RT_COL.DEADLINE])],
          ["Disposition", rr[RT_COL.DISPOSITION]], ["Review Notes", rr[RT_COL.REVIEW_NOTES]],
          ["Remarks", rr[RT_COL.REMARKS]]
        ]
      };
    }
    return null;
  }
  return null;
}

function _fmtSlipDate_(v) {
  if (!v) return "";
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  if (v instanceof Date) return Utilities.formatDate(v, tz, "dd-MMM-yyyy");
  var d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, tz, "dd-MMM-yyyy");
}

/** Write a key/value slip (NC/Task/RedTag) into ACTION_SLIP_VIEW. */
function _fillActionSlipView_(ss, rec) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var sh = ss.getSheetByName(ACTION_SLIP_SHEET);
  if (!sh) sh = ss.insertSheet(ACTION_SLIP_SHEET); else sh.clear();

  sh.getRange("A1:D1").merge()
    .setValue("PACK MASTERS — " + rec.title)
    .setFontSize(13).setFontWeight("bold").setBackground(rec.headerColor).setFontColor("#ffffff")
    .setHorizontalAlignment("center");

  var row = 2;
  rec.fields.forEach(function (f) {
    var val = (f[1] === null || f[1] === undefined) ? "" : (typeof f[1] === "number" ? f[1] : String(f[1]));
    sh.getRange(row, 1).setValue(f[0]).setFontWeight("bold").setBackground("#e8eaf6");
    sh.getRange(row, 2, 1, 3).merge().setValue(val).setWrap(true);
    sh.getRange(row, 1, 1, 4).setBorder(true, true, true, true, null, null);
    row++;
  });

  if (rec.photoUrl) {
    sh.getRange(row, 1).setValue("Photo").setFontWeight("bold").setBackground("#e8eaf6");
    sh.getRange(row, 2, 1, 3).merge().setFormula('=IMAGE("' + rec.photoUrl + '")');
    sh.setRowHeight(row, 120);
    sh.getRange(row, 1, 1, 4).setBorder(true, true, true, true, null, null);
    row++;
  }

  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 160);
  sh.getRange(row + 1, 1, 1, 4).merge()
    .setValue("Doc: FRM/5S/02 | PackMasters 5S | Generated: " + Utilities.formatDate(new Date(), tz, "dd-MMM-yyyy HH:mm"))
    .setBackground("#f5f5f5").setFontStyle("italic").setHorizontalAlignment("center");
}

/** WhatsApp deep link for an NC/Task/RedTag. */
function _buildActionWhatsApp_(rec, pdfUrl) {
  var hdr = rec.type === "TASK" ? "[T]" : "[R]";
  var lines = rec.fields.filter(function (f) {
    return f[1] !== "" && f[1] !== null && f[1] !== undefined &&
      ["NC No.", "Task No.", "Tag No.", "Zone", "Title", "Item", "Status", "Priority",
       "Assigned To", "Owner", "Responsible", "Due Date", "Deadline", "Target Date", "Description", "Proposed Action"].indexOf(f[0]) > -1;
  }).map(function (f) { return "*" + f[0] + ":* " + f[1]; }).join("\n");

  var msg = hdr + " *" + rec.title + " — PACK MASTERS*\n\n" + lines + "\n"
    + (pdfUrl ? "\n[PDF] PDF: " + pdfUrl + "\n" : "") + "\n— PackMasters 5S";

  return "https://wa.me/?text=" + encodeURIComponent(msg)
    .replace(/%5BT%5D/g, "%E2%9C%85")   // ✅
    .replace(/%5BR%5D/g, "%F0%9F%94%B4") // 🔴
    .replace(/%5BPDF%5D/g, "%F0%9F%93%8E"); // 📎
}

function _auditDateSlug_(ts) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var d = ts ? new Date(ts) : new Date();
  return Utilities.formatDate(d, tz, "yyyyMMdd-HHmm");
}

/** Write the audit into the AUDIT_SLIP_VIEW scratch tab (the PDF layout). */
function _fillAuditSlipView_(ss, detail, zoneCfg, overall, byPillar, ncCount) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var sh = ss.getSheetByName(AUDIT_SLIP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_SLIP_SHEET);
  } else {
    /* clear() wipes values and formats but NOT row heights, so the 150pt photo
       rows from the previous audit survived and turned whatever landed on them
       into a giant empty band. Reset the heights before rebuilding. */
    sh.clear();
    var _prev = sh.getMaxRows();
    if (_prev > 1) { try { sh.setRowHeights(1, _prev, 21); } catch (e) {} }
  }
  try { sh.getDataRange().setFontFamily("Arial").setFontSize(9); } catch (e) {}

  var GREEN = "#1b5e20", AMBER = "#b45309", RED = "#b71c1c";
  var band = overall >= 80 ? GREEN : overall >= 60 ? AMBER : RED;
  var W = 6;   // columns A..F carry the table; G..H hold extra photos
  /* Evidence sizing. 200pt wide against a 150pt row is 4:3, so a phone photo
     fills the cell instead of being letterboxed, and at that size a reader can
     actually see what was wrong. Was 84pt x 70pt. */
  var PHOTO_COL_W = 200, PHOTO_ROW_H = 150;

  // Title
  sh.getRange(1, 1, 1, W).merge()
    .setValue("PACK MASTERS \u2014 5S AUDIT REPORT  |  5S \u0911\u0921\u093F\u091F \u0930\u093F\u092A\u094B\u0930\u094D\u091F")
    .setFontSize(14).setFontWeight("bold").setBackground(band).setFontColor("#ffffff")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(1, 30);

  // Score banner - the number a reader should see first
  sh.getRange(2, 1, 1, 2).merge().setValue(overall + "%")
    .setFontSize(30).setFontWeight("bold").setFontColor(band)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(2, 3, 1, W - 2).merge()
    .setValue(_slipVerdict_(overall) + "\n" + ncCount + " non-conformity(ies) \u00b7 " +
              detail.items.length + " criteria audited")
    .setFontSize(11).setWrap(true).setVerticalAlignment("middle");
  sh.setRowHeight(2, 52);
  sh.getRange(2, 1, 1, W).setBorder(true, true, true, true, null, null);

  // Identity block - two label/value pairs per row
  var when = detail.header.timestamp
    ? Utilities.formatDate(new Date(detail.header.timestamp), tz, "dd-MMM-yyyy HH:mm") : "\u2014";
  var pairs = [
    ["Zone / \u091C\u093C\u094B\u0928", detail.header.zoneId + " \u2014 " + detail.header.zoneName,
     "Date / \u0926\u093F\u0928\u093E\u0902\u0915", when],
    ["Auditor / \u0911\u0921\u093F\u091F\u0930", detail.header.auditor || "\u2014",
     "Zone Leader / \u0932\u0940\u0921\u0930", zoneCfg.leader || "\u2014"]
  ];
  var r = 3;
  pairs.forEach(function (pr) {
    /* Column A is 26pt — sized for a row number, not for "Auditor / ऑडिटर",
       which printed as "Aud". The label spans A:B and the value C:D so both
       have room at any zoom. */
    sh.getRange(r, 1, 1, 2).merge().setValue(pr[0])
      .setFontWeight("bold").setBackground("#eceff1").setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r, 3, 1, 2).merge().setValue(pr[1])
      .setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r, 5).setValue(pr[2])
      .setFontWeight("bold").setBackground("#eceff1").setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r, 6).setValue(pr[3]).setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r, 1, 1, W).setBorder(true, true, true, true, true, null);
    sh.setRowHeight(r, 30);
    r++;
  });

  // Pillar scorecard - one column each, was a single cramped string
  r++;
  sh.getRange(r, 1, 1, W).merge().setValue("PILLAR SCORECARD / \u0938\u094D\u0924\u0902\u092D")
    .setFontWeight("bold").setBackground("#37474f").setFontColor("#ffffff");
  r++;
  var PN = { S1: "Sort", S2: "Set in Order", S3: "Shine", S4: "Standardise", S5: "Sustain" };
  var names = [], pcts = [];
  ["S1", "S2", "S3", "S4", "S5"].forEach(function (pk) {
    var b = byPillar[pk];
    names.push(pk + " \u00b7 " + PN[pk]);
    pcts.push(b ? Math.round(100 * b.sum / (4 * b.n)) + "%" : "\u2014");
  });
  names.push("OVERALL"); pcts.push(overall + "%");

  /* Six cells across six columns of widths 26/212/40/40/132/200 gave each
     pillar a different amount of room: "S4 · Standardise" wrapped to three
     lines in 40pt while "S2 · Set in Order" floated in 212pt, and the score
     under the narrow ones was clipped. Two header rows of three cells each,
     merged in pairs, give every pillar an equal, adequate share. */
  var cells = [[0, 1], [2, 3], [4, 5]];   // A:B, C:D, E:F
  for (var g = 0; g < 2; g++) {           // two rows of three pillars
    var rowTop = r + g * 2;
    for (var k = 0; k < 3; k++) {
      var idx = g * 3 + k;
      var c0 = cells[k][0] + 1, span = 2;
      sh.getRange(rowTop, c0, 1, span).merge().setValue(names[idx])
        .setFontSize(9).setWrap(true).setHorizontalAlignment("center")
        .setVerticalAlignment("middle").setBackground("#eceff1");
      var cell = sh.getRange(rowTop + 1, c0, 1, span).merge().setValue(pcts[idx])
        .setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center")
        .setVerticalAlignment("middle");
      if (pcts[idx] !== "\u2014") {
        var v = parseInt(pcts[idx], 10);
        cell.setFontColor(v >= 80 ? GREEN : v >= 60 ? AMBER : RED);
      }
    }
    sh.setRowHeight(rowTop, 20);
    sh.setRowHeight(rowTop + 1, 28);
    sh.getRange(rowTop, 1, 2, W).setBorder(true, true, true, true, true, true);
  }
  r += 5;

  // Failing items first - the reason the report exists
  var fails = detail.items.filter(function (it) { return it.score != null && it.score <= 1; });
  if (fails.length) {
    sh.getRange(r, 1, 1, W).merge()
      .setValue("ACTION REQUIRED \u2014 SCORE 0-1 / \u0915\u093E\u0930\u094D\u0930\u0935\u093E\u0908 \u091C\u0930\u0942\u0930\u0940")
      .setFontWeight("bold").setBackground(RED).setFontColor("#ffffff");
    r++;
    fails.forEach(function (it) {
      sh.getRange(r, 1).setValue(it.score).setHorizontalAlignment("center")
        .setFontWeight("bold").setBackground("#fee2e2").setFontColor(RED);
      sh.getRange(r, 2, 1, W - 1).merge()
        .setValue((it.label || it.criterionId) + (it.labelHi ? "\n" + it.labelHi : "") +
                  (it.remark ? "\n\u2192 " + it.remark : ""))
        .setWrap(true).setFontSize(9);
      sh.getRange(r, 1, 1, W).setBorder(true, true, true, true, null, null);
      r++;
    });
    r++;
  }

  // Full criterion table
  sh.getRange(r, 1, 1, W).merge()
    .setValue("ALL CRITERIA / \u0938\u092D\u0940 \u092E\u093E\u0928\u0926\u0902\u0921")
    .setFontWeight("bold").setBackground("#37474f").setFontColor("#ffffff");
  r++;
  sh.getRange(r, 1, 1, W)
    .setValues([["#", "Criterion / \u092E\u093E\u0928\u0926\u0902\u0921", "Pillar", "Score",
                 "Remark / \u091F\u093F\u092A\u094D\u092A\u0923\u0940", "Photo"]])
    .setFontWeight("bold").setBackground("#cfd8dc").setBorder(true, true, true, true, true, true);
  r++;

  var n = 0;
  detail.items.forEach(function (it) {
    n++;
    sh.getRange(r, 1).setValue(n).setHorizontalAlignment("center").setFontSize(8)
      .setVerticalAlignment("top");
    // English + Hindi. labelHi only became available once getAuditDetail
    // resolved labels from the zone criteria - they were empty strings before.
    sh.getRange(r, 2).setValue((it.label || it.criterionId) + (it.labelHi ? "\n" + it.labelHi : ""))
      .setWrap(true).setFontSize(9).setVerticalAlignment("top");
    sh.getRange(r, 3).setValue(it.pillar).setHorizontalAlignment("center").setFontSize(8)
      .setVerticalAlignment("top");
    var sc = (it.score == null) ? "\u2014" : it.score;
    sh.getRange(r, 4).setValue(sc).setHorizontalAlignment("center").setFontWeight("bold")
      .setVerticalAlignment("top")
      .setBackground(it.score == null ? "#ffffff" : it.score <= 1 ? "#fee2e2" : it.score <= 2 ? "#fff3cd" : "#e6f4ea")
      .setFontColor(it.score == null ? "#000000" : it.score <= 1 ? RED : it.score <= 2 ? AMBER : GREEN);
    sh.getRange(r, 5).setValue(it.remark || "").setWrap(true).setFontSize(9)
      .setVerticalAlignment("top");
    /* The comment said "every photo" but only urls[0] was ever drawn, at 84pt
       in a 70pt row -- a stamp you cannot read on a printed report. IMAGE mode
       1 fits the picture to the cell, so the row height is what actually sets
       the size. Extra photos go into the columns to the right of the table
       rather than being reduced to a note nobody opens. */
    var urls = (it.photoUrls && it.photoUrls.length) ? it.photoUrls : (it.photoUrl ? [it.photoUrl] : []);
    if (urls.length) {
      sh.getRange(r, 6).setFormula('=IMAGE("' + urls[0] + '", 1)');
      sh.setRowHeight(r, PHOTO_ROW_H);
    } else {
      sh.setRowHeight(r, 34);
    }
    sh.getRange(r, 1, 1, W).setBorder(true, true, true, true, null, null);
    r++;

    /* Extra shots for the same criterion get a full-width row of their own.
       The comment above this block used to claim "every photo" while drawing
       only urls[0]; the rest were a cell note nobody opens. */
    if (urls.length > 1) {
      var extra = urls.slice(1, 4);
      sh.getRange(r, 1, 1, 2).merge()
        .setValue("\u21b3 " + (urls.length - 1) + " more photo" + (urls.length === 2 ? "" : "s"))
        .setFontSize(8).setFontStyle("italic").setVerticalAlignment("middle")
        .setHorizontalAlignment("right");
      for (var pi = 0; pi < extra.length; pi++) {
        sh.getRange(r, 3 + pi).setFormula('=IMAGE("' + extra[pi] + '", 1)');
      }
      sh.setRowHeight(r, PHOTO_ROW_H);
      sh.getRange(r, 1, 1, W).setBorder(true, true, true, true, null, null);
      r++;
    }
  });

  // Sign-off
  r++;
  sh.getRange(r, 1, 1, W).merge()
    .setValue("SIGN-OFF / \u0939\u0938\u094D\u0924\u093E\u0915\u094D\u0937\u0930")
    .setFontWeight("bold").setBackground("#37474f").setFontColor("#ffffff");
  r++;
  sh.getRange(r, 1, 1, 2).merge().setValue("Auditor / \u0911\u0921\u093F\u091F\u0930").setFontSize(8).setBackground("#eceff1");
  sh.getRange(r, 3, 1, 2).merge().setValue("Zone Leader / \u0932\u0940\u0921\u0930").setFontSize(8).setBackground("#eceff1");
  sh.getRange(r, 5, 1, 2).merge().setValue("Reviewed by / \u0938\u092E\u0940\u0915\u094D\u0937\u093E").setFontSize(8).setBackground("#eceff1");
  sh.getRange(r, 1, 1, W).setBorder(true, true, true, true, true, null);
  sh.setRowHeight(r + 1, 44);
  sh.getRange(r + 1, 1, 1, 2).merge();
  sh.getRange(r + 1, 3, 1, 2).merge();
  sh.getRange(r + 1, 5, 1, 2).merge();
  sh.getRange(r + 1, 1, 1, W).setBorder(true, true, true, true, true, null);
  r += 2;

  sh.getRange(r + 1, 1, 1, W).merge()
    .setValue("Doc: FRM/5S/01  \u00b7  PackMasters 5S  \u00b7  Generated " +
              Utilities.formatDate(new Date(), tz, "dd-MMM-yyyy HH:mm"))
    .setBackground("#f5f5f5").setFontStyle("italic").setFontSize(8).setHorizontalAlignment("center");

  /* A4 portrait at the default margins gives roughly 750pt of usable width.
     The old split spent 84 of it on the photo -- the one column a reader
     actually studies -- so evidence printed as a thumbnail. Rebalanced: text
     still leads, evidence is legible, and the two extra photo columns hold any
     further shots for the same criterion. */
  /* Total stays 650pt, the width the export was already tuned for: fitw=true
     scales the whole sheet to the page, so widening the sheet would have
     shrunk the very photo this change exists to enlarge. The 84pt spent on
     evidence is re-cut from the two text columns instead. */
  sh.setColumnWidth(1, 26);  sh.setColumnWidth(2, 212); sh.setColumnWidth(3, 40);
  sh.setColumnWidth(4, 40);  sh.setColumnWidth(5, 132); sh.setColumnWidth(6, PHOTO_COL_W);
  try { sh.setHiddenGridlines(true); } catch (e) {}
}

/** One-line verdict shown beside the score banner. */
function _slipVerdict_(pct) {
  if (pct >= 90) return "EXCELLENT \u2014 sustain the standard";
  if (pct >= 80) return "GOOD \u2014 minor gaps to close";
  if (pct >= 60) return "NEEDS IMPROVEMENT \u2014 act on the items below";
  return "CRITICAL \u2014 immediate corrective action required";
}

/** Build a wa.me deep link with an audit summary + PDF link (emoji-safe). */
function _buildAuditWhatsApp_(detail, zoneCfg, overall, ncCount, pdfUrl) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var when = detail.header.timestamp ? Utilities.formatDate(new Date(detail.header.timestamp), tz, "dd-MMM-yyyy HH:mm") : "—";
  var low = detail.items.filter(function (it) { return it.score != null && it.score <= 1; })
    .slice(0, 5).map(function (it) { return "[x] " + (it.label || it.criterionId) + " (" + it.score + ")"; }).join("\n");

  var msg = "[HDR] *5S AUDIT REPORT — PACK MASTERS*\n\n"
    + "*Zone:* " + detail.header.zoneId + " — " + detail.header.zoneName + "\n"
    + "*Auditor:* " + (detail.header.auditor || "") + "\n"
    + (zoneCfg.leader ? "*Leader:* " + zoneCfg.leader + "\n" : "")
    + "*Date:* " + when + "\n"
    + "*Overall:* " + overall + "%\n"
    + "*NCs (score ≤ 1):* " + ncCount + "\n"
    + (low ? "\n*Low items:*\n" + low + "\n" : "")
    + (pdfUrl ? "\n[PDF] Audit PDF: " + pdfUrl + "\n" : "")
    + "\n— PackMasters 5S";

  return "https://wa.me/?text=" + encodeURIComponent(msg)
    .replace(/%5Bx%5D/g, "%E2%9C%98")          // ✘
    .replace(/%5BHDR%5D/g, overall >= 80 ? "%F0%9F%9F%A2" : overall >= 60 ? "%F0%9F%9F%A0" : "%F0%9F%94%B4")  // 🟢/🟠/🔴
    .replace(/%5BPDF%5D/g, "%F0%9F%93%8E");    // 📎
}
