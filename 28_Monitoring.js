/**
 * ============================================================================
 * 28_Monitoring.js — PackMasters 5S v2.0
 * System Monitoring & Error Alerting
 * ============================================================================
 *
 * Provides real-time monitoring of system health and error detection.
 * Sends alerts when critical issues occur.
 *
 * Monitoring Aspects:
 *   • Execution errors (caught exceptions)
 *   • Data consistency (missing data, invalid values)
 *   • Performance issues (slow queries, timeouts)
 *   • Configuration errors (missing properties, invalid setup)
 *   • Security events (unauthorized access, permission failures)
 *
 * Key Functions:
 *   logSystemError(category, funcName, error, context) — Log error + alert
 *   sendMonitoringAlert(level, subject, message) — Send alert email
 *   getDailyErrorReport() — Aggregate errors for daily digest
 *   v2HealthCheck() — System health verification
 */

// ============================================================================
// ERROR SEVERITY LEVELS & ALERTING
// ============================================================================

var ERROR_LEVELS = {
  INFO: "INFO",           // Informational (no alert)
  WARNING: "WARNING",     // Warning (daily digest)
  ERROR: "ERROR",         // Error (alert within 1 hour)
  CRITICAL: "CRITICAL"    // Critical (immediate alert)
};

var ERROR_CATEGORIES = {
  EXECUTION: "Execution Error",
  DATA_INTEGRITY: "Data Integrity",
  PERMISSION: "Permission Error",
  CONFIG: "Configuration Error",
  TIMEOUT: "Timeout/Performance",
  SECURITY: "Security Event",
  QUOTA: "Quota Exceeded"
};

// ============================================================================
// ERROR LOGGING & ANALYSIS
// ============================================================================

/**
 * Logs a system error and decides whether to alert immediately.
 * Delegates the AdminLog write to v2LogError_() for a unified row format.
 *
 * @param {string} category — Error category (from ERROR_CATEGORIES)
 * @param {string} functionName — Function where error occurred
 * @param {Object} error — Error object or message
 * @param {Object} context — Additional context
 * @returns {Object} { logged: bool, alerted: bool, errorId: string }
 */
function logSystemError(category, functionName, error, context) {
  try {
    var errorId = "ERR_" + Utilities.getUuid().substring(0, 8);
    var errorMsg = typeof error === "string" ? error : (error.message || String(error));
    var errorLevel = determineErrorLevel_(category, errorMsg);

    // Delegate AdminLog write to unified logger
    v2LogError_(
      errorLevel,
      category || 'Execution',
      functionName + ': ' + errorMsg,
      { errorId: errorId, context: context || {}, stack: (error && error.stack) ? error.stack : '' }
    );

    // Determine if immediate alert is needed
    var shouldAlert = errorLevel === ERROR_LEVELS.ERROR || errorLevel === ERROR_LEVELS.CRITICAL;

    if (shouldAlert) {
      sendMonitoringAlert(
        errorLevel,
        "PackMasters 5S — " + errorLevel + " in " + functionName,
        "Category: " + category + "\n" +
        "Error ID: " + errorId + "\n" +
        "Function: " + functionName + "\n" +
        "Message: " + errorMsg + "\n" +
        "Time: " + new Date().toLocaleString()
      );
    }

    Logger.log("❌ Error logged [" + errorLevel + "]: " + errorId + " — " + errorMsg);

    return {
      logged: true,
      alerted: shouldAlert,
      errorId: errorId,
      level: errorLevel
    };
  } catch (e) {
    Logger.log("CRITICAL: Error logging system failed: " + e.message);
    return { logged: false, alerted: false };
  }
}

/**
 * Determines error severity based on category and message.
 * @private
 */
function determineErrorLevel_(category, message) {
  if (category === "SECURITY") return ERROR_LEVELS.CRITICAL;
  if (category === "QUOTA") return ERROR_LEVELS.CRITICAL;
  if (message && message.indexOf("timeout") !== -1) return ERROR_LEVELS.WARNING;
  if (message && message.indexOf("not found") !== -1) return ERROR_LEVELS.WARNING;
  return ERROR_LEVELS.ERROR;
}

/**
 * Sends a monitoring alert email to admin.
 * Rate-limited to prevent spam (max 1 per minute per level).
 *
 * @param {string} level — ERROR_LEVELS.ERROR or CRITICAL
 * @param {string} subject — Email subject
 * @param {string} message — Email body
 */
function sendMonitoringAlert(level, subject, message) {
  try {
    var props = PropertiesService.getScriptProperties();
    var mcEmail = props.getProperty("MC_EMAIL");
    if (!mcEmail) return;

    // Rate limiting: max 1 alert per minute per level (CacheService supports real TTL)
    var rateLimitKey = "alert_" + level + "_" + Math.floor(new Date().getTime() / 60000);
    var alertCache = CacheService.getScriptCache();
    var sent = alertCache.get(rateLimitKey);
    if (sent) {
      Logger.log("  ⏱️ Alert rate-limited for " + level);
      return;
    }

    // Send email
    MailApp.sendEmail({
      to: mcEmail,
      subject: subject,
      htmlBody: "<h3>" + level + " Alert</h3>" +
                "<pre style='background:#f5f5f5;padding:10px;border-radius:4px;'>" +
                v2EscapeHtml_(message) +
                "</pre>" +
                "<p style='font-size:12px;color:#666;'>" +
                "Time: " + new Date().toLocaleString() + "<br>" +
                "System: PackMasters 5S</p>"
    });

    // Mark as sent — expires after 120 seconds (CacheService.put TTL actually works)
    alertCache.put(rateLimitKey, "sent", 120);

    Logger.log("  📧 Alert sent to " + mcEmail);
  } catch (e) {
    Logger.log("Could not send alert: " + e.message);
  }
}

/**
 * Generates daily error report for morning digest.
 * Called by masterOrchestrator at 07:30 IST.
 *
 * @returns {Object} { errorCount: int, criticalCount: int, summary: string }
 */
function getDailyErrorReport() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var adminLog = ss.getSheetByName("AdminLog");
    if (!adminLog) return { errorCount: 0, criticalCount: 0, summary: "No errors" };

    var now = new Date();
    var today = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");
    var lastRow = adminLog.getLastRow();
    var readFrom = Math.max(2, lastRow - 999);
    var data = lastRow < 2 ? [] : adminLog.getRange(readFrom, 1, lastRow - readFrom + 1, adminLog.getLastColumn()).getValues();

    var errorCount = 0, criticalCount = 0;
    var errorsByCategory = {};

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var timestamp = row[0];
      var action = String(row[2]);
      if (action.indexOf("ERROR") === -1) continue;

      var rowDate = Utilities.formatDate(new Date(timestamp), "Asia/Kolkata", "yyyy-MM-dd");
      if (rowDate !== today) continue;

      errorCount++;

      try {
        var context = JSON.parse(row[4] || "{}");
        if (context.level === ERROR_LEVELS.CRITICAL) criticalCount++;

        var cat = context.category || "Unknown";
        errorsByCategory[cat] = (errorsByCategory[cat] || 0) + 1;
      } catch (e) {
        // Parse error, skip
      }
    }

    var summary = "Errors Today: " + errorCount;
    if (criticalCount > 0) summary += " (⚠️ " + criticalCount + " CRITICAL)";
    Object.keys(errorsByCategory).forEach(function(cat) {
      summary += "\n  • " + cat + ": " + errorsByCategory[cat];
    });

    return {
      errorCount: errorCount,
      criticalCount: criticalCount,
      summary: summary,
      timestamp: now.toISOString()
    };
  } catch (e) {
    Logger.log("Error generating error report: " + e.message);
    return { errorCount: 0, criticalCount: 0, summary: "Report generation failed" };
  }
}

// ============================================================================
// SYSTEM HEALTH CHECK
// ============================================================================

/**
 * Comprehensive health check — runs weekly (Sunday).
 * Verifies all critical subsystems are functioning.
 *
 * @returns {Object} { healthy: bool, checks: {}, issues: [] }
 */
function systemHealthCheck() {
  var results = {
    timestamp: new Date().toISOString(),
    healthy: true,
    checks: {},
    issues: []
  };

  // 1. Check Spreadsheet access
  try {
    var ss = v2GetSpreadsheet_();
    results.checks.spreadsheet = { ok: !!ss, message: ss ? "Accessible" : "Not found" };
    if (!ss) {
      results.healthy = false;
      results.issues.push("Spreadsheet not accessible");
    }
  } catch (e) {
    results.checks.spreadsheet = { ok: false, message: e.message };
    results.healthy = false;
    results.issues.push("Spreadsheet access error: " + e.message);
  }

  // 2. Check Sheet inventory
  try {
    var requiredSheets = [
      "Zones", "Summary", "DailySubmissions", "WeeklyAudit",
      "NC_CAPA", "AdminLog", "TaskBoard", "RedTagRegister"
    ];
    var ss = v2GetSpreadsheet_();
    var missingSheets = [];
    requiredSheets.forEach(function(name) {
      if (!ss.getSheetByName(name)) missingSheets.push(name);
    });
    results.checks.sheets = { ok: missingSheets.length === 0, message: missingSheets.length + " missing sheets" };
    if (missingSheets.length > 0) {
      results.healthy = false;
      results.issues.push("Missing sheets: " + missingSheets.join(", "));
    }
  } catch (e) {
    results.checks.sheets = { ok: false, message: e.message };
    results.healthy = false;
  }

  // 3. Check Configuration
  try {
    var props = PropertiesService.getScriptProperties();
    var requiredProps = ["ZONE_CONFIG", "CHECKLIST_SCHEMA"];
    var missingProps = [];
    requiredProps.forEach(function(name) {
      if (!props.getProperty(name)) missingProps.push(name);
    });
    results.checks.config = { ok: missingProps.length === 0, message: missingProps.length + " missing properties" };
    if (missingProps.length > 0) {
      results.issues.push("Missing config: " + missingProps.join(", "));
    }
  } catch (e) {
    results.checks.config = { ok: false, message: e.message };
  }

  // 4. Check Cache system
  try {
    if (typeof v2CacheHealthCheck === "function") {
      var cacheHealth = v2CacheHealthCheck();
      results.checks.cache = { ok: cacheHealth.working, message: cacheHealth.issues.length + " issues" };
      if (!cacheHealth.working) {
        results.issues.push("Cache issues: " + cacheHealth.issues.join("; "));
      }
    }
  } catch (e) {
    results.checks.cache = { ok: false, message: e.message };
  }

  // 5. Check Email capability
  try {
    var quotaRemaining = MailApp.getRemainingDailyQuota();
    results.checks.email = { ok: quotaRemaining > 10, message: quotaRemaining + " emails remaining" };
    if (quotaRemaining <= 10) {
      results.issues.push("⚠️ Low email quota: " + quotaRemaining + " remaining");
    }
  } catch (e) {
    results.checks.email = { ok: false, message: e.message };
  }

  // Log results
  var healthStr = results.healthy ? "✅ HEALTHY" : "❌ ISSUES DETECTED";
  Logger.log("\n" + healthStr + " — System Health Check");
  Object.keys(results.checks).forEach(function(check) {
    var c = results.checks[check];
    Logger.log("  " + (c.ok ? "✅" : "❌") + " " + check + ": " + c.message);
  });
  if (results.issues.length > 0) {
    Logger.log("\n⚠️ Issues:");
    results.issues.forEach(function(issue) {
      Logger.log("  • " + issue);
    });
  }

  return results;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

