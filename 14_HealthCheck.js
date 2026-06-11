/**
 * ============================================================================
 * 14_HealthCheck.gs — PackMasters 5S Integrated System
 * Phase 5: System Health Check
 * ============================================================================
 *
 * Runs weekly (Sunday) via masterOrchestrator hook.
 * Verifies all system components are intact and functioning.
 *
 * Functions:
 *   systemHealthCheck()        — Full system validation
 *   checkNamedRanges_()        — Verifies all Named Ranges
 *   checkScriptProperties_()   — Verifies all config keys
 *   checkDriveFolders_()       — Verifies zone folders accessible
 *   checkTriggers_()           — Verifies trigger count
 *   checkDataFreshness_()      — Verifies Summary_Data is recent
 *   checkSheetIntegrity_()     — Verifies all sheets and headers
 */

/**
 * Full system health check. Called by masterOrchestrator() on Sundays.
 * Logs results to AdminLog. Alerts MC on any failure.
 */
function systemHealthCheck() {
  Logger.log("🏥 Running system health check...");

  var checks = [];
  var failures = [];

  function check(name, passed, detail) {
    checks.push({ name: name, passed: passed, detail: detail || "" });
    if (!passed) failures.push(name + (detail ? ": " + detail : ""));
  }

  // ── 1. ScriptProperties ──
  var props = PropertiesService.getScriptProperties();
  var requiredKeys = ["ZONE_CONFIG", "CHECKLIST_SCHEMA", "DEPLOY_ID", "QR_VERSION",
    "CONFIG_VERSION", "MC_EMAIL", "TOP_EMAIL", "MC_WHITELIST", "SPREADSHEET_ID"];
  requiredKeys.forEach(function(key) {
    var val = props.getProperty(key);
    check("ScriptProperty: " + key, val !== null && val !== "");
  });

  // Verify JSON parsability
  try {
    JSON.parse(props.getProperty("ZONE_CONFIG"));
    check("ZONE_CONFIG parsable", true);
  } catch (e) {
    check("ZONE_CONFIG parsable", false, e.message);
  }

  try {
    JSON.parse(props.getProperty("CHECKLIST_SCHEMA"));
    check("CHECKLIST_SCHEMA parsable", true);
  } catch (e) {
    check("CHECKLIST_SCHEMA parsable", false, e.message);
  }

  // ── 2. Sheets ──
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var requiredSheets = ["Zones", "ChecklistSchema", "DailySubmissions", "WeeklyAudit",
    "NC_CAPA", "PhotoLog", "Summary", "AdminLog", "QR_Master"];
  requiredSheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    check("Sheet: " + name, sheet !== null);

    // Verify header row exists
    if (sheet && sheet.getLastColumn() > 0) {
      var firstHeader = sheet.getRange(1, 1).getValue();
      check("Sheet " + name + " has headers", firstHeader !== "" && firstHeader !== null);
    }
  });

  // ── 3. Named Ranges ──
  var requiredRanges = ["Zones_Config", "Checklist_Schema", "Daily_Data", "Weekly_Data",
    "CAPA_Data", "Photo_Data", "Summary_Data", "Admin_Log", "QR_Data"];
  requiredRanges.forEach(function(name) {
    try {
      var range = ss.getRangeByName(name);
      check("Named Range: " + name, range !== null);
    } catch (e) {
      check("Named Range: " + name, false, e.message);
    }
  });

  // ── 4. Drive Folders ──
  try {
    var zoneConfig = getZoneConfig();
    var accessibleFolders = 0;
    Object.keys(zoneConfig).forEach(function(id) {
      if (zoneConfig[id].driveFolderId) {
        try {
          DriveApp.getFolderById(zoneConfig[id].driveFolderId);
          accessibleFolders++;
        } catch (e) { }
      }
    });
    check("Drive folders accessible", accessibleFolders >= Object.keys(zoneConfig).length,
      accessibleFolders + "/" + Object.keys(zoneConfig).length);
  } catch (e) {
    check("Drive folders check", false, e.message);
  }

  // ── 5. Triggers ──
  var triggers = ScriptApp.getProjectTriggers();
  check("Trigger count = 1", triggers.length === 1, "Found: " + triggers.length);
  if (triggers.length > 0) {
    check("Trigger handler = masterOrchestrator",
      triggers[0].getHandlerFunction() === "masterOrchestrator",
      "Handler: " + triggers[0].getHandlerFunction());
  }

  // ── 6. Data Freshness ──
  var summarySheet = ss.getSheetByName("Summary");
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var summaryData = summarySheet.getDataRange().getValues(); // BATCH_READ
    var latestDate = null;
    for (var r = 1; r < summaryData.length; r++) {
      var computedAt = summaryData[r][19]; // Column T: computed_at
      if (computedAt instanceof Date) {
        if (!latestDate || computedAt > latestDate) {
          latestDate = computedAt;
        }
      }
    }
    if (latestDate) {
      var hoursOld = (new Date().getTime() - latestDate.getTime()) / (1000 * 60 * 60);
      check("Summary data freshness", hoursOld < 48,
        "Last updated " + Math.round(hoursOld) + " hours ago");
    } else {
      check("Summary data freshness", false, "No computed_at dates found");
    }
  } else {
    check("Summary data freshness", false, "Summary sheet empty");
  }

  // ── 7. Email Quota ──
  try {
    var quota = MailApp.getRemainingDailyQuota();
    check("Email quota remaining", quota > 5, quota + " emails remaining");
  } catch (e) {
    check("Email quota check", false, e.message);
  }

  // ── 8. QR Codes ──
  var qrSheet = ss.getSheetByName("QR_Master");
  if (qrSheet) {
    var qrRows = qrSheet.getLastRow() - 1;
    check("QR codes generated", qrRows >= 16, qrRows + " QR rows");
  } else {
    check("QR codes", false, "QR_Master sheet missing");
  }

  // ── 9. Error rate check ──
  try {
    var errorStats = getErrorStats(7);
    check("Error rate acceptable (< 10/week)", errorStats.total < 10,
      errorStats.total + " errors in last 7 days");
    check("No critical errors (7 days)", errorStats.critical === 0,
      errorStats.critical + " critical errors");
  } catch (e) {
    check("Error rate check", false, e.message);
  }

  // ── Log results ──
  var passedCount = checks.filter(function(c) { return c.passed; }).length;
  var failedCount = checks.filter(function(c) { return !c.passed; }).length;

  logAdminAction_("systemHealthCheck",
    passedCount + " passed, " + failedCount + " failed. " +
    (failures.length > 0 ? "FAILURES: " + failures.join("; ") : "All OK."));

  Logger.log("🏥 Health check: " + passedCount + " passed, " + failedCount + " failed");

  // ── Alert MC on failures ──
  if (failures.length > 0) {
    try {
      var mcEmail = props.getProperty("MC_EMAIL");
      if (mcEmail && MailApp.getRemainingDailyQuota() > 0) {
        var failHtml = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
          '<div style="background:#e74c3c;color:white;padding:16px;">' +
          '<h2 style="margin:0;">🏥 System Health Check — Failures Detected</h2></div>' +
          '<div style="padding:20px;">' +
          '<p>' + failures.length + ' of ' + checks.length + ' checks failed:</p><ul>';
        failures.forEach(function(f) { failHtml += '<li style="color:#e74c3c;margin:4px 0;">' + f + '</li>'; });
        failHtml += '</ul><p style="color:#666;font-size:12px;">Review the AdminLog sheet for details.</p></div></div>';

        MailApp.sendEmail({
          to: mcEmail,
          subject: "🏥 PackMasters 5S — Health Check: " + failures.length + " Failures",
          htmlBody: failHtml
        });
      }
    } catch (e) {
      Logger.log("Could not send health check alert: " + e.message);
    }
  }

  return { passed: passedCount, failed: failedCount, checks: checks, failures: failures };
}
