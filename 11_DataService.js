/**
 * ============================================================================
 * 11_DataService.gs — PackMasters 5S Integrated System
 * Phase 4: Data Service Layer for Dashboards & Reports
 * ============================================================================
 *
 * Provides all data retrieval functions called by HTML views via
 * google.script.run or the ?action=data endpoint.
 *
 * CONSTRAINT-1: BATCH_READ — one getDataRange().getValues() per function call.
 * CONSTRAINT-2: Dashboard reads ONLY from Summary_Data (pre-aggregated).
 *
 * Functions:
 *   getZoneSummary(zoneId, month)       — Single zone summary for dashboard
 *   getZoneTrend(zoneId, months)        — Multi-month trend data
 *   getPlantSummary(month)              — All zones for MRM summary
 *   getPlantTrend(months)               — Plant-wide multi-month trend
 *   getCAPAData(zoneId)                 — CAPA records for tracker
 *   getPhotoData(zoneId, month)         — Photo log for gallery
 *   getHistoricalComparison(zoneId)     — Current FY vs prior FY
 *   handleDataRequestFull_(params)      — doGet ?action=data handler
 *   serveDashboardFull_(params)         — doGet ?action=dashboard handler
 *   servePrintFull_(params)             — doGet ?action=print handler
 */

// ============================================================================
// ZONE SUMMARY (Single Zone, Single Month)
// ============================================================================

/**
 * Returns summary data for one zone and one month.
 * Reads only from the Summary sheet (pre-aggregated by Phase 3).
 *
 * @param {string} zoneId — Zone identifier
 * @param {string} [month] — yyyy-MM format. Defaults to current month.
 * @returns {Object} Zone summary object
 */
function getZoneSummary(zoneId, month) {
  if (!month) {
    month = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM");
  }

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet || summarySheet.getLastRow() <= 1) {
    return { zoneId: zoneId, month: month, hasData: false };
  }

  var data = summarySheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var result = null;

  // New 15-col schema: zone_id(0), month(1), overall_score(2) — no period_type column
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === zoneId && String(data[r][1]).trim() === month) {
      result = rowToObject_(headers, data[r]);
      break;
    }
  }

  if (!result) {
    return { zoneId: zoneId, month: month, hasData: false };
  }

  // Add zone config info
  var zoneConfig = getZoneConfig();
  var zone = zoneConfig[zoneId] || {};
  result.leader = zone.leader || "";
  result.department = zone.department || "";
  result.nameHi = zone.nameHi || "";
  result.hasData = true;

  // Add open NC count
  try {
    var openCAPAs = getCAPAsByZone(zoneId).filter(function(c) {
      var s = String(c.status || "").toUpperCase();
      return s === "OPEN" || s === "IN_PROGRESS" || s === "OVERDUE";
    });
    result.openNCCount = openCAPAs.length;
    result.overdueNCCount = openCAPAs.filter(function(c) {
      return String(c.status || "").toUpperCase() === "OVERDUE";
    }).length;
  } catch (e) {
    result.openNCCount = 0;
    result.overdueNCCount = 0;
  }

  return result;
}


// ============================================================================
// ZONE TREND (Multi-Month)
// ============================================================================

/**
 * Returns trend data for a zone across multiple months.
 *
 * @param {string} zoneId — Zone identifier
 * @param {number} [months=6] — Number of months to look back
 * @returns {Object[]} Array of summary objects, one per month, sorted chronologically
 */
function getZoneTrend(zoneId, months) {
  months = months || 6;
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet || summarySheet.getLastRow() <= 1) return [];

  var data = summarySheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];

  // Calculate month range
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  var cutoffMonth = Utilities.formatDate(cutoff, "Asia/Kolkata", "yyyy-MM");

  var results = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() !== zoneId) continue;
    var rowMonth = String(data[r][1]).trim();
    if (rowMonth < cutoffMonth) continue;
    results.push(rowToObject_(headers, data[r]));
  }

  results.sort(function(a, b) { return String(a.month).localeCompare(String(b.month)); });
  return results;
}


// ============================================================================
// PLANT SUMMARY (All Zones, One Month)
// ============================================================================

/**
 * Returns summary data for all zones for a given month.
 * Used by MRM Summary dashboard.
 *
 * @param {string} [month] — yyyy-MM format. Defaults to prior month.
 * @returns {Object} Plant summary with zone array and aggregates
 */
function getPlantSummary(month) {
  if (!month) {
    var now = new Date();
    var prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    month = Utilities.formatDate(prior, "Asia/Kolkata", "yyyy-MM");
  }

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet || summarySheet.getLastRow() <= 1) {
    return { month: month, zones: [], hasData: false };
  }

  var data = summarySheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var zoneConfig = getZoneConfig();

  var zones = [];
  var monthlyFound = {};
  var weeklyFallback = {};

  // New 15-col schema: zone_id(0), month(1), overall_score(2) — no period_type column
  for (var r = 1; r < data.length; r++) {
    var rowZone = String(data[r][0]).trim();
    var rowMonth = String(data[r][1]).trim();
    if (rowMonth !== month) continue;
    if (!monthlyFound[rowZone]) {
      monthlyFound[rowZone] = rowToObject_(headers, data[r]);
    }
  }

  var zoneIds = Object.keys(zoneConfig).sort();
  zoneIds.forEach(function(zid) {
    var row = monthlyFound[zid] || null;
    if (row) {
      row.leader = zoneConfig[zid].leader || "";
      row.department = zoneConfig[zid].department || "";
      zones.push(row);
    } else {
      zones.push({
        zone_id: zid,
        zone_name: zoneConfig[zid].name,
        leader: zoneConfig[zid].leader,
        month: month,
        hasData: false,
        overall_score: 0, s1_score: 0, s2_score: 0, s3_score: 0, s4_score: 0, s5_score: 0,
        open_ncs: 0, closed_ncs: 0, active_red_tags: 0
      });
    }
  });

  // Plant aggregates
  var zonesWithData = zones.filter(function(z) { return z.hasData !== false; });
  var plantAvg = zonesWithData.length > 0 ?
    Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z.overall_score) || 0); }, 0) / zonesWithData.length * 100) / 100 : 0;
  var totalNCs = zones.reduce(function(s, z) { return s + (Number(z.open_ncs) || 0); }, 0);
  var totalClosed = zones.reduce(function(s, z) { return s + (Number(z.closed_ncs) || 0); }, 0);
  var closureRate = totalNCs > 0 ? Math.round((totalClosed / totalNCs) * 100) : 100;

  // Pillar averages across plant
  var pillarAvgs = {};
  ["s1_score", "s2_score", "s3_score", "s4_score", "s5_score"].forEach(function(key) {
    if (zonesWithData.length > 0) {
      pillarAvgs[key] = Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z[key]) || 0); }, 0) / zonesWithData.length * 100) / 100;
    } else {
      pillarAvgs[key] = 0;
    }
  });

  return {
    month: month,
    zones: zones,
    hasData: zonesWithData.length > 0,
    plantAvg: plantAvg,
    totalNCs: totalNCs,
    totalClosed: totalClosed,
    closureRate: closureRate,
    pillarAvgs: pillarAvgs
  };
}


// ============================================================================
// PLANT TREND
// ============================================================================

/**
 * Returns plant-wide trend across multiple months.
 *
 * @param {number} [months=6] — Number of months
 * @returns {Object[]} Array of { month, plantAvg, totalNCs, closureRate }
 */
function getPlantTrend(months) {
  months = months || 6;
  var now = new Date();

  // Build target month list
  var targetMonths = [];
  for (var i = months - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    targetMonths.push(Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM"));
  }

  // Single sheet read + single zoneConfig read
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet || summarySheet.getLastRow() <= 1) {
    return targetMonths.map(function(m) {
      return { month: m, plantAvg: 0, totalNCs: 0, closureRate: 100, pillarAvgs: {}, hasData: false };
    });
  }

  var data = summarySheet.getDataRange().getValues();
  var headers = data[0];
  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();

  // New 15-col schema: zone_id(0), month(1) — no period_type column
  var rowsByMonth = {};
  for (var r = 1; r < data.length; r++) {
    var rowMonth = String(data[r][1]).trim();
    if (!rowsByMonth[rowMonth]) rowsByMonth[rowMonth] = [];
    rowsByMonth[rowMonth].push(data[r]);
  }

  var results = [];
  targetMonths.forEach(function(month) {
    var monthRows = rowsByMonth[month] || [];
    var monthlyFound = {};

    monthRows.forEach(function(row) {
      var rowZone = String(row[0]).trim();
      if (!monthlyFound[rowZone]) {
        monthlyFound[rowZone] = rowToObject_(headers, row);
      }
    });

    var zones = [];
    zoneIds.forEach(function(zid) {
      var zRow = monthlyFound[zid] || null;
      if (zRow) zones.push(zRow);
    });

    var zonesWithData = zones.filter(function(z) { return Number(z.overall_score) > 0; });
    var plantAvg = zonesWithData.length > 0 ?
      Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z.overall_score) || 0); }, 0) / zonesWithData.length * 100) / 100 : 0;
    var totalNCs = zones.reduce(function(s, z) { return s + (Number(z.open_ncs) || 0); }, 0);
    var totalClosed = zones.reduce(function(s, z) { return s + (Number(z.closed_ncs) || 0); }, 0);
    var closureRate = totalNCs > 0 ? Math.round((totalClosed / totalNCs) * 100) : 100;

    var pillarAvgs = {};
    ["s1_score", "s2_score", "s3_score", "s4_score", "s5_score"].forEach(function(key) {
      pillarAvgs[key] = zonesWithData.length > 0 ?
        Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z[key]) || 0); }, 0) / zonesWithData.length * 100) / 100 : 0;
    });

    results.push({
      month: month,
      plantAvg: plantAvg,
      totalNCs: totalNCs,
      closureRate: closureRate,
      pillarAvgs: pillarAvgs,
      hasData: zonesWithData.length > 0
    });
  });

  return results;
}


// ============================================================================
// CAPA DATA
// ============================================================================

/**
 * Returns CAPA data for dashboards. Wraps Phase 3 functions.
 *
 * @param {string} [zoneId] — If provided, returns only that zone's CAPAs
 * @returns {Object[]} Array of CAPA objects with computed fields
 */
function getCAPADataForDashboard(zoneId) {
  if (zoneId) {
    return getCAPAsByZone(zoneId);
  }
  return getOpenCAPAs();
}


// ============================================================================
// PHOTO DATA
// ============================================================================

/**
 * Returns photo log entries for a zone and month.
 *
 * @param {string} zoneId — Zone identifier
 * @param {string} [month] — yyyy-MM format. Defaults to current month.
 * @returns {Object[]} Array of photo objects
 */
function getPhotoData(zoneId, month) {
  if (!month) {
    month = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM");
  }

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var photoSheet = ss.getSheetByName("PhotoLog");
  if (!photoSheet || photoSheet.getLastRow() <= 1) return [];

  var data = photoSheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var results = [];

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][2]).trim() !== zoneId) continue;

    var photoDate;
    if (data[r][4] instanceof Date) {
      photoDate = data[r][4];
    } else {
      photoDate = new Date(String(data[r][4]));
    }
    if (isNaN(photoDate.getTime())) continue;

    var photoMonth = Utilities.formatDate(photoDate, "Asia/Kolkata", "yyyy-MM");
    if (month !== "all" && photoMonth !== month) continue;

    var obj = rowToObject_(headers, data[r]);
    // Build thumbnail URL from Drive file ID
    if (obj.drive_file_id) {
      obj.thumbnailUrl = "https://drive.google.com/thumbnail?id=" + obj.drive_file_id + "&sz=w400";
    }
    results.push(obj);
  }

  return results;
}


// ============================================================================
// HISTORICAL COMPARISON
// ============================================================================

/**
 * Returns current FY vs prior FY comparison data.
 *
 * @param {string} [zoneId] — If provided, single zone. Else plant-wide.
 * @returns {Object} { currentFY, priorFY, comparison[] }
 */
function getHistoricalComparison(zoneId) {
  var now = new Date();
  var currentFYStart = now.getMonth() >= 3 ?
    new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
  var priorFYStart = new Date(currentFYStart.getFullYear() - 1, 3, 1);

  var currentFYStr = Utilities.formatDate(currentFYStart, "Asia/Kolkata", "yyyy") + "-" +
    String(currentFYStart.getFullYear() + 1).slice(2);
  var priorFYStr = Utilities.formatDate(priorFYStart, "Asia/Kolkata", "yyyy") + "-" +
    String(priorFYStart.getFullYear() + 1).slice(2);

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();

  // Read Summary sheet for current FY
  var summarySheet = ss.getSheetByName("Summary");
  var currentData = [];
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var allData = summarySheet.getDataRange().getValues(); // BATCH_READ
    var headers = allData[0];
    // New 15-col schema: zone_id(0), month(1) — no period_type
    for (var r = 1; r < allData.length; r++) {
      if (zoneId && String(allData[r][0]).trim() !== zoneId) continue;
      var rowMonth = String(allData[r][1]).trim();
      if (rowMonth >= Utilities.formatDate(currentFYStart, "Asia/Kolkata", "yyyy-MM")) {
        currentData.push(rowToObject_(headers, allData[r]));
      }
    }
  }

  // Read Archive sheet for prior FY
  var priorData = [];
  var archiveSheet = ss.getSheetByName("Archive_" + priorFYStr);
  if (archiveSheet && archiveSheet.getLastRow() > 1) {
    // Archive stores JSON, so we need to parse it differently
    // For now return empty prior data; historical archives have different format
    // This is an extension point for Phase 5+
  }

  // Also check Summary sheet for prior FY data that hasn't been archived yet
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var allData2 = allData; // Reuse data already read above
    var headers2 = allData2[0];
    var priorFYEnd = Utilities.formatDate(currentFYStart, "Asia/Kolkata", "yyyy-MM");
    var priorFYBegin = Utilities.formatDate(priorFYStart, "Asia/Kolkata", "yyyy-MM");
    for (var r2 = 1; r2 < allData2.length; r2++) {
      if (zoneId && String(allData2[r2][0]).trim() !== zoneId) continue;
      var rm = String(allData2[r2][1]).trim();
      if (rm >= priorFYBegin && rm < priorFYEnd) {
        priorData.push(rowToObject_(headers2, allData2[r2]));
      }
    }
  }

  // Build month-by-month comparison
  var comparison = [];
  var monthNames = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  for (var m = 0; m < 12; m++) {
    var targetMonth = new Date(currentFYStart.getFullYear(), currentFYStart.getMonth() + m, 1);
    var targetMonthStr = Utilities.formatDate(targetMonth, "Asia/Kolkata", "yyyy-MM");
    var priorTargetMonth = new Date(priorFYStart.getFullYear(), priorFYStart.getMonth() + m, 1);
    var priorTargetMonthStr = Utilities.formatDate(priorTargetMonth, "Asia/Kolkata", "yyyy-MM");

    var currentEntry = currentData.find(function(d) { return d.month === targetMonthStr; });
    var priorEntry = priorData.find(function(d) { return d.month === priorTargetMonthStr; });

    comparison.push({
      monthLabel: monthNames[m],
      currentMonth: targetMonthStr,
      priorMonth: priorTargetMonthStr,
      currentPct: currentEntry ? Number(currentEntry.overall_score) : null,
      priorPct: priorEntry ? Number(priorEntry.overall_score) : null
    });
  }

  return {
    currentFY: currentFYStr,
    priorFY: priorFYStr,
    comparison: comparison,
    zoneId: zoneId || "ALL"
  };
}


// ============================================================================
// doGet DATA ENDPOINT HANDLER
// ============================================================================

/**
 * Handles ?action=data requests. Returns JSON for async dashboard loading.
 * This replaces the stub in 05_WebApp.gs.
 *
 * @param {Object} params — URL parameters
 * @returns {TextOutput} JSON response
 */
function handleDataRequestFull_(params) {
  var dataType = params.dataType || params.dt || "zone";
  var zoneId = params.zone || "";
  var month = params.month || "";
  var months = parseInt(params.months, 10) || 6;

  var result;

  switch (dataType) {
    case "zone":
      result = getZoneSummary(zoneId, month);
      break;
    case "zoneTrend":
      result = getZoneTrend(zoneId, months);
      break;
    case "plant":
      result = getPlantSummary(month);
      break;
    case "plantTrend":
      result = getPlantTrend(months);
      break;
    case "capa":
      result = getCAPADataForDashboard(zoneId);
      break;
    case "photos":
      result = getPhotoData(zoneId, month || "all");
      break;
    case "history":
      result = getHistoricalComparison(zoneId);
      break;
    case "allOpen":
      result = getOpenCAPAs();
      break;
    case "pillarTrend":
      result = getPillarTrend();
      break;
    case "kanbanData":
      result = getKanbanData();
      break;
    case "analyticsKPIs":
      result = getAnalyticsKPIs();
      break;
    default:
      result = { error: "Unknown dataType: " + dataType };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================================
// doGet DASHBOARD PAGE HANDLER
// ============================================================================

/**
 * Serves the dashboard HTML page.
 */
function serveDashboardFull_(params) {
  var zoneId = params.zone || "";
  var view = params.view || "zone";

  if (view === "plant" || view === "mrm") {
    return servePlantDashboard_(params);
  }
  if (view === "capa") {
    return serveCAPATracker_(params);
  }
  if (view === "photos") {
    return servePhotoGallery_(params);
  }
  if (view === "history") {
    return serveHistoricalView_(params);
  }

  // Default: zone dashboard
  if (!zoneId) {
    return serveErrorPage_("Missing Zone", "Please specify a zone ID in the URL.");
  }

  var zoneConfig = getZoneConfig();
  if (!zoneConfig[zoneId]) {
    return serveErrorPage_("Invalid Zone", "Zone '" + zoneId + "' not found.");
  }

  var templateData = {
    zone: zoneConfig[zoneId],
    pageTitle: "Dashboard — " + zoneConfig[zoneId].name,
    deployUrl: getDeployUrl_()
  };

  return servePage_("ZoneDashboard", templateData);
}

function servePlantDashboard_(params) {
  var templateData = {
    pageTitle: "MRM Summary — PackMasters 5S",
    deployUrl: getDeployUrl_(),
    month: params.month || ""
  };
  return servePage_("MRMSummary", templateData);
}

function serveCAPATracker_(params) {
  var templateData = {
    pageTitle: "NC/CAPA Tracker — PackMasters 5S",
    deployUrl: getDeployUrl_(),
    zoneId: params.zone || ""
  };
  return servePage_("CAPATracker", templateData);
}

function servePhotoGallery_(params) {
  var templateData = {
    pageTitle: "Photo Gallery — PackMasters 5S",
    deployUrl: getDeployUrl_(),
    zoneId: params.zone || "",
    month: params.month || ""
  };
  return servePage_("PhotoGallery", templateData);
}

function serveHistoricalView_(params) {
  var templateData = {
    pageTitle: "Historical Comparison — PackMasters 5S",
    deployUrl: getDeployUrl_(),
    zoneId: params.zone || ""
  };
  return servePage_("HistoricalView", templateData);
}


// ============================================================================
// doGet PRINT PAGE HANDLER
// ============================================================================

/**
 * Serves the printable audit report.
 */
function servePrintFull_(params) {
  var zoneId = params.zone || "";
  var month = params.month || "";
  var zoneConfig = getZoneConfig();

  if (!zoneId || !zoneConfig[zoneId]) {
    return serveErrorPage_("Missing Parameters", "Specify zone and month: ?action=print&zone=Z-01&month=2025-04");
  }

  if (!month) {
    var now = new Date();
    var prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    month = Utilities.formatDate(prior, "Asia/Kolkata", "yyyy-MM");
  }

  var templateData = {
    zone: zoneConfig[zoneId],
    month: month,
    pageTitle: "Audit Report — " + zoneConfig[zoneId].name + " — " + month,
    deployUrl: getDeployUrl_(),
    autoprint: params.autoprint === "1"
  };

  return servePage_("AuditReport", templateData);
}


// ============================================================================
// UTILITY
// ============================================================================

/**
 * Converts a sheet row to an object using headers as keys.
 * @private
 */
function rowToObject_(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) {
    var key = String(h).trim();
    if (key) {
      obj[key] = row[i];
    }
  });
  return obj;
}


// ============================================================================
// AUDIT HISTORY (IMP-03 supplement — view + soft-correct submitted audits)
// ============================================================================

/**
 * Returns all non-duplicate audit submissions for a given zone and month.
 * Covers both daily (DailySubmissions) and weekly (WeeklyAudit) sheets.
 *
 * @param {string} zoneId  — Zone filter (required)
 * @param {string} month   — "yyyy-MM" format (defaults to current month)
 * @returns {Object} { daily: [...], weekly: [...] }
 */
function getAuditHistory(zoneId, month) {
  return v2SafeExecute_(function() {
    if (!zoneId) return { daily: [], weekly: [] };
    var now = new Date();
    var targetMonth = month || Utilities.formatDate(now, TZ, "yyyy-MM");
    var ss = v2GetSpreadsheet_();

    // ── Daily Submissions ──
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var daily = [];
    for (var r = 1; r < dailyData.length; r++) {
      var row = dailyData[r];
      if (!row[DS_COL.SUBMISSION_ID]) continue;
      if (String(row[DS_COL.ZONE_ID]).trim() !== zoneId) continue;
      if (row[DS_COL.IS_DUPLICATE] === true || String(row[DS_COL.IS_DUPLICATE]).toUpperCase() === "TRUE") continue;
      var dateVal = row[DS_COL.SUBMISSION_DATE];
      var dateStr = dateVal instanceof Date
        ? Utilities.formatDate(dateVal, TZ, "yyyy-MM")
        : String(dateVal).substring(0, 7);
      if (dateStr !== targetMonth) continue;
      daily.push({
        submissionId: String(row[DS_COL.SUBMISSION_ID]),
        submissionDate: v2FormatDate_(row[DS_COL.SUBMISSION_DATE]),
        timestamp: v2FormatDate_(row[DS_COL.TIMESTAMP], "dd-MMM-yyyy HH:mm"),
        zoneId: String(row[DS_COL.ZONE_ID] || ""),
        zoneName: String(row[DS_COL.ZONE_NAME] || ""),
        zoneLeader: String(row[DS_COL.ZONE_LEADER] || ""),
        s1: row[DS_COL.S1_SCORE] || 0,
        s2: row[DS_COL.S2_SCORE] || 0,
        s3: row[DS_COL.S3_SCORE] || 0,
        s4: row[DS_COL.S4_SCORE] || 0,
        s5: row[DS_COL.S5_SCORE] || 0,
        totalPass: row[DS_COL.TOTAL_PASS] || 0,
        totalCriteria: row[DS_COL.TOTAL_CRITERIA] || 0,
        pctScore: Math.round(parseFloat(row[DS_COL.PCT_SCORE]) || 0),
        remarks: String(row[DS_COL.REMARKS] || ""),
        photoUrl: String(row[DS_COL.PHOTO_URL] || ""),
        isDuplicate: false,
        canCorrect: row[DS_COL.SUBMISSION_DATE] instanceof Date
          ? (now - row[DS_COL.SUBMISSION_DATE]) < 7 * 86400000
          : false
      });
    }

    // ── Weekly Audit ──
    var weeklyData = v2LoadSheet_(ss, "WeeklyAudit");
    var weekly = [];
    if (weeklyData.length > 1) {
      var headers = weeklyData[0];
      // Find key column indices from headers
      var wIdx = {};
      headers.forEach(function(h, i) { wIdx[String(h).trim()] = i; });
      for (var w = 1; w < weeklyData.length; w++) {
        var wr = weeklyData[w];
        if (!wr[0]) continue;
        var wzId = String(wIdx["zone_id"] !== undefined ? wr[wIdx["zone_id"]] : wr[2] || "").trim();
        if (wzId !== zoneId) continue;
        var wDup = wIdx["is_duplicate"] !== undefined
          ? (wr[wIdx["is_duplicate"]] === true || String(wr[wIdx["is_duplicate"]]).toUpperCase() === "TRUE")
          : false;
        if (wDup) continue;
        var wDate = wIdx["audit_date"] !== undefined ? wr[wIdx["audit_date"]] : wr[4];
        var wDateStr = wDate instanceof Date
          ? Utilities.formatDate(wDate, TZ, "yyyy-MM") : String(wDate || "").substring(0, 7);
        if (wDateStr !== targetMonth) continue;
        weekly.push({
          submissionId: String(wr[0] || ""),
          auditDate: v2FormatDate_(wDate),
          auditor: String(wIdx["auditor"] !== undefined ? wr[wIdx["auditor"]] : wr[5] || ""),
          zoneId: wzId,
          zoneName: String(wIdx["zone_name"] !== undefined ? wr[wIdx["zone_name"]] : wr[3] || ""),
          pctScore: Math.round(parseFloat(wIdx["pct_score"] !== undefined ? wr[wIdx["pct_score"]] : wr[14]) || 0),
          canCorrect: wDate instanceof Date ? (now - wDate) < 7 * 86400000 : false
        });
      }
    }

    // Sort newest first
    daily.sort(function(a,b){ return new Date(b.timestamp) - new Date(a.timestamp); });
    weekly.sort(function(a,b){ return new Date(b.auditDate) - new Date(a.auditDate); });
    return { daily: daily, weekly: [] };
  }, "getAuditHistory", { daily: [], weekly: [] }, "low");
}

/**
 * getZoneMapData — returns latest 5S score + open NC count per zone.
 * Called by HomePage zone map widget.
 * Returns: { "Z-01": { score, nc, last, s1, s2, s3, s4, s5 }, ... }
 */
function getZoneMapData() {
  return v2SafeExecute_(function() {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('pm5s_zonemap');
    if (hit) return JSON.parse(hit);

    var ss = v2GetSpreadsheet_();
    var CRITERIA_PER_PILLAR = 3; // 15 criteria / 5 pillars

    // ── Latest audit score per zone from DailySubmissions ──
    var dsData = v2LoadSheet_(ss, "DailySubmissions");
    var latest = {}; // zone_id -> row with most recent SUBMISSION_DATE
    for (var r = 1; r < dsData.length; r++) {
      var row = dsData[r];
      if (!row[DS_COL.SUBMISSION_ID]) continue;
      if (row[DS_COL.IS_DUPLICATE] === true || String(row[DS_COL.IS_DUPLICATE]).toUpperCase() === "TRUE") continue;
      var zid = String(row[DS_COL.ZONE_ID] || "").trim();
      if (!zid) continue;
      var dateVal = row[DS_COL.SUBMISSION_DATE];
      if (!latest[zid] || (dateVal instanceof Date && latest[zid].dateVal < dateVal)) {
        latest[zid] = { row: row, dateVal: dateVal instanceof Date ? dateVal : new Date(0) };
      }
    }

    // ── Open NC count per zone from NC_CAPA ──
    var ncSheet = ss.getSheetByName("NC_CAPA");
    var openNCs = {};
    if (ncSheet && ncSheet.getLastRow() > 1) {
      var ncData = ncSheet.getDataRange().getValues();
      for (var n = 1; n < ncData.length; n++) {
        var nr = ncData[n];
        var nZid = String(nr[1] || "").trim(); // col B = zone_id (new schema)
        var nStatus = String(nr[11] || "").trim().toUpperCase(); // col L = status (new schema)
        if (!nZid) continue;
        if (nStatus === "CLOSED" || nStatus === "DELETED") continue;
        openNCs[nZid] = (openNCs[nZid] || 0) + 1;
      }
    }

    // ── Build result map ──
    var result = {};
    Object.keys(latest).forEach(function(zid) {
      var row = latest[zid].row;
      var dateVal = latest[zid].dateVal;
      var score = Math.round(parseFloat(row[DS_COL.PCT_SCORE]) || 0);
      var s1 = Math.round((row[DS_COL.S1_SCORE] || 0) / CRITERIA_PER_PILLAR * 100);
      var s2 = Math.round((row[DS_COL.S2_SCORE] || 0) / CRITERIA_PER_PILLAR * 100);
      var s3 = Math.round((row[DS_COL.S3_SCORE] || 0) / CRITERIA_PER_PILLAR * 100);
      var s4 = Math.round((row[DS_COL.S4_SCORE] || 0) / CRITERIA_PER_PILLAR * 100);
      var s5 = Math.round((row[DS_COL.S5_SCORE] || 0) / CRITERIA_PER_PILLAR * 100);
      var lastStr = dateVal.getFullYear() > 1970
        ? Utilities.formatDate(dateVal, TZ, "d MMM") : "—";
      result[zid] = { score: score, nc: openNCs[zid] || 0, last: lastStr, s1: s1, s2: s2, s3: s3, s4: s4, s5: s5 };
    });

    // Fill NC counts for zones not yet audited
    Object.keys(openNCs).forEach(function(zid) {
      if (!result[zid]) result[zid] = { score: null, nc: openNCs[zid], last: "—", s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    });

    try { cache.put('pm5s_zonemap', JSON.stringify(result), 300); } catch (e) {}
    return result;
  }, "getZoneMapData", {}, "medium");
}

/** Clear the cached zone-map snapshot (call after audits / NC changes that affect scores or NC counts). */
function invalidateZoneMapCache_() {
  try { CacheService.getScriptCache().remove('pm5s_zonemap'); } catch (e) {}
}


// ============================================================================
// PILLAR TREND — for ChartsView
// ============================================================================

function getPillarTrend() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('PILLAR_TREND');
  if (cached) return JSON.parse(cached);

  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('Summary');
  if (!sh || sh.getLastRow() < 2) return {};

  var data = sh.getDataRange().getValues();
  // Schema: zone_id(0), month(1), overall(2), count(3), s1(4), s2(5), s3(6), s4(7), s5(8)
  var result = { S1: {}, S2: {}, S3: {}, S4: {}, S5: {} };

  data.slice(1).forEach(function(r) {
    var zone = String(r[0]).trim();
    var month = String(r[1]).trim();
    if (!zone || !month) return;
    var pillars = ['S1','S2','S3','S4','S5'];
    pillars.forEach(function(p, i) {
      if (!result[p][zone]) result[p][zone] = [];
      result[p][zone].push({ month: month, score: Number(r[4 + i]) || 0 });
    });
  });

  // Sort each zone's data by month
  ['S1','S2','S3','S4','S5'].forEach(function(p) {
    Object.keys(result[p]).forEach(function(z) {
      result[p][z].sort(function(a, b) { return a.month < b.month ? -1 : 1; });
    });
  });

  var json = JSON.stringify(result);
  try { cache.put('PILLAR_TREND', json, 600); } catch(e) {}
  return result;
}


// ============================================================================
// KANBAN DATA — for KanbanBoard
// ============================================================================

function getKanbanData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('KANBAN_DATA');
  if (cached) return JSON.parse(cached);

  var ss = v2GetSpreadsheet_();
  var now = new Date();
  var ncs = [];
  var redTags = [];

  // Build criterion → primary SQCDP dimension lookup
  // Keyed by: full id (e.g. 'S1-1'), pillar prefix (e.g. 'S1'), and normalized label
  var criterionSqcdpMap = {};
  try {
    var SQCDP_KEYS = ['S','Q','C','D','P'];
    var pillarVotes = {}; // pillar → {S:n, Q:n, ...}
    var anyCriteria = getZoneCriteria('Z-01');
    anyCriteria.forEach(function(c) {
      var sq = c.sqdcp || {};
      var primary = '';
      for (var ki = 0; ki < SQCDP_KEYS.length; ki++) {
        if (sq[SQCDP_KEYS[ki]]) { primary = SQCDP_KEYS[ki]; break; }
      }
      if (!primary) return;
      if (c.id) criterionSqcdpMap[c.id] = primary;
      if (c.labelEn) criterionSqcdpMap[c.labelEn.toLowerCase().trim()] = primary;
      // accumulate votes for pillar prefix
      var pfx = c.pillar || (c.id || '').split('-')[0];
      if (pfx) {
        if (!pillarVotes[pfx]) pillarVotes[pfx] = {};
        pillarVotes[pfx][primary] = (pillarVotes[pfx][primary] || 0) + 1;
      }
    });
    // key by pillar prefix → most-voted SQCDP
    Object.keys(pillarVotes).forEach(function(pfx) {
      var votes = pillarVotes[pfx];
      var best = Object.keys(votes).sort(function(a,b){return votes[b]-votes[a];})[0];
      criterionSqcdpMap[pfx] = best;
    });
  } catch(e) {}

  var ncSh = ss.getSheetByName('NC_CAPA');
  if (ncSh && ncSh.getLastRow() > 1) {
    var ncData = ncSh.getDataRange().getValues();
    // NC_CAPA schema: nc_id(0),zone_id(1),audit_date(2),description(3),type(4),
    //   pillar(5),sqcdp_dimension(6),corrective_action(7),responsible_person(8),
    //   target_date(9),actual_closure_date(10),status(11),root_cause(12),
    //   verified_by(13),verification_date(14),recurrence_count(15)
    ncData.slice(1).forEach(function(r) {
      if (!r[NC_COL.NC_ID]) return;
      var td = r[NC_COL.TARGET_DATE];
      var targetDate = td ? Utilities.formatDate(new Date(td), 'Asia/Kolkata', 'yyyy-MM-dd') : '';
      var status = String(r[NC_COL.STATUS] || 'Open');
      var daysOverdue = 0;
      if (td && status.toUpperCase() !== 'CLOSED') {
        var diff = now - new Date(td);
        daysOverdue = diff > 0 ? Math.floor(diff / 86400000) : 0;
      }
      ncs.push({
        id: String(r[NC_COL.NC_ID]),
        zone: String(r[NC_COL.ZONE_ID]),
        description: String(r[NC_COL.DESCRIPTION] || r[NC_COL.CORRECTIVE_ACTION] || ''),
        type: 'NC',
        pillar: String(r[NC_COL.PILLAR] || ''),
        sqcdp: (function() {
          var cid = String(r[NC_COL.PILLAR]);
          return criterionSqcdpMap[cid] ||
                 criterionSqcdpMap[cid.split('-')[0]] ||
                 criterionSqcdpMap[String(r[NC_COL.DESCRIPTION]).toLowerCase().trim()] || '';
        })(),
        owner: String(r[NC_COL.RESPONSIBLE] || r[NC_COL.AUDITOR] || ''),
        targetDate: targetDate,
        status: status,
        daysOverdue: daysOverdue,
        recurrenceCount: Number(r[NC_COL.RECURRENCE_COUNT]) || 0
      });
    });
  }

  var rtSh = ss.getSheetByName('RedTagRegister');
  if (rtSh && rtSh.getLastRow() > 1) {
    var rtData = rtSh.getDataRange().getValues();
    rtData.slice(1).forEach(function(r) {
      if (!r[RT_COL.TAG_ID]) return;
      var daysOpen = 0;
      if (r[RT_COL.CREATED]) {
        var diff = now - new Date(r[RT_COL.CREATED]);
        daysOpen = diff > 0 ? Math.floor(diff / 86400000) : 0;
      }
      redTags.push({
        tagNo: String(r[RT_COL.TAG_ID]),
        zone: String(r[RT_COL.ZONE_ID]),
        item: String(r[RT_COL.ITEM_DESC] || ''),
        reason: String(r[RT_COL.PROPOSED_ACTION] || r[RT_COL.ITEM_DESC] || ''),
        taggedBy: String(r[RT_COL.TAGGED_BY] || ''),
        status: String(r[RT_COL.STATUS] || 'Open'),
        daysOpen: daysOpen
      });
    });
  }

  var result = { ncs: ncs, redTags: redTags };
  var json = JSON.stringify(result);
  try { cache.put('KANBAN_DATA', json, 300); } catch(e) {}
  return result;
}


// ============================================================================
// ANALYTICS KPIs — for AnalyticsView
// ============================================================================

function getAnalyticsKPIs() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ANALYTICS_KPIS');
  if (cached) return JSON.parse(cached);

  var ss = v2GetSpreadsheet_();
  var now = new Date();

  var summary = ss.getSheetByName('Summary');
  var ncSh = ss.getSheetByName('NC_CAPA');
  var rtSh = ss.getSheetByName('RedTagRegister');

  var sumData = summary ? summary.getDataRange().getValues() : [];
  var ncData = ncSh ? ncSh.getDataRange().getValues() : [];
  var rtData = rtSh ? rtSh.getDataRange().getValues() : [];

  // Latest month scores per zone — keep row with max month string (YYYY-MM lexicographic)
  var latestScores = {};
  sumData.slice(1).forEach(function(r) {
    if (!r[0]) return;
    var score = Number(r[2]);
    if (isNaN(score) || score < 0 || score > 100) return; // skip stale rows with wrong schema
    var month = r[1] ? String(r[1]) : '';
    if (!/^\d{4}-\d{2}$/.test(month)) return; // skip rows with Date objects in month col
    var existing = latestScores[r[0]];
    if (!existing || month > existing.month) {
      latestScores[r[0]] = { overall: Number(r[2]) || 0, delta: r[14] || 0, month: month,
        s1: Number(r[4])||0, s2: Number(r[5])||0, s3: Number(r[6])||0, s4: Number(r[7])||0, s5: Number(r[8])||0 };
    }
  });

  var zones = Object.keys(latestScores);
  var scores = zones.map(function(z) { return latestScores[z].overall; });
  var plantAvg = scores.length ? Math.round(scores.reduce(function(a,b){return a+b;},0) / scores.length * 10) / 10 : 0;
  var zonesOnTarget = scores.filter(function(s){return s >= 80;}).length;
  var bestZone = zones.length ? zones[scores.indexOf(Math.max.apply(null,scores))] : '';
  var worstZone = zones.length ? zones[scores.indexOf(Math.min.apply(null,scores))] : '';

  var ncs = ncData.slice(1).filter(function(r){return r[0];});
  var isOpen = function(r) { return String(r[NC_COL.STATUS]).toUpperCase() !== 'CLOSED'; };
  var openNCs = ncs.filter(isOpen).length;
  var openOFIs = 0;
  var overdueNCs = ncs.filter(function(r){
    return isOpen(r) && r[NC_COL.TARGET_DATE] && new Date(r[NC_COL.TARGET_DATE]) < now;
  }).length;
  var repeatNCs = ncs.filter(function(r){return String(r[NC_COL.IS_REPEAT]).toLowerCase() === 'true';}).length;
  var closedNCs = ncs.filter(function(r){return !isOpen(r);}).length;
  var closureRate = (openNCs + closedNCs) > 0 ? Math.round(closedNCs / (openNCs + closedNCs) * 100) : 0;

  var avgAgeDays = 0;
  var openList = ncs.filter(function(r){return isOpen(r) && r[NC_COL.CREATED_DATE];});
  if (openList.length) {
    var totalDays = openList.reduce(function(s,r){ return s + Math.floor((now - new Date(r[NC_COL.CREATED_DATE])) / 86400000); }, 0);
    avgAgeDays = Math.round(totalDays / openList.length);
  }

  var activeRedTags = rtData.slice(1).filter(function(r){
    if (!r[RT_COL.TAG_ID]) return false;
    var st = String(r[RT_COL.STATUS]).toUpperCase();
    // Active = not yet disposed/closed/deleted (V2 phases: IDENTIFIED, EVALUATED)
    return st !== 'DISPOSED' && st !== 'CLOSED' && st !== 'DELETED';
  }).length;

  // SQCDP heatmap — map pillar prefix (S1→S, S2→Q, S3→C, S4→D, S5→P) from open NCs
  var pillarToSqcdp = { S1: 'S', S2: 'Q', S3: 'C', S4: 'D', S5: 'P' };
  var sqcdpHeatmap = { S: 0, Q: 0, C: 0, D: 0, P: 0 };
  ncs.filter(isOpen).forEach(function(r) {
    var pfx = String(r[NC_COL.PILLAR]).substring(0, 2).toUpperCase();
    var letter = pillarToSqcdp[pfx];
    if (letter) sqcdpHeatmap[letter]++;
  });

  // Pillar NC counts — col 5 = criterion_id (e.g. S1-C1 → pillar S1)
  var pillarNCs = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0 };
  ncs.filter(isOpen).forEach(function(r) {
    var p = String(r[NC_COL.PILLAR]).substring(0,2).toUpperCase();
    if (pillarNCs[p] !== undefined) pillarNCs[p]++;
  });

  // Zone scores array sorted by overall descending
  var zoneScores = Object.keys(latestScores).map(function(zoneId) {
    var z = latestScores[zoneId];
    return { zoneId: zoneId, overall: z.overall, s1: z.s1, s2: z.s2, s3: z.s3, s4: z.s4, s5: z.s5, delta: z.delta };
  }).sort(function(a, b) { return b.overall - a.overall; });

  var result = {
    plantAvg: plantAvg,
    zonesOnTarget: zonesOnTarget,
    totalZones: zones.length,
    bestZone: bestZone,
    worstZone: worstZone,
    openNCs: openNCs,
    openOFIs: openOFIs,
    overdueNCs: overdueNCs,
    repeatNCs: repeatNCs,
    closureRate: closureRate,
    avgAgeDays: avgAgeDays,
    activeRedTags: activeRedTags,
    sqcdpHeatmap: sqcdpHeatmap,
    pillarNCs: pillarNCs,
    zoneScores: zoneScores
  };

  var json = JSON.stringify(result);
  try { cache.put('ANALYTICS_KPIS', json, 300); } catch(e) {}
  return result;
}


// ============================================================================
// UPDATE NC STATUS — for Kanban card actions
// ============================================================================

function updateNCStatus(ncId, newStatus) {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('NC_CAPA');
  if (!sh) return { ok: false, error: 'NC_CAPA sheet not found' };
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(ncId)) {
      sh.getRange(i + 1, 12).setValue(newStatus); // col 12 = status (1-based)
      if (newStatus === 'Closed') {
        sh.getRange(i + 1, 11).setValue(new Date()); // col 11 = actual_closure_date
      }
      CacheService.getScriptCache().removeAll(['KANBAN_DATA', 'ANALYTICS_KPIS']);
      return { ok: true };
    }
  }
  return { ok: false, error: 'NC not found: ' + ncId };
}


// ============================================================================
// RAISE RED TAG — for RedTagForm
// ============================================================================

/**
 * Compatibility adapter — maps the legacy form payload to the canonical V2
 * createRedTag() so every red tag is written with a unique ID, zone name,
 * STATUS=IDENTIFIED, and correct cache invalidation. Quantity (no column in
 * RT_COL) is folded into remarks.
 * @param {Object} formData — { zone, item, quantity, category, reason, action, taggedBy, remarks }
 * @returns {Object} { ok, success, tagNo, message }
 */
function raiseRedTag(formData) {
  formData = formData || {};
  var remarks = String(formData.remarks || formData.reason || '');
  if (formData.quantity && Number(formData.quantity) > 1) {
    remarks = ('Qty: ' + formData.quantity + (remarks ? ' — ' + remarks : '')).trim();
  }
  var res = createRedTag({
    zoneId: String(formData.zone || ''),
    itemDescription: String(formData.item || ''),
    itemCategory: String(formData.category || 'Other'),
    proposedAction: String(formData.action || formData.reason || 'Discard'),
    estimatedValue: Number(formData.estValue) || 0,
    owner: String(formData.owner || formData.taggedBy || ''),
    remarks: remarks,
    createdBy: String(formData.createdBy || formData.taggedBy || '')
  });
  return {
    ok: !!(res && res.success),
    success: !!(res && res.success),
    tagNo: res && res.tagId,
    message: res && res.message
  };
}


// ============================================================================
// NC DETAIL — returns full NC_CAPA row for a single NC
// ============================================================================

function getNcDetail(ncId) {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('NC_CAPA');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[NC_COL.NC_ID]) !== String(ncId)) continue;
    var toIso = function(v) {
      if (!v) return '';
      try { return new Date(v).toISOString(); } catch(e) { return String(v); }
    };
    return {
      id:                   String(r[NC_COL.NC_ID]),
      createdDate:          toIso(r[NC_COL.CREATED_DATE]),
      zoneId:               String(r[NC_COL.ZONE_ID]),
      zoneName:             String(r[NC_COL.ZONE_NAME]),
      auditDate:            toIso(r[NC_COL.AUDIT_DATE]),
      pillar:               String(r[NC_COL.PILLAR]),
      description:          String(r[NC_COL.DESCRIPTION]),
      scoreGiven:           Number(r[NC_COL.SCORE_GIVEN]) || 0,
      auditor:              String(r[NC_COL.AUDITOR]),
      rootCause:            String(r[NC_COL.ROOT_CAUSE]),
      correctiveAction:     String(r[NC_COL.CORRECTIVE_ACTION]),
      preventiveAction:     String(r[NC_COL.PREVENTIVE_ACTION]),
      responsible:          String(r[NC_COL.RESPONSIBLE]),
      targetDate:           toIso(r[NC_COL.TARGET_DATE]),
      status:               String(r[NC_COL.STATUS]),
      closureDate:          toIso(r[NC_COL.CLOSURE_DATE]),
      verifiedBy:           String(r[NC_COL.VERIFIED_BY]),
      verificationRemarks:  String(r[NC_COL.VERIFICATION_REMARKS]),
      isRepeat:             String(r[NC_COL.IS_REPEAT]).toLowerCase() === 'true',
      recurrenceCount:      Number(r[NC_COL.RECURRENCE_COUNT]) || 0
    };
  }
  return null;
}

// ============================================================================
// UNIFIED ACTION LIST  (NC + TASK + RED_TAG merged view)
// ============================================================================

/**
 * Returns a merged, normalised list of NCs, Tasks, and Red Tags for the
 * Actions page, plus count breakdowns for tab badges.
 *
 * NOTE ON COUNTS: byType / byStatus / byPriority are computed over the full
 * zone-filtered set — BEFORE type / status / priority filters — so tab badges
 * always reflect total numbers regardless of the active tab/filter.
 *
 * @param {Object} [filters]
 * @param {string} [filters.zoneId]   — exact zone match; omit for all zones
 * @param {string} [filters.type]     — 'NC' | 'TASK' | 'RED_TAG' | 'ALL'
 * @param {string} [filters.status]   — 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'ALL'
 * @param {string} [filters.priority] — 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL'
 * @returns {{ items: Array, counts: Object }}
 */
function getUnifiedActionList(filters) {
  filters = filters || {};
  var typeFilter     = String(filters.type     || "ALL").toUpperCase();
  var statusFilter   = String(filters.status   || "ALL").toUpperCase();
  var priorityFilter = String(filters.priority || "ALL").toUpperCase();
  var zoneFilter     = filters.zoneId ? String(filters.zoneId).trim() : "";

  var now = new Date();

  // ── helpers ──────────────────────────────────────────────────────────────

  function daysSince(dateVal) {
    if (!dateVal) return 0;
    var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((now - d) / 86400000));
  }

  function mapNcStatus(raw) {
    var s = String(raw || "").toUpperCase().trim();
    if (s === "IN_PROGRESS" || s === "VERIFICATION") return "IN_PROGRESS";
    if (s === "CLOSED") return "CLOSED";
    // OPEN, ROOT_CAUSE, ACTION_PLANNED, OVERDUE and anything else → OPEN
    return "OPEN";
  }

  function mapTaskStatus(raw) {
    var s = String(raw || "").toUpperCase().trim();
    if (s === "IN_PROGRESS") return "IN_PROGRESS";
    if (s === "DONE" || s === "CLOSED") return "CLOSED";
    return "OPEN";
  }

  function mapRedTagStatus(raw) {
    var s = String(raw || "").toUpperCase().trim();
    if (s === "DISPOSED") return "IN_PROGRESS";
    if (s === "CLOSED") return "CLOSED";
    return "OPEN";
  }

  var PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

  // ── read each source defensively ─────────────────────────────────────────

  var ncItems = [];
  try {
    var ncRaw = getCAPAKanbanData({});
    if (Array.isArray(ncRaw)) {
      for (var i = 0; i < ncRaw.length; i++) {
        var nc = ncRaw[i];
        if (zoneFilter && nc.zoneId !== zoneFilter) continue;
        if (String(nc.status || "").toUpperCase().trim() === "DELETED") continue;
        var uStatus = mapNcStatus(nc.status);
        var age = typeof nc.ageDays === "number" ? nc.ageDays : daysSince(nc.createdDate);
        var overdue = !!nc.isOverdue;
        var pri = overdue ? "CRITICAL" : (age > 7 ? "HIGH" : "MEDIUM");
        ncItems.push({
          id:          nc.ncId,
          type:        "NC",
          title:       nc.criterionLabel || ("NC " + nc.ncId),
          description: nc.rootCause || nc.correctiveAction || "",
          zone:        nc.zoneName,
          zoneId:      nc.zoneId,
          owner:       nc.responsible,
          dueDate:     nc.targetDate || "",
          rawStatus:   nc.status,
          status:      uStatus,
          priority:    pri,
          ageDays:     age,
          isOverdue:   overdue,
          createdDate: nc.createdDate || ""
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: NC read error — " + e.message);
  }

  var taskItems = [];
  try {
    var taskRaw = getTaskBoardData({});
    if (Array.isArray(taskRaw)) {
      for (var j = 0; j < taskRaw.length; j++) {
        var t = taskRaw[j];
        if (zoneFilter && t.zoneId !== zoneFilter) continue;
        if (String(t.status || "").toUpperCase().trim() === "DELETED") continue;
        var tStatus = mapTaskStatus(t.status);
        var tAge    = daysSince(t.createdDate);
        var tPri    = String(t.priority || "MEDIUM").toUpperCase().trim();
        if (!PRIORITY_RANK.hasOwnProperty(tPri)) tPri = "MEDIUM";
        var tDue    = t.dueDate || "";
        var tOver   = tDue ? (new Date(tDue) < now && tStatus !== "CLOSED") : false;
        taskItems.push({
          id:          t.taskId,
          type:        "TASK",
          title:       t.title,
          description: t.description,
          zone:        t.zoneName,
          zoneId:      t.zoneId,
          owner:       t.assignedTo,
          dueDate:     tDue,
          rawStatus:   t.status,
          status:      tStatus,
          priority:    tPri,
          ageDays:     tAge,
          isOverdue:   tOver,
          createdDate: t.createdDate || ""
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: Task read error — " + e.message);
  }

  var rtItems = [];
  try {
    var rtRaw = getRedTagData({});
    if (Array.isArray(rtRaw)) {
      for (var k = 0; k < rtRaw.length; k++) {
        var rt = rtRaw[k];
        if (zoneFilter && rt.zoneId !== zoneFilter) continue;
        if (String(rt.status || "").toUpperCase().trim() === "DELETED") continue;
        var rtStatus = mapRedTagStatus(rt.status);
        var rtAge    = daysSince(rt.createdDate);
        var rtPri    = rtAge > 14 ? "HIGH" : (rtAge > 7 ? "MEDIUM" : "LOW");
        var rtDue    = rt.deadline || "";
        var rtOver   = rtDue ? (new Date(rtDue) < now && rtStatus !== "CLOSED") : false;
        rtItems.push({
          id:          rt.tagId,
          type:        "RED_TAG",
          title:       rt.itemDescription,
          description: rt.proposedAction || "",
          zone:        rt.zoneName,
          zoneId:      rt.zoneId,
          owner:       rt.owner || rt.taggedBy || "",
          dueDate:     rtDue,
          rawStatus:   rt.status,
          status:      rtStatus,
          priority:    rtPri,
          ageDays:     rtAge,
          isOverdue:   rtOver,
          createdDate: rt.createdDate || ""
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: RedTag read error — " + e.message);
  }

  // ── full zone-filtered pool (used for counts) ─────────────────────────────
  var pool = ncItems.concat(taskItems).concat(rtItems);

  // ── compute counts over zone-filtered pool (before type/status/pri filters)
  var counts = {
    byType:     { NC: 0, TASK: 0, RED_TAG: 0 },
    byStatus:   { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
    byTypeStatus: {
      NC:      { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      TASK:    { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      RED_TAG: { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 }
    },
    byPriority: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    total:      pool.length
  };
  for (var c = 0; c < pool.length; c++) {
    var item = pool[c];
    if (counts.byType[item.type]     !== undefined) counts.byType[item.type]++;
    if (counts.byStatus[item.status] !== undefined) counts.byStatus[item.status]++;
    if (counts.byTypeStatus[item.type] && counts.byTypeStatus[item.type][item.status] !== undefined) counts.byTypeStatus[item.type][item.status]++;
    if (counts.byPriority[item.priority] !== undefined) counts.byPriority[item.priority]++;
  }

  // ── apply type / status / priority filters ───────────────────────────────
  var filtered = pool.filter(function(item) {
    if (typeFilter     !== "ALL" && item.type     !== typeFilter)     return false;
    if (statusFilter   !== "ALL" && item.status   !== statusFilter)   return false;
    if (priorityFilter !== "ALL" && item.priority !== priorityFilter) return false;
    return true;
  });

  // ── sort: priority rank asc, isOverdue desc, ageDays desc ────────────────
  filtered.sort(function(a, b) {
    var pr = (PRIORITY_RANK[a.priority] || 2) - (PRIORITY_RANK[b.priority] || 2);
    if (pr !== 0) return pr;
    var ov = (b.isOverdue ? 1 : 0) - (a.isOverdue ? 1 : 0);
    if (ov !== 0) return ov;
    return b.ageDays - a.ageDays;
  });

  return { items: filtered, counts: counts };
}

// ============================================================================
// AUDIT DETAIL VIEW — per-criterion scores/remarks/photos (AuditLineItems sheet)
// ============================================================================

/** List recent submitted audits (grouped from AuditLineItems), newest first. */
function getRecentAudits(limit) {
  return v2SafeExecute_(function () {
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName("AuditLineItems");
    if (!sheet || sheet.getLastRow() < 2) return { audits: [] };
    var data = sheet.getDataRange().getValues();
    var groups = {};
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var sid = String(r[0]); if (!sid) continue;
      if (!groups[sid]) {
        groups[sid] = { submissionId: sid, zoneId: String(r[1]), zoneName: String(r[2]),
          timestamp: r[3] ? new Date(r[3]).toISOString() : "", tsMs: r[3] ? new Date(r[3]).getTime() : 0,
          auditor: String(r[4]), count: 0, scoreSum: 0, maxSum: 0, photos: 0 };
      }
      var g = groups[sid];
      g.count++;
      var sc = parseInt(r[7], 10);
      if (!isNaN(sc)) { g.scoreSum += sc; g.maxSum += 4; }
      if (r[9]) g.photos++;
    }
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.pct = g.maxSum > 0 ? Math.round(100 * g.scoreSum / g.maxSum) : 0;
      return g;
    });
    list.sort(function (a, b) { return b.tsMs - a.tsMs; });
    if (limit) list = list.slice(0, limit);
    return { audits: list };
  }, "getRecentAudits", { audits: [] });
}

/** Full per-criterion detail for one submitted audit. */
function getAuditDetail(submissionId) {
  return v2SafeExecute_(function () {
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName("AuditLineItems");
    if (!sheet || sheet.getLastRow() < 2) return { found: false };
    // criterionId → label map from the checklist schema
    var labelMap = {};
    try {
      var schema = (typeof getChecklistSchema === "function") ? getChecklistSchema() : null;
      if (schema && schema.criteria) {
        schema.criteria.forEach(function (c) { labelMap[String(c.id)] = c.labelEn || c.label || c.labelHi || ""; });
      }
    } catch (e) {}

    var data = sheet.getDataRange().getValues();
    var header = null, items = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (String(r[0]) !== String(submissionId)) continue;
      if (!header) header = { submissionId: String(r[0]), zoneId: String(r[1]),
        zoneName: String(r[2]), timestamp: r[3] ? new Date(r[3]).toISOString() : "", auditor: String(r[4]) };
      var cid = String(r[5]);
      items.push({ criterionId: cid, label: labelMap[cid] || "", pillar: String(r[6]),
        score: r[7] === "" ? null : parseInt(r[7], 10), remark: String(r[8] || ""),
        photoUrl: String(r[9] || ""), photoFileId: String(r[10] || "") });
    }
    if (!header) return { found: false };
    return { found: true, header: header, items: items };
  }, "getAuditDetail", { found: false });
}
