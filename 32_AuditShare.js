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
      /* Rendered from HTML/CSS (32b_AuditPdfTemplate.js), not from a styled
         Google Sheet. The sheet route forced one column width to serve the
         criterion text, the scorecard and the photo at once, leaked row heights
         between runs, truncated labels to fit a 26pt column, and raced =IMAGE()
         against the export so photos printed as "[1]". A document should be
         typeset, not tabulated. */
      var blob = buildAuditReportPdfBlob_(detail, zoneCfg, overall, byPillar, ncCount, slipName);
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
/* _fillAuditSlipView_ removed: the report is rendered from HTML/CSS by
   32b_AuditPdfTemplate.js. Keeping a second, spreadsheet-shaped template around
   would guarantee the two drifted apart, and it was the source of every layout
   defect this replaced. AUDIT_SLIP_SHEET is still declared above because the
   ACTION_SLIP path below uses the same idiom.
*/
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
