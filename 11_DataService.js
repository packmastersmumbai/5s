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

  // Find the monthly row first, fall back to weekly
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === zoneId && String(data[r][2]).trim() === month) {
      if (String(data[r][4]).trim() === "monthly") {
        result = rowToObject_(headers, data[r]);
        break;
      }
      if (!result && String(data[r][4]).trim() === "weekly") {
        result = rowToObject_(headers, data[r]);
      }
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
    var rowMonth = String(data[r][2]).trim();
    if (rowMonth < cutoffMonth) continue;
    if (String(data[r][4]).trim() !== "monthly") continue;
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

  for (var r = 1; r < data.length; r++) {
    var rowZone = String(data[r][0]).trim();
    var rowMonth = String(data[r][2]).trim();
    var periodType = String(data[r][4]).trim();

    if (rowMonth !== month) continue;

    if (periodType === "monthly") {
      monthlyFound[rowZone] = rowToObject_(headers, data[r]);
    } else if (periodType === "weekly" && !monthlyFound[rowZone]) {
      weeklyFallback[rowZone] = rowToObject_(headers, data[r]);
    }
  }

  var zoneIds = Object.keys(zoneConfig).sort();
  zoneIds.forEach(function(zid) {
    var row = monthlyFound[zid] || weeklyFallback[zid] || null;
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
        pct_score: 0, s1_avg: 0, s2_avg: 0, s3_avg: 0, s4_avg: 0, s5_avg: 0,
        nc_count: 0, nc_closed: 0, daily_submission_rate: 0
      });
    }
  });

  // Plant aggregates
  var zonesWithData = zones.filter(function(z) { return z.hasData !== false; });
  var plantAvg = zonesWithData.length > 0 ?
    Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z.pct_score) || 0); }, 0) / zonesWithData.length * 100) / 100 : 0;
  var totalNCs = zones.reduce(function(s, z) { return s + (Number(z.nc_count) || 0); }, 0);
  var totalClosed = zones.reduce(function(s, z) { return s + (Number(z.nc_closed) || 0); }, 0);
  var closureRate = totalNCs > 0 ? Math.round((totalClosed / totalNCs) * 100) : 100;

  // Pillar averages across plant
  var pillarAvgs = {};
  ["s1_avg", "s2_avg", "s3_avg", "s4_avg", "s5_avg"].forEach(function(key) {
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

  // Pre-index rows by month
  var rowsByMonth = {};
  for (var r = 1; r < data.length; r++) {
    var rowMonth = String(data[r][2]).trim();
    if (!rowsByMonth[rowMonth]) rowsByMonth[rowMonth] = [];
    rowsByMonth[rowMonth].push(data[r]);
  }

  var results = [];
  targetMonths.forEach(function(month) {
    var monthRows = rowsByMonth[month] || [];
    var monthlyFound = {};
    var weeklyFallback = {};

    monthRows.forEach(function(row) {
      var rowZone = String(row[0]).trim();
      var periodType = String(row[4]).trim();
      if (periodType === "monthly") {
        monthlyFound[rowZone] = rowToObject_(headers, row);
      } else if (periodType === "weekly" && !monthlyFound[rowZone]) {
        weeklyFallback[rowZone] = rowToObject_(headers, row);
      }
    });

    var zones = [];
    zoneIds.forEach(function(zid) {
      var zRow = monthlyFound[zid] || weeklyFallback[zid] || null;
      if (zRow) {
        zones.push(zRow);
      }
    });

    var zonesWithData = zones.filter(function(z) { return z.pct_score > 0; });
    var plantAvg = zonesWithData.length > 0 ?
      Math.round(zonesWithData.reduce(function(s, z) { return s + (Number(z.pct_score) || 0); }, 0) / zonesWithData.length * 100) / 100 : 0;
    var totalNCs = zones.reduce(function(s, z) { return s + (Number(z.nc_count) || 0); }, 0);
    var totalClosed = zones.reduce(function(s, z) { return s + (Number(z.nc_closed) || 0); }, 0);
    var closureRate = totalNCs > 0 ? Math.round((totalClosed / totalNCs) * 100) : 100;

    var pillarAvgs = {};
    ["s1_avg", "s2_avg", "s3_avg", "s4_avg", "s5_avg"].forEach(function(key) {
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
    for (var r = 1; r < allData.length; r++) {
      if (zoneId && String(allData[r][0]).trim() !== zoneId) continue;
      if (String(allData[r][4]).trim() !== "monthly") continue;
      var rowYear = String(allData[r][3]).trim();
      var rowMonth = String(allData[r][2]).trim();
      // Check if in current FY range
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
      if (String(allData2[r2][4]).trim() !== "monthly") continue;
      var rm = String(allData2[r2][2]).trim();
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
      currentPct: currentEntry ? Number(currentEntry.pct_score) : null,
      priorPct: priorEntry ? Number(priorEntry.pct_score) : null
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
    return { daily: daily, weekly: weekly };
  }, "getAuditHistory", { daily: [], weekly: [] }, "low");
}
