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

function _auditDateSlug_(ts) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var d = ts ? new Date(ts) : new Date();
  return Utilities.formatDate(d, tz, "yyyyMMdd-HHmm");
}

/** Write the audit into the AUDIT_SLIP_VIEW scratch tab (the PDF layout). */
function _fillAuditSlipView_(ss, detail, zoneCfg, overall, byPillar, ncCount) {
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var sh = ss.getSheetByName(AUDIT_SLIP_SHEET);
  if (!sh) sh = ss.insertSheet(AUDIT_SLIP_SHEET); else sh.clear();

  var band = overall >= 80 ? "#1b5e20" : overall >= 60 ? "#b45309" : "#b71c1c";
  sh.getRange("A1:E1").merge()
    .setValue("PACK MASTERS — 5S AUDIT REPORT  |  5S ऑडिट रिपोर्ट")
    .setFontSize(13).setFontWeight("bold").setBackground(band).setFontColor("#ffffff")
    .setHorizontalAlignment("center");

  var when = detail.header.timestamp ? Utilities.formatDate(new Date(detail.header.timestamp), tz, "dd-MMM-yyyy HH:mm") : "—";
  var pillarStr = ["S1", "S2", "S3", "S4", "S5"].map(function (p) {
    var b = byPillar[p]; return p + ": " + (b ? Math.round(100 * b.sum / (4 * b.n)) + "%" : "—");
  }).join("   ");

  var info = [
    ["Zone / ज़ोन", detail.header.zoneId + " — " + detail.header.zoneName],
    ["Auditor / ऑडिटर", detail.header.auditor],
    ["Zone Leader / लीडर", zoneCfg.leader || "—"],
    ["Date & Time / दिनांक", when],
    ["Overall Score / कुल स्कोर", overall + "%"],
    ["Pillars / स्तंभ", pillarStr],
    ["NCs (score ≤ 1) / गैर-अनुरूपता", String(ncCount)]
  ];
  info.forEach(function (f, i) {
    var r = i + 2;
    sh.getRange(r, 1).setValue(f[0]).setFontWeight("bold").setBackground("#e8eaf6");
    sh.getRange(r, 2, 1, 4).merge().setValue(f[1] || "").setWrap(true);
    sh.getRange(r, 1, 1, 5).setBorder(true, true, true, true, null, null);
  });

  // per-criterion table header
  var hr = info.length + 3;
  var heads = ["Criterion / मानदंड", "Pillar", "Score", "Remark", "Photo"];
  sh.getRange(hr, 1, 1, 5).setValues([heads]).setFontWeight("bold").setBackground("#cfd8dc")
    .setBorder(true, true, true, true, true, true);

  var row = hr + 1;
  detail.items.forEach(function (it) {
    sh.getRange(row, 1).setValue(it.label || it.criterionId).setWrap(true);
    sh.getRange(row, 2).setValue(it.pillar);
    var sc = (it.score == null) ? "—" : it.score;
    sh.getRange(row, 3).setValue(sc).setHorizontalAlignment("center")
      .setBackground(it.score == null ? "#ffffff" : it.score <= 1 ? "#fee2e2" : it.score <= 2 ? "#fff3cd" : "#e6f4ea");
    sh.getRange(row, 4).setValue(it.remark || "").setWrap(true);
    if (it.photoUrl) { sh.getRange(row, 5).setFormula('=IMAGE("' + it.photoUrl + '")'); sh.setRowHeight(row, 64); }
    sh.getRange(row, 1, 1, 5).setBorder(true, true, true, true, null, null);
    row++;
  });

  sh.setColumnWidth(1, 280); sh.setColumnWidth(2, 50); sh.setColumnWidth(3, 50);
  sh.setColumnWidth(4, 220); sh.setColumnWidth(5, 90);

  sh.getRange(row + 1, 1, 1, 5).merge()
    .setValue("Doc: FRM/5S/01 | PackMasters 5S | Generated: " + Utilities.formatDate(new Date(), tz, "dd-MMM-yyyy HH:mm"))
    .setBackground("#f5f5f5").setFontStyle("italic").setHorizontalAlignment("center");
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
