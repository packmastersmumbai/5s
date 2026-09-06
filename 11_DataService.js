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

    // ── Active red-tag count per zone from RedTagRegister ──
    var openRedTags = {};
    var rtSh = ss.getSheetByName("RedTagRegister");
    if (rtSh && rtSh.getLastRow() > 1) {
      var rtD = rtSh.getDataRange().getValues();
      for (var g = 1; g < rtD.length; g++) {
        if (!rtD[g][0]) continue;
        var rtZ = String(rtD[g][RT_COL.ZONE_ID] || "").trim();
        if (!rtZ) continue;
        if (/^(disposed|returned|scrapped)$/i.test(String(rtD[g][RT_COL.STATUS] || "").trim())) continue;
        openRedTags[rtZ] = (openRedTags[rtZ] || 0) + 1;
      }
    }

    // ── Open task count per zone from TaskBoard ──
    var openTasks = {};
    var tkSh = ss.getSheetByName("TaskBoard");
    if (tkSh && tkSh.getLastRow() > 1) {
      var tkD = tkSh.getDataRange().getValues();
      for (var q = 1; q < tkD.length; q++) {
        var tkZ = String(tkD[q][TASK_COL.ZONE_ID] || "").trim();
        if (!tkZ) continue;
        var tkSt = String(tkD[q][TASK_COL.STATUS] || "").trim();
        if (tkSt === STATUS.DONE || tkSt === STATUS.DELETED) continue;
        openTasks[tkZ] = (openTasks[tkZ] || 0) + 1;
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
      result[zid] = { score: score, nc: openNCs[zid] || 0, redTags: openRedTags[zid] || 0, tasks: openTasks[zid] || 0,
                      last: lastStr, s1: s1, s2: s2, s3: s3, s4: s4, s5: s5 };
    });

    // Ensure zones that have only NCs / red tags / tasks (no audit yet) still appear.
    [openNCs, openRedTags, openTasks].forEach(function(mapObj) {
      Object.keys(mapObj).forEach(function(zid) {
        if (!result[zid]) result[zid] = { score: null, nc: 0, redTags: 0, tasks: 0, last: "—", s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
        result[zid].nc = openNCs[zid] || result[zid].nc || 0;
        result[zid].redTags = openRedTags[zid] || result[zid].redTags || 0;
        result[zid].tasks = openTasks[zid] || result[zid].tasks || 0;
      });
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
    var allCriteria = [];
    var zc = getZoneConfig() || {};
    Object.keys(zc).forEach(function(z) {
      (zc[z].criteria || []).forEach(function(c) { allCriteria.push(c); });
    });
    if (!allCriteria.length) allCriteria = getZoneCriteria('Z-01');
    allCriteria.forEach(function(c) {
      // Field is spelled sqdcp in the criteria data; sqcdp everywhere else.
      var sq = c.sqcdp || c.sqdcp || {};
      var dims = [];
      for (var ki = 0; ki < SQCDP_KEYS.length; ki++) {
        if (sq[SQCDP_KEYS[ki]]) dims.push(SQCDP_KEYS[ki]);
      }
      if (!dims.length) return;
      // Keep every dimension. 284 of 420 criteria carry more than one, and
      // taking only the first silently dropped the rest from SQCDP counts.
      if (c.id) criterionSqcdpMap[c.id] = dims;
      if (c.labelEn) criterionSqcdpMap[c.labelEn.toLowerCase().trim()] = dims;
      var pfx = c.pillar || (c.id || '').split('-')[0];
      if (pfx) {
        if (!pillarVotes[pfx]) pillarVotes[pfx] = {};
        dims.forEach(function(d) { pillarVotes[pfx][d] = (pillarVotes[pfx][d] || 0) + 1; });
      }
    });
    // key by pillar prefix → most-voted SQCDP
    Object.keys(pillarVotes).forEach(function(pfx) {
      var votes = pillarVotes[pfx];
      var best = Object.keys(votes).sort(function(a,b){return votes[b]-votes[a];})[0];
      criterionSqcdpMap[pfx] = [best];
    });
  } catch(e) {}

  function _sqcdpFor_(r) {
    var cid = String(r[NC_COL.PILLAR]);
    return criterionSqcdpMap[cid] ||
           criterionSqcdpMap[cid.split('-')[0]] ||
           criterionSqcdpMap[String(r[NC_COL.DESCRIPTION]).toLowerCase().trim()] || [];
  }

  var ncSh = ss.getSheetByName('NC_CAPA');
  if (ncSh && ncSh.getLastRow() > 1) {
    var ncData = ncSh.getDataRange().getValues();
    // NC_CAPA is 22 columns; address it through NC_COL, never by literal index.
    // nc_id(0),created_date(1),zone_id(2),zone_name(3),audit_date(4),
    //   criterion_id(5),criterion_label(6),score_given(7),auditor_email(8),
    //   root_cause(9),corrective_action(10),preventive_action(11),
    //   responsible_person(12),target_date(13),status(14),closure_date(15),
    //   verified_by(16),verification_remarks(17),is_repeat_nc(18),
    //   repeat_count(19),photo_url(20),photo_file_id(21)
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
        // sqcdp stays the primary dimension (string) for existing consumers;
        // sqcdpAll carries every dimension the criterion actually maps to.
        sqcdp: _sqcdpFor_(r)[0] || '',
        sqcdpAll: _sqcdpFor_(r),
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
      /* These two writes were off by three columns, and the comments asserting
         otherwise are why it survived. Verified against the live header:
           index 10 = corrective_action   index 11 = preventive_action
           index 14 = status              index 15 = closure_date
         so 1-based those are 15 and 16, not 12 and 11. Every close through this
         function wrote "Closed" into preventive_action and a date into
         corrective_action while status stayed OVERDUE — silently destroying the
         CAPA text and leaving the record open. handleDwmDone_ calls this too, so
         closing an NC from DWM did the same.
         Status values are stored upper-case elsewhere (STATUS.CLOSED); normalise
         so a record closed here matches one closed anywhere else. */
      var _st = String(newStatus || '').toUpperCase() === 'CLOSED'
        ? 'CLOSED' : String(newStatus);
      sh.getRange(i + 1, NC_COL.STATUS + 1).setValue(_st);
      if (_st === 'CLOSED') {
        sh.getRange(i + 1, NC_COL.CLOSURE_DATE + 1).setValue(new Date());
      }
      CacheService.getScriptCache().removeAll(['KANBAN_DATA', 'ANALYTICS_KPIS']);
      /* Closing an NC was silent — the channel announced every problem raised
         and no problem solved. Non-blocking: a Telegram failure must not undo
         a status write that has already committed. */
      if (_st === 'CLOSED' && typeof tg5sBroadcast_ === 'function') {
        try {
          var ncZone = String(data[i][NC_COL.ZONE_ID] || '').trim();
          tg5sBroadcast_(_tg5sCard_({
            kind: 'NC', status: 'done',
            link: _tg5sDeep_('?v2=1&action=record&type=nc&id=' + ncId),
            zoneId: ncZone, zoneName: (typeof v2GetZoneName_ === 'function' ? v2GetZoneName_(ncZone) : ''),
            facts: [ TelegramLib.esc(String(data[i][NC_COL.DESCRIPTION] || ncId)) ],
            action: 'closed',
            by: _tg5sWho_(v2GetCurrentUser_())
          }), [{ text: '📋 Open record', url: _tg5sDeep_('?v2=1&action=record&type=nc&id=' + ncId) }]);
        } catch (e) { Logger.log('NC close broadcast skipped: ' + e.message); }
      }
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
  // Optional evidence photos (array of base64). Uploaded here so createRedTag
  // keeps taking a plain URL; an upload failure never blocks the red tag.
  var zoneId = String(formData.zone || '');
  var rtPhotoUrls = [];
  if (Array.isArray(formData.photosB64)) {
    formData.photosB64.forEach(function (b64, pIdx) {
      if (!b64) return;
      try {
        var pname = 'RT_' + zoneId + '_' + Date.now() + (pIdx ? '_' + (pIdx + 1) : '') + '.jpg';
        var pres = uploadPhotoToDrive(b64, pname, zoneId);
        if (pres && pres.thumbnailUrl) rtPhotoUrls.push(pres.thumbnailUrl);
      } catch (e) { Logger.log('Red tag photo skipped (#' + pIdx + '): ' + e.message); }
    });
  }
  var res = createRedTag({
    zoneId: zoneId,
    itemDescription: String(formData.item || ''),
    itemCategory: String(formData.category || 'Other'),
    proposedAction: String(formData.action || formData.reason || 'Discard'),
    estimatedValue: Number(formData.estValue) || 0,
    owner: String(formData.owner || formData.taggedBy || ''),
    deadline: String(formData.deadline || ''),
    remarks: remarks,
    photoUrl: rtPhotoUrls.join(','),
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
      // Column 5 is criterion_id in the sheet header. It was being surfaced as
      // "pillar" because createCAPA wrote the pillar into it; both names are
      // returned so the detail view can show the criterion AND derive the
      // pillar from its prefix (S1-C2 -> S1) for older rows.
      criterionId:          String(r[NC_COL.PILLAR] || ""),
      pillar:               String(r[NC_COL.PILLAR] || "").split("-")[0],
      description:          String(r[NC_COL.DESCRIPTION]),
      // A blank cell means "not recorded", not "scored zero" — 41 of 79 live
      // rows were blank and every one of them displayed as 0, which reads as a
      // total failure on a 0-4 scale.
      scoreGiven:           (r[NC_COL.SCORE_GIVEN] === "" || r[NC_COL.SCORE_GIVEN] === null ||
                             r[NC_COL.SCORE_GIVEN] === undefined) ? null : Number(r[NC_COL.SCORE_GIVEN]),
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
      recurrenceCount:      Number(r[NC_COL.RECURRENCE_COUNT]) || 0,
      photoUrls:            String(r[NC_COL.PHOTO_URL] || '').split(',').filter(Boolean),
      photoFileIds:         String(r[NC_COL.PHOTO_FILE_ID] || '').split(',').filter(Boolean)
    };
  }
  return null;
}

// ============================================================================
// PUBLIC RECORD — read-only single record for the login-free record view
// (Telegram links open this; edits still require sign-in.)
// ============================================================================
/** Fetches a Drive-hosted photo (by fileId, extracted from our own thumbnail
 *  URL format) and returns it as a data: URL. Used by the public RecordView
 *  page's photo lightbox — drive.google.com/thumbnail does not send CORS
 *  headers, so a canvas can load the <img> but cannot read it back
 *  (toDataURL throws "tainted canvas"). Routing through Apps Script avoids
 *  that entirely: the annotator draws from a same-origin data: URL. */
function getPhotoAsDataUrl(fileId) {
  return v2SafeExecute_(function() {
    fileId = String(fileId || '').trim();
    if (!fileId) return null;
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var mime = blob.getContentType() || 'image/jpeg';
    var b64 = Utilities.base64Encode(blob.getBytes());
    return 'data:' + mime + ';base64,' + b64;
  }, 'getPhotoAsDataUrl', null);
}

/** Extracts the Drive fileId from our own "https://drive.google.com/thumbnail?id=XXX&sz=..." format. */
function _extractDriveFileId_(url) {
  var m = String(url || '').match(/[?&]id=([^&]+)/);
  return m ? m[1] : '';
}

/** Short TTL — a Telegram link gets bursts of views right after a broadcast;
 *  this avoids a full sheet scan per viewer without risking stale data for
 *  more than a few seconds. publicRecordAction() clears it on write. */
function _publicRecordCacheKey_(type, id) { return 'pm5s_pubrec_' + type + '_' + id; }

function getPublicRecord(type, id) {
  type = String(type || '').toLowerCase();
  id = String(id || '').trim();
  if (!id) return null;
  var cache = CacheService.getScriptCache();
  var cacheKey = _publicRecordCacheKey_(type, id);
  try {
    var cached = cache.get(cacheKey);
    if (cached !== null) return cached === '__NULL__' ? null : JSON.parse(cached);
  } catch (e) {}
  var result = _getPublicRecordUncached_(type, id);
  // Cache misses too (short TTL) — an expired/typo'd link would otherwise
  // re-run a full 3-sheet scan on every hit with nothing to show for it.
  try { cache.put(cacheKey, result ? JSON.stringify(result) : '__NULL__', 20); } catch (e) {}
  return result;
}

function _getPublicRecordUncached_(type, id) {
  var fmtD = function(v){ if (!v) return ''; try { return Utilities.formatDate(new Date(v), 'Asia/Kolkata', 'yyyy-MM-dd'); } catch(e){ return String(v); } };
  var ss = v2GetSpreadsheet_();

  if (type === 'nc' || type === 'ncr' || type === 'capa') {
    var d = getNcDetail(id);
    if (!d) return null;
    return { type: 'NCR', id: d.id, title: d.description, status: d.status,
      zone: (d.zoneId + (d.zoneName ? ' — ' + d.zoneName : '')),
      photoUrls: d.photoUrls || [],
      photoFileIds: (d.photoFileIds && d.photoFileIds.length) ? d.photoFileIds : (d.photoUrls || []).map(_extractDriveFileId_),
      fields: [
        { l: 'Pillar', v: d.pillar }, { l: 'Responsible', v: d.responsible },
        { l: 'Target date', v: fmtD(d.targetDate) }, { l: 'Root cause', v: d.rootCause },
        { l: 'Corrective action', v: d.correctiveAction }, { l: 'Preventive action', v: d.preventiveAction },
        { l: 'Verified by', v: d.verifiedBy }, { l: 'Created', v: fmtD(d.createdDate) }
      ] };
  }
  if (type === 'task') {
    var ts = ss.getSheetByName('TaskBoard'); if (!ts) return null;
    var td = ts.getDataRange().getValues();
    for (var r = 1; r < td.length; r++) {
      if (String(td[r][TASK_COL.TASK_ID]).trim() !== id) continue;
      var t = td[r];
      var taskZoneName = String(t[TASK_COL.ZONE_NAME] || '');
      return { type: 'Task', id: id, title: String(t[TASK_COL.TITLE] || ''), status: String(t[TASK_COL.STATUS] || ''),
        zone: String(t[TASK_COL.ZONE_ID] || '') + (taskZoneName ? ' — ' + taskZoneName : ''),
        photoUrls: String(t[TASK_COL.PHOTO_URL] || '').split(',').filter(Boolean),
        photoFileIds: String(t[TASK_COL.PHOTO_URL] || '').split(',').filter(Boolean).map(_extractDriveFileId_),
        fields: [
          { l: 'Description', v: String(t[TASK_COL.DESCRIPTION] || '') }, { l: 'Priority', v: String(t[TASK_COL.PRIORITY] || '') },
          { l: 'Assigned to', v: String(t[TASK_COL.ASSIGNED_TO] || '') }, { l: 'Due', v: fmtD(t[TASK_COL.DUE_DATE]) },
          { l: 'Created', v: fmtD(t[TASK_COL.CREATED]) }
        ] };
    }
    return null;
  }
  if (type === 'rt' || type === 'redtag') {
    var rs = ss.getSheetByName('RedTagRegister'); if (!rs) return null;
    var rd = rs.getDataRange().getValues();
    for (var r2 = 1; r2 < rd.length; r2++) {
      if (String(rd[r2][RT_COL.TAG_ID]).trim() !== id) continue;
      var g = rd[r2];
      return { type: 'Red Tag', id: id, title: String(g[RT_COL.ITEM_DESC] || ''), status: String(g[RT_COL.STATUS] || ''),
        zone: String(g[RT_COL.ZONE_ID] || ''),
        photoUrls: String(g[RT_COL.PHOTO_URL] || '').split(',').filter(Boolean),
        photoFileIds: String(g[RT_COL.PHOTO_FILE_ID] || '').split(',').filter(Boolean),
        fields: [
          { l: 'Category', v: String(g[RT_COL.ITEM_CATEGORY] || '') }, { l: 'Proposed action', v: String(g[RT_COL.PROPOSED_ACTION] || '') },
          { l: 'Owner', v: String(g[RT_COL.OWNER] || '') }, { l: 'Deadline', v: fmtD(g[RT_COL.DEADLINE]) },
          { l: 'Created', v: fmtD(g[RT_COL.CREATED]) }
        ] };
    }
    return null;
  }
  if (type === 'gw' || type === 'gemba' || type === 'walk') {
    var gs = ss.getSheetByName('GembaWalks'); if (!gs) return null;
    var gd = gs.getDataRange().getValues();
    for (var r3 = 1; r3 < gd.length; r3++) {
      if (String(gd[r3][GW_COL.WALK_ID]).trim() !== id) continue;
      var w = gd[r3];
      var wType = String(w[GW_COL.WALK_TYPE] || '');

      /* The walk's whole value is WHICH checks failed. Stored as
         {questionId: "yes"|"no"|"na"}, a question id on its own means nothing to
         a reader, so pair each answer with its question text. The config is the
         only place that mapping exists; if it has moved on since the walk, fall
         back to the raw id rather than dropping the finding. */
      var qText = {};
      try {
        /* Look in the walk's own type first, then every other type. Walk types
           have been renamed since (a walk recorded as "Safety" predates
           "Health & Safety"), and a type-only lookup silently degraded every
           older walk to a list of bare question ids. Question ids are unique
           across the whole config (verified: 62 questions, no collisions), so
           the wider search cannot pick the wrong text. */
        var _cfg = {};
        try { _cfg = JSON.parse(PropertiesService.getScriptProperties()
                .getProperty("GEMBA_WALK_CONFIG") || "{}"); } catch (e2) {}
        var _types = Object.keys(_cfg);
        if (_cfg[wType]) _types = [wType].concat(_types.filter(function (t) { return t !== wType; }));
        _types.forEach(function (t) {
          (_cfg[t] || []).forEach(function (q) {
            if (qText[q.questionId]) return;   // first match wins (own type)
            qText[q.questionId] = { text: q.text, sqcdp: q.sqcdp || "", category: q.category || "" };
          });
        });
      } catch (e) {}

      var answers = {};
      try { answers = JSON.parse(String(w[GW_COL.RESPONSES_JSON] || '{}')); } catch (e) {}

      var findings = [];
      Object.keys(answers).forEach(function (qId) {
        var a = String(answers[qId]).toLowerCase();
        var meta = qText[qId] || {};
        findings.push({
          q: meta.text || qId,
          a: a === 'yes' ? 'Yes' : a === 'no' ? 'No' : a === 'na' ? 'N/A' : String(answers[qId]),
          fail: a === 'no',
          sqcdp: meta.sqcdp || '',
          category: meta.category || ''
        });
      });
      // Failures first — that is what anyone opening the record came to see.
      findings.sort(function (x, y) { return (y.fail ? 1 : 0) - (x.fail ? 1 : 0); });

      var taskIds = [];
      try { taskIds = JSON.parse(String(w[GW_COL.TASK_IDS_JSON] || '[]')) || []; } catch (e) {}

      var gPhotos = String(w[GW_COL.PHOTO_URLS] || '').split(',').filter(Boolean);
      var noN = Number(w[GW_COL.NO_COUNT] || 0);
      return {
        type: 'Gemba Walk', id: id,
        title: wType + ' walk — ' + noN + ' finding' + (noN === 1 ? '' : 's'),
        status: String(w[GW_COL.COMPLIANCE_PCT] || 0) + '% compliant',
        zone: String(w[GW_COL.ZONE_ID] || '') +
              (w[GW_COL.ZONE_NAME] ? ' — ' + String(w[GW_COL.ZONE_NAME]) : ''),
        photoUrls: gPhotos,
        photoFileIds: gPhotos.map(_extractDriveFileId_),
        findings: findings,
        taskIds: taskIds,
        fields: [
          { l: 'Walk type', v: wType },
          { l: 'Walked by', v: String(w[GW_COL.WALKER_NAME] || '') },
          { l: 'Date', v: fmtD(w[GW_COL.TIMESTAMP]) },
          { l: 'Checks', v: String(w[GW_COL.TOTAL_Q] || 0) + ' asked · ' +
              String(w[GW_COL.YES_COUNT] || 0) + ' pass · ' + noN + ' fail · ' +
              String(w[GW_COL.NA_COUNT] || 0) + ' n/a' },
          { l: 'Observations', v: String(w[GW_COL.OBSERVATIONS] || '') },
          { l: 'Actions raised', v: taskIds.length ? taskIds.join(', ') : 'none' }
        ] };
    }
    return null;
  }
  if (type === 'audit' || type === 'au') {
    var ad = getAuditDetail(id);
    if (!ad || !ad.found) return null;
    var ah = ad.header || {}, aItems = ad.items || [];
    var aSum = 0, aMax = 0, aPhotos = [], aFileIds = [];
    aItems.forEach(function (it) {
      if (it.score !== null && it.score !== undefined && !isNaN(it.score)) { aSum += it.score; aMax += 4; }
      (it.photoUrls || []).forEach(function (u) { if (u) aPhotos.push(u); });
      (it.photoFileIds || []).forEach(function (f) { if (f) aFileIds.push(f); });
    });
    var aPct = aMax > 0 ? Math.round(100 * aSum / aMax) : 0;

    /* The per-criterion scores ARE the audit; a header with a percentage and
       nothing else is what the Telegram link used to land on. Reuse the same
       findings block the Gemba view uses: low scores first, on a red bar. */
    var aFind = aItems.map(function (it) {
      var sc = (it.score === null || it.score === undefined || isNaN(it.score)) ? null : Number(it.score);
      return {
        q: it.label || it.criterionId,
        a: sc === null ? '—' : (sc + '/4'),
        fail: sc !== null && sc <= 2,
        sqcdp: it.pillar || '',
        category: it.remark || '',
        photoUrls: it.photoUrls || [],
        photoFileIds: it.photoFileIds || []
      };
    });
    aFind.sort(function (x, y) { return (y.fail ? 1 : 0) - (x.fail ? 1 : 0); });

    /* What came OUT of this audit. Without it the record answers "what was
       wrong" and never "did anything happen" — a closed-out audit and one whose
       every finding is still open read identically. */
    var aActs = { actions: [], byCriterion: {}, summary: { open: 0, progress: 0, closed: 0, total: 0 } };
    try {
      if (typeof getAuditActions === 'function') aActs = getAuditActions(id) || aActs;
    } catch (e) { Logger.log('audit actions skipped for ' + id + ': ' + e.message); }

    /* Hang each action on the criterion it came from, so a failed line shows
       its own follow-up rather than sending the reader to a separate list. */
    aFind.forEach(function (f) {
      var cid = '';
      for (var ai = 0; ai < aItems.length; ai++) {
        if ((aItems[ai].label || aItems[ai].criterionId) === f.q) { cid = aItems[ai].criterionId; break; }
      }
      f.actions = (cid && aActs.byCriterion[cid]) ? aActs.byCriterion[cid] : [];
    });

    var aFields = [
      { l: 'Auditor', v: String(ah.auditor || '') },
      { l: 'Date', v: fmtD(ah.timestamp) },
      { l: 'Criteria scored', v: String(aItems.length) },
      { l: 'Score', v: aSum + ' of ' + aMax + ' (' + aPct + '%)' }
    ];
    if (aActs.summary.total) {
      aFields.push({
        l: 'Actions raised',
        v: aActs.summary.total + ' · ' + aActs.summary.closed + ' closed, ' +
           aActs.summary.progress + ' in progress, ' + aActs.summary.open + ' open'
      });
    }

    return {
      type: 'Audit', id: id,
      title: '5S audit — ' + aPct + '%',
      status: aPct + '% scored',
      zone: String(ah.zoneId || '') + (ah.zoneName ? ' — ' + ah.zoneName : ''),
      photoUrls: aPhotos,
      photoFileIds: aFileIds.length ? aFileIds : aPhotos.map(_extractDriveFileId_),
      findings: aFind,
      auditActions: aActs.actions,
      auditActionSummary: aActs.summary,
      fields: aFields };
  }
  if (type === 'kz' || type === 'kaizen') {
    var ks = ss.getSheetByName('KaizenSuggestions'); if (!ks) return null;
    var kd = ks.getDataRange().getValues();
    for (var r4 = 1; r4 < kd.length; r4++) {
      if (String(kd[r4][KZ_COL.KAIZEN_ID]).trim() !== id) continue;
      var k = kd[r4];
      var kPhotos = String(k[KZ_COL.PHOTO_URL] || '').split(',').filter(Boolean);
      var money = function (x) {
        var n = Number(x);
        return (x === '' || x == null || isNaN(n)) ? '' : '₹' + n.toLocaleString('en-IN');
      };
      return {
        type: 'Kaizen', id: id,
        title: String(k[KZ_COL.TITLE] || ''),
        status: String(k[KZ_COL.STATUS] || ''),
        zone: String(k[KZ_COL.ZONE_ID] || '') +
              (k[KZ_COL.ZONE_NAME] ? ' — ' + String(k[KZ_COL.ZONE_NAME]) : ''),
        photoUrls: kPhotos,
        photoFileIds: kPhotos.map(_extractDriveFileId_),
        fields: [
          { l: 'Suggested by', v: String(k[KZ_COL.SUBMITTER] || '') },
          { l: 'Category', v: String(k[KZ_COL.CATEGORY] || '') },
          { l: 'Idea', v: String(k[KZ_COL.DESCRIPTION] || '') },
          { l: 'Expected benefit', v: String(k[KZ_COL.EXPECTED_BENEFIT] || '') },
          { l: 'Estimated saving', v: money(k[KZ_COL.EST_SAVINGS]) },
          { l: 'Actual saving', v: money(k[KZ_COL.ACTUAL_SAVINGS]) },
          { l: 'Reviewer', v: String(k[KZ_COL.REVIEWER] || '') },
          { l: 'Assigned to', v: String(k[KZ_COL.ASSIGNED_TO] || '') },
          { l: 'Target date', v: fmtD(k[KZ_COL.TARGET_DATE]) },
          { l: 'Completed', v: fmtD(k[KZ_COL.COMPLETED_DATE]) },
          { l: 'Submitted', v: fmtD(k[KZ_COL.CREATED]) }
        ] };
    }
    return null;
  }
  return null;
}

/**
 * Quick action from the public (unauthenticated) RecordView page — a Telegram
 * link visitor has no PIN session, so this never runs the normal auth-gated
 * update path. Scope is deliberately narrow:
 *   - task:   real status advance (Start / Done)
 *   - rt:     real phase advance (Evaluate / Dispose / Close)
 *   - nc/ncr: acknowledge only — appends a timestamped remark, NEVER changes
 *             status (closing an NC needs RCA + 4-eyes, not safe to skip
 *             from an anonymous link)
 * The visitor's typed name is stamped into the remark/verification field so
 * there's a trail of who acted without a real login.
 */
function publicRecordAction(type, id, action, actorName) {
  return v2SafeExecute_(function() {
    type = String(type || '').toLowerCase();
    id = String(id || '').trim();
    action = String(action || '').trim();
    actorName = String(actorName || '').trim().substring(0, 60);
    if (!id || !actorName) return { success: false, message: 'Name is required.' };
    var tag = actorName + ' (via public link, no login)';
    // Any successful branch below mutates the record — always drop the
    // short-lived getPublicRecord cache so the page reflects it immediately.
    try { CacheService.getScriptCache().remove(_publicRecordCacheKey_(type, id)); } catch (e) {}

    if (type === 'task') {
      var validTask = { 'IN_PROGRESS': 1, 'DONE': 1 };
      if (!validTask[action]) return { success: false, message: 'Invalid task action.' };
      return updateTaskStatus(id, action, 'Updated by ' + tag);
    }
    if (type === 'rt' || type === 'redtag') {
      var rs = v2GetSpreadsheet_().getSheetByName('RedTagRegister');
      if (!rs) return { success: false, message: 'RedTagRegister sheet not found.' };
      var rd = rs.getDataRange().getValues(), rawStatus = '';
      for (var r = 1; r < rd.length; r++) {
        if (String(rd[r][RT_COL.TAG_ID]).trim() === id) { rawStatus = String(rd[r][RT_COL.STATUS] || '').trim().toUpperCase(); break; }
      }
      var nextPhase = { IDENTIFIED: 'EVALUATED', EVALUATED: 'DISPOSED', DISPOSED: 'CLOSED' }[rawStatus];
      if (!nextPhase || nextPhase !== action) return { success: false, message: 'Invalid red tag phase transition.' };
      return updateRedTagStatus(id, action, '', 'Advanced by ' + tag);
    }
    if (type === 'nc' || type === 'ncr' || type === 'capa') {
      if (action !== 'ACKNOWLEDGE') return { success: false, message: 'NC records can only be acknowledged from a public link — sign in to change status.' };
      var ss = v2GetSpreadsheet_(), sh = ss.getSheetByName('NC_CAPA');
      if (!sh) return { success: false, message: 'NC_CAPA sheet not found.' };
      var data = sh.getDataRange().getValues();
      for (var r2 = 1; r2 < data.length; r2++) {
        if (String(data[r2][NC_COL.NC_ID]).trim() !== id) continue;
        var existing = String(data[r2][NC_COL.VERIFICATION_REMARKS] || '');
        var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
        var note = '[' + stamp + '] Acknowledged by ' + tag;
        var updates = {}; updates[NC_COL.VERIFICATION_REMARKS] = existing ? (existing + '\n' + note) : note;
        v2BatchUpdateRow_(sh, r2 + 1, updates, data[r2]);
        return { success: true, message: 'Acknowledged.' };
      }
      return { success: false, message: 'NC not found: ' + id };
    }
    return { success: false, message: 'Unknown record type.' };
  }, 'publicRecordAction:' + type + ':' + id, { success: false, message: 'Server error.' });
}

// ============================================================================
// UNIFIED ACTION LIST  (NC + TASK + RED_TAG merged view)
// ============================================================================

/**
 * Returns a merged, normalised list of NCs, Tasks, and Red Tags for the
 * Actions page, plus count breakdowns for tab badges.
 *
 * NOTE ON COUNTS: each breakdown is computed over the pool MINUS its own
 * dimension, so a badge always answers "how many would I get if I clicked
 * this?" and never contradicts the list below it:
 *   byStatus / byTypeStatus — respect zone + type + priority, ignore status
 *   byPriority              — respects zone + type, ignores priority
 *   byType                  — respects zone + priority
 * Ignoring priority everywhere used to make the status tabs read "Closed 42"
 * while a HIGH-filtered list showed 3 rows.
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

  /** Whole days a due date is in the past; 0 if not yet due or unparseable. */
  function daysPastDue(dueVal) {
    if (!dueVal) return 0;
    var d = (dueVal instanceof Date) ? dueVal : new Date(dueVal);
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

  /* Kaizen runs its own lifecycle: SUBMITTED -> UNDER_REVIEW -> APPROVED ->
     IMPLEMENTING -> COMPLETED / BENEFIT_VERIFIED, plus REJECTED. Collapse it
     onto the hub's three states so a kaizen sits in the same Open/Doing/Closed
     columns as everything else. */
  function mapKaizenStatus(raw) {
    var s = String(raw || "").toUpperCase().trim();
    if (s === "COMPLETED" || s === "BENEFIT_VERIFIED" || s === "CLOSED" || s === "REJECTED") return "CLOSED";
    if (s === "APPROVED" || s === "IMPLEMENTING" || s === "IN_PROGRESS" || s === "UNDER_REVIEW") return "IN_PROGRESS";
    return "OPEN";
  }

  var PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

  /* Photo columns hold comma-joined Drive thumbnail URLs. Kept as a small
     array so the client can show a count and render thumbnails without a
     second round trip per record. */
  function _splitPhotos_(v) {
    return String(v || "").split(",").map(function (x) { return x.trim(); })
                          .filter(function (x) { return x.indexOf("http") === 0; });
  }

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
          owner:       _displayOwner_(nc.responsible),
          dueDate:     nc.targetDate || "",
          rawStatus:   nc.status,
          status:      uStatus,
          priority:    pri,
          ageDays:     age,
          daysPastDue: overdue ? daysPastDue(nc.targetDate) : 0,
          isOverdue:   overdue,
          createdDate: nc.createdDate || "",
          photos:      _splitPhotos_(nc.photoUrl)
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
          owner:       _displayOwner_(t.assignedTo),
          dueDate:     tDue,
          rawStatus:   t.status,
          status:      tStatus,
          priority:    tPri,
          ageDays:     tAge,
          daysPastDue: tOver ? daysPastDue(tDue) : 0,
          isOverdue:   tOver,
          createdDate: t.createdDate || "",
          photos:      _splitPhotos_(t.photoUrl)
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
          owner:       _displayOwner_(rt.owner || rt.taggedBy),
          dueDate:     rtDue,
          rawStatus:   rt.status,
          status:      rtStatus,
          priority:    rtPri,
          ageDays:     rtAge,
          daysPastDue: rtOver ? daysPastDue(rtDue) : 0,
          isOverdue:   rtOver,
          createdDate: rt.createdDate || "",
          photos:      _splitPhotos_(rt.photoUrl)
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: RedTag read error — " + e.message);
  }

  /* Kaizen belongs in the records list: it has an owner, a target date and a
     lifecycle, exactly like a task. It was simply never added, so 8 live
     suggestions were invisible on every tab of the page that claims to be the
     unified record list. */
  var kzItems = [];
  try {
    var kzRaw = (typeof getKaizenData === "function") ? getKaizenData({}) : [];
    if (Array.isArray(kzRaw)) {
      for (var m = 0; m < kzRaw.length; m++) {
        var kz = kzRaw[m];
        if (zoneFilter && kz.zoneId !== zoneFilter) continue;
        var kzStatus = mapKaizenStatus(kz.status);
        var kzAge = daysSince(kz.createdDate);
        kzItems.push({
          id:          kz.kaizenId,
          type:        "KAIZEN",
          title:       kz.title,
          description: kz.description || kz.expectedBenefit || "",
          zone:        kz.zoneName,
          zoneId:      kz.zoneId,
          owner:       _displayOwner_(kz.submitterName),
          dueDate:     "",
          rawStatus:   kz.status,
          status:      kzStatus,
          /* An idea nobody has looked at is the thing that goes stale, so age
             drives priority. Kaizen carries no severity of its own. */
          priority:    kzStatus === "CLOSED" ? "LOW" : (kzAge > 30 ? "HIGH" : "MEDIUM"),
          ageDays:     kzAge,
          daysPastDue: 0,
          isOverdue:   false,
          createdDate: kz.createdDate || "",
          photos:      []
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: Kaizen read error — " + e.message);
  }

  /* A Gemba walk is a completed event, not an open action -- there is nothing
     to chase, and the actions it raised are already in the list as their own
     tasks. It is included so the record list is genuinely complete and a walk
     can be found by zone, and it is always CLOSED so it never inflates the
     open counts that drive the plant's follow-up. */
  var gwItems = [];
  try {
    var gwRaw = (typeof getGembaWalkData === "function") ? getGembaWalkData({}) : [];
    if (Array.isArray(gwRaw)) {
      for (var n2 = 0; n2 < gwRaw.length; n2++) {
        var gw = gwRaw[n2];
        if (zoneFilter && gw.zoneId !== zoneFilter) continue;
        var noC = Number(gw.noCount || 0);
        gwItems.push({
          id:          gw.walkId,
          type:        "GEMBA",
          title:       (gw.walkType || "Gemba") + " walk — " + noC + " finding" + (noC === 1 ? "" : "s"),
          description: "Compliance " + (gw.compliancePct || 0) + "% · " +
                       (gw.totalQuestions || 0) + " checks · " + (gw.yesCount || 0) + " pass",
          zone:        gw.zoneName,
          zoneId:      gw.zoneId,
          owner:       _displayOwner_(gw.walkerName),
          dueDate:     "",
          rawStatus:   "COMPLETED",
          status:      "CLOSED",
          priority:    noC > 0 ? "MEDIUM" : "LOW",
          ageDays:     daysSince(gw.timestamp),
          daysPastDue: 0,
          isOverdue:   false,
          createdDate: gw.timestamp || "",
          photos:      []
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: Gemba read error — " + e.message);
  }

  /* Submitted audits. Like a Gemba walk this is a completed event rather than
     work to chase, so it is always CLOSED and never inflates the open counts.
     The score is the whole signal, so it leads the title and drives priority:
     below the pass mark is the audit someone has to act on. */
  var auItems = [];
  try {
    var auRaw = (typeof getRecentAudits === "function") ? (getRecentAudits(0) || {}).audits : [];
    if (Array.isArray(auRaw)) {
      for (var q = 0; q < auRaw.length; q++) {
        var au = auRaw[q];
        if (zoneFilter && au.zoneId !== zoneFilter) continue;
        var pct = Number(au.pct || 0);
        auItems.push({
          id:          au.submissionId,
          type:        "AUDIT",
          title:       "5S audit — " + pct + "%",
          description: au.count + " criteria scored" +
                       (au.photos ? " · " + au.photos + " photo" + (au.photos === 1 ? "" : "s") : ""),
          zone:        au.zoneName,
          zoneId:      au.zoneId,
          owner:       _displayOwner_(au.auditor),
          dueDate:     "",
          rawStatus:   "SUBMITTED",
          status:      "CLOSED",
          priority:    pct < 70 ? "HIGH" : (pct < 85 ? "MEDIUM" : "LOW"),
          ageDays:     daysSince(au.timestamp),
          daysPastDue: 0,
          isOverdue:   false,
          createdDate: au.timestamp || "",
          photos:      []
        });
      }
    }
  } catch (e) {
    Logger.log("getUnifiedActionList: Audit read error — " + e.message);
  }


  // ── full zone-filtered pool (used for counts) ─────────────────────────────
  var pool = ncItems.concat(taskItems).concat(rtItems).concat(kzItems).concat(gwItems).concat(auItems);

  // ── counts pool ──────────────────────────────────────────────────────────
  // Counts deliberately IGNORE the status filter (each tab must show how many
  // records it holds) but they now RESPECT type and priority. Previously they
  // ignored those too, so filtering to HIGH showed "Closed 42" on the tab while
  // the list underneath held 3 rows — which reads as the filter being broken.
  var countPool = pool.filter(function(item) {
    if (typeFilter     !== "ALL" && item.type     !== typeFilter)     return false;
    if (priorityFilter !== "ALL" && item.priority !== priorityFilter) return false;
    return true;
  });

  var counts = {
    byType:     { NC: 0, TASK: 0, RED_TAG: 0, KAIZEN: 0, GEMBA: 0, AUDIT: 0 },
    byStatus:   { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
    byTypeStatus: {
      NC:      { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      TASK:    { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      RED_TAG: { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      KAIZEN:  { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      GEMBA:   { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 },
      AUDIT:   { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 }
    },
    byPriority: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    total:      countPool.length
  };
  for (var c = 0; c < countPool.length; c++) {
    var item = countPool[c];
    if (counts.byStatus[item.status] !== undefined) counts.byStatus[item.status]++;
    if (counts.byTypeStatus[item.type] && counts.byTypeStatus[item.type][item.status] !== undefined) counts.byTypeStatus[item.type][item.status]++;
  }
  // byPriority must NOT be narrowed by the priority filter — it feeds the
  // priority chips themselves, and a chip cannot show how many records it would
  // match if it only ever counted the one already selected. Count it over the
  // type/zone-filtered pool instead.
  for (var pc = 0; pc < pool.length; pc++) {
    var pItem = pool[pc];
    // byPriority: everything except the priority filter itself
    if (typeFilter === "ALL" || pItem.type === typeFilter) {
      if (counts.byPriority[pItem.priority] !== undefined) counts.byPriority[pItem.priority]++;
    }
    // byType: everything except the type filter itself
    if (priorityFilter === "ALL" || pItem.priority === priorityFilter) {
      if (counts.byType[pItem.type] !== undefined) counts.byType[pItem.type]++;
    }
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

/**
 * NC + Task + Red Tag counts grouped by owner (user) and by zone.
 * Built on the same pool as getUnifiedActionList so the numbers always match
 * the Actions list. Excludes CLOSED items from "open" counts but reports both.
 *
 * @param {Object} [filters] — same shape as getUnifiedActionList (zoneId optional)
 * @returns {{ byUser: Array, byZone: Array }}
 *   byUser: [{ owner, total, open, inProgress, closed, byType:{NC,TASK,RED_TAG} }]
 *   byZone: [{ zoneId, zoneName, total, open, inProgress, closed, byType:{...} }]
 */
/**
 * Canonical display name for an owner string.
 *
 * The owner field is free text typed by whoever raised the record, so the same
 * person arrives many ways. Measured on live data 2026-09-02: 38 "users" for
 * roughly a dozen real people - Shikha / Mrs. Shikha / shikha / Shikhar,
 * Khushi / khushi / Mrs. Khushi Paswan, Santosh / santosh / Mr. Santosh Maurya,
 * TBM / tbm, plus raw e-mail addresses alongside display names. That made the
 * Summary tab unreadable: the counts were split across near-duplicate rows.
 *
 * Rules, in order:
 *  - an e-mail becomes its local part (deepak.joshi@x -> Deepak Joshi)
 *  - honorifics (Mr./Mrs./Ms./Shri/Smt) are dropped
 *  - case and inner whitespace are normalised, then Title Cased
 *  - a joint owner ("Khushi and Shikha") is NOT split: it is a real, distinct
 *    assignment, and silently reassigning it to one person would misstate who
 *    owns the work. It is normalised as its own bucket.
 *
 * @param {string} raw
 * @returns {string} canonical label, or '' when there is no owner
 * @private
 */
/**
 * Owner as shown in a record list. _canonOwner_ returns "" for automation and
 * test accounts; surface that as "Unassigned" rather than an empty cell, so an
 * unowned record reads as unowned instead of looking like a rendering bug.
 * @private
 */
function _displayOwner_(raw) {
  return _canonOwner_(raw) || "Unassigned";
}

function _canonOwner_(raw) {
  var v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  // Automation and test accounts are not people. Grouping them under a name
  // in a by-owner list implies someone is accountable for that work; nobody
  // is. They bucket as Unassigned so the backlog stays visible.
  if (/^(system|admin|tbm|bbm|anyone|auditor|tester|testuser|smoketest|test)$/i.test(v)) return '';
  if (/^packmasters\.mumbai@/i.test(v)) return '';
  if (v.indexOf('@') > 0) v = v.slice(0, v.indexOf('@')).replace(/[._-]+/g, ' ');
  v = v.replace(/^(mr|mrs|ms|miss|shri|smt|dr)\.?\s+/i, '');
  v = v.replace(/\s+/g, ' ').trim();
  if (!v) return '';
  return v.replace(/\S+/g, function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

/**
 * The canonical list of people work can be assigned to.
 *
 * Owner fields were free text, which produced 42 distinct strings for 6 real
 * people ("Shikha", "Mrs. Shikha", "shikha", "Shikhar", plus emails, "system"
 * and test values). Every assignment surface picks from this list instead.
 *
 * Zone leaders are the source of truth for the full name; Users rows add
 * anyone who can log in but leads no zone. Cached: it changes rarely and is
 * read on every form load.
 *
 * @returns {Array<{name:string, role:string, zones:Array<string>}>}
 */
function getAssignablePeople() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('ASSIGNABLE_PEOPLE');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var people = {};
  var cfg = (typeof getZoneConfig === 'function') ? getZoneConfig() : {};
  Object.keys(cfg).forEach(function (zid) {
    var n = String((cfg[zid] || {}).leader || '').trim();
    if (!n) return;
    if (!people[n]) people[n] = { name: n, role: 'Zone Lead', zones: [] };
    people[n].zones.push(zid);
  });

  try {
    var ss = v2GetSpreadsheet_();
    var u = ss.getSheetByName('Users');
    if (u && u.getLastRow() > 1) {
      var d = u.getDataRange().getValues();
      for (var r = 1; r < d.length; r++) {
        if (!d[r][0]) continue;
        if (d[r][7] === false) continue;                 // inactive
        var full = String(d[r][3] || '').trim();
        var role = String(d[r][4] || '').trim();
        if (!full || role === 'ADMIN') continue;         // Admin/TBM/BBM are not assignees
        // Skip if a zone leader already covers this person -- "Shikha" (Users)
        // and "Mrs. Shikha" (zone leader) are the same person, and the leader
        // name is the one already written on live records.
        var dup = Object.keys(people).some(function (k) {
          return k.toLowerCase().indexOf(full.toLowerCase()) > -1;
        });
        if (dup) continue;
        people[full] = { name: full, role: role === 'MANAGER' ? 'Manager' : 'Zone Lead', zones: [] };
      }
    }
  } catch (e) {}

  var list = Object.keys(people).sort().map(function (k) { return people[k]; });
  try { cache.put('ASSIGNABLE_PEOPLE', JSON.stringify(list), 1800); } catch (e) {}
  return list;
}

function getActionsSummary(filters) {
  return v2SafeExecute_(function() {
    var pool = getUnifiedActionList(filters || {}).items;
    var users = {}, zones = {};

    function bucket(map, key, label, zoneId) {
      if (!key) key = "Unassigned";
      if (!map[key]) {
        map[key] = { key: key, label: label, zoneId: zoneId || "",
          total: 0, open: 0, inProgress: 0, closed: 0,
          byType: { NC: 0, TASK: 0, RED_TAG: 0, KAIZEN: 0, GEMBA: 0, AUDIT: 0 } };
      }
      return map[key];
    }

    for (var i = 0; i < pool.length; i++) {
      var it = pool[i];
      var canon = _canonOwner_(it.owner) || "Unassigned";
      var u = bucket(users, canon, canon);
      var z = bucket(zones, it.zoneId || "—", (it.zoneId || "—") + (it.zone ? " — " + it.zone : ""), it.zoneId);
      [u, z].forEach(function(b) {
        b.total++;
        if (it.status === "CLOSED") b.closed++;
        else if (it.status === "IN_PROGRESS") b.inProgress++;
        else b.open++;
        if (b.byType[it.type] !== undefined) b.byType[it.type]++;
      });
    }

    function toSortedArray(map) {
      return Object.keys(map).map(function(k) { return map[k]; })
        .sort(function(a, b) { return (b.open + b.inProgress) - (a.open + a.inProgress) || b.total - a.total; });
    }

    return { byUser: toSortedArray(users), byZone: toSortedArray(zones) };
  }, "getActionsSummary", { byUser: [], byZone: [] });
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
      if (r[9]) g.photos += String(r[9]).split(",").filter(Boolean).length;
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
    // criterionId -> label map.
    // The generic CHECKLIST_SCHEMA keys criteria as 'S1-C1', but QuickAudit
    // writes the ZONE's own criterion ids ('S1-1') into AuditLineItems, and
    // older rows used a zero-padded 'S1-01'. Sourcing labels from the schema
    // alone produced label:"" for every item (measured 0/15 on 2026-08-20),
    // which is why the detail modal, audit cards and PDF showed bare ids.
    // Build from zone criteria first, fall back to the schema, and register a
    // zero-pad alias so legacy rows resolve too.
    var labelMap = {}, labelHiMap = {};
    function _regLabel_(id, en, hi) {
      id = String(id || ""); if (!id) return;
      if (en) labelMap[id] = en;
      if (hi) labelHiMap[id] = hi;
      // 'S1-1' <-> 'S1-01' alias, both directions
      var m = id.match(/^(S\d)-0?(\d+)$/);
      if (m) {
        var bare = m[1] + "-" + m[2], padded = m[1] + "-" + (m[2].length === 1 ? "0" : "") + m[2];
        if (en) { labelMap[bare] = en; labelMap[padded] = en; }
        if (hi) { labelHiMap[bare] = hi; labelHiMap[padded] = hi; }
      }
    }
    try {
      var schema = (typeof getChecklistSchema === "function") ? getChecklistSchema() : null;
      if (schema && schema.criteria) {
        schema.criteria.forEach(function (c) { _regLabel_(c.id, c.labelEn || c.label || "", c.labelHi || ""); });
      }
    } catch (e) {}

    var data = sheet.getDataRange().getValues();

    // Zone criteria carry the ids QuickAudit actually writes. Resolve the zone
    // from the first matching row, then overlay its labels on top of the schema.
    try {
      var zoneForLabels = "";
      for (var z = 1; z < data.length; z++) {
        if (String(data[z][0]) === String(submissionId)) { zoneForLabels = String(data[z][1]); break; }
      }
      if (zoneForLabels && typeof getZoneConfig === "function") {
        var zcfg = getZoneConfig()[zoneForLabels];
        if (zcfg && zcfg.criteria) {
          zcfg.criteria.forEach(function (c) {
            _regLabel_(c.id, c.labelEn || c.label || "", c.labelHi || "");
          });
        }
      }
    } catch (e) {}

    var header = null, items = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (String(r[0]) !== String(submissionId)) continue;
      if (!header) header = { submissionId: String(r[0]), zoneId: String(r[1]),
        zoneName: String(r[2]), timestamp: r[3] ? new Date(r[3]).toISOString() : "", auditor: String(r[4]) };
      var cid = String(r[5]);
      var photoUrls = String(r[9] || "").split(",").filter(Boolean);
      var photoFileIds = String(r[10] || "").split(",").filter(Boolean);
      items.push({ criterionId: cid, label: labelMap[cid] || "", labelHi: labelHiMap[cid] || "", pillar: String(r[6]),
        score: r[7] === "" ? null : parseInt(r[7], 10), remark: String(r[8] || ""),
        photoUrl: photoUrls[0] || "", photoFileId: photoFileIds[0] || "",
        photoUrls: photoUrls, photoFileIds: photoFileIds });
    }
    if (!header) return { found: false };
    return { found: true, header: header, items: items };
  }, "getAuditDetail", { found: false });
}

/**
 * Compact per-zone state for the ZoneSelector list: score, open NCs, red tags.
 *
 * The selector is the screen a floor worker starts from and it showed only a
 * code and a name — the zone's actual condition was a page away. This returns
 * only what a 44px row can show, cached, so the list stays instant and the
 * numbers arrive a moment later.
 *
 * No session required: the zone selector is deliberately anonymous (QR access),
 * and these are aggregate counts, not records.
 */
function getZoneSelectorStats() {
  return v2SafeExecute_(function () {
    var CACHE_KEY = 'pm5s_zonesel_stats_v1';
    try {
      var hit = CacheService.getScriptCache().get(CACHE_KEY);
      if (hit) return JSON.parse(hit);
    } catch (e) {}

    var grid = (typeof _tg5sZoneGrid_ === 'function') ? _tg5sZoneGrid_() : [];
    var out = {};
    (grid || []).forEach(function (z) {
      out[z.id] = {
        s: (z.pctScore === null || z.pctScore === undefined) ? null : Math.round(z.pctScore),
        n: (z.openCAPAs || 0),          // open NCs
        r: (z.activeRedTags || 0),      // active red tags
        d: z.submitted ? 1 : 0          // audit done today
      };
    });

    /* 10 minutes: long enough that a burst of QR scans costs one read, short
       enough that a supervisor watching the board sees an audit land. */
    try { CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(out), 600); } catch (e) {}
    return out;
  }, 'getZoneSelectorStats', {}, 'low');
}
