/**
 * ============================================================================
 * 12_ErrorHandling.gs — PackMasters 5S Integrated System
 * Phase 5: Error Handling, Input Validation & Sanitisation
 * ============================================================================
 *
 * Provides defensive wrappers and validators for all user-facing and
 * trigger-invoked functions. Does NOT modify existing business logic —
 * only adds guards and logging around it.
 *
 * Functions:
 *   safeExecute(fn, context, fallback)  — Try-catch wrapper with logging
 *   validateZoneId(id)                  — Validates against ZONE_CONFIG
 *   validateScore(val, min, max)        — Validates numeric score range
 *   sanitizeInput(str, maxLen)          — Strips dangerous content, limits length
 *   sanitizeObject(obj, rules)          — Sanitises all fields of an object
 *   validateSubmissionPayload(data)     — Full validation of doPost payloads
 *   logError_(context, error, severity) — Structured error logging
 *   getErrorStats()                     — Returns error counts from AdminLog
 */

// ============================================================================
// SAFE EXECUTION WRAPPER
// ============================================================================

/**
 * Wraps any function in a try-catch with structured error logging.
 * If the function throws, logs to AdminLog and sends alert to MC
 * (only for critical/high severity errors).
 *
 * @param {Function} fn — Function to execute
 * @param {string} context — Human-readable description for error logs
 * @param {*} [fallback] — Value to return if fn throws. Defaults to null.
 * @param {string} [severity="medium"] — "low", "medium", "high", "critical"
 * @returns {*} Result of fn() or fallback
 */
function safeExecute(fn, context, fallback, severity) {
  severity = severity || "medium";
  fallback = (fallback !== undefined) ? fallback : null;

  try {
    return fn();
  } catch (error) {
    logError_(context, error, severity);

    // Send alert email for high/critical errors
    if (severity === "high" || severity === "critical") {
      try {
        var mcEmail = PropertiesService.getScriptProperties().getProperty("MC_EMAIL");
        if (mcEmail) {
          var remaining = MailApp.getRemainingDailyQuota();
          if (remaining > 0) {
            MailApp.sendEmail({
              to: mcEmail,
              subject: "⚠️ PackMasters 5S — " + severity.toUpperCase() + " Error",
              htmlBody: buildErrorEmailHtml_(context, error, severity)
            });
          }
        }
      } catch (emailErr) {
        Logger.log("Could not send error alert email: " + emailErr.message);
      }
    }

    return fallback;
  }
}

/**
 * Builds HTML body for error alert emails.
 * @private
 */
function buildErrorEmailHtml_(context, error, severity) {
  var severityColor = {
    low: "#3498db",
    medium: "#f39c12",
    high: "#e74c3c",
    critical: "#c0392b"
  };

  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
    '<div style="background:' + (severityColor[severity] || "#e74c3c") + ';color:white;padding:16px;">' +
    '<h2 style="margin:0;">PackMasters 5S — Error Alert</h2>' +
    '<p style="margin:4px 0 0;font-size:13px;">' + severity.toUpperCase() + ' severity</p></div>' +
    '<div style="padding:20px;background:#f8f9fa;">' +
    '<h3 style="margin:0 0 10px;">Context: ' + context + '</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Error</td>' +
    '<td style="padding:6px;border:1px solid #ddd;">' + (error.message || String(error)) + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Time</td>' +
    '<td style="padding:6px;border:1px solid #ddd;">' + new Date().toISOString() + '</td></tr>' +
    '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">User</td>' +
    '<td style="padding:6px;border:1px solid #ddd;">' + (Session.getActiveUser().getEmail() || "system") + '</td></tr>' +
    '</table>' +
    (error.stack ? '<pre style="background:#fff;padding:10px;font-size:10px;overflow:auto;margin-top:10px;border:1px solid #ddd;">' + error.stack + '</pre>' : '') +
    '</div></div>';
}


// ============================================================================
// INPUT VALIDATORS
// ============================================================================

/**
 * Validates a zone ID against the ZONE_CONFIG.
 * Returns the validated zone ID or throws an error.
 *
 * @param {string} id — Zone ID to validate
 * @returns {string} Validated zone ID (trimmed, uppercase-normalised)
 * @throws {Error} If zone ID is invalid
 */
function validateZoneId(id) {
  if (!id || typeof id !== "string") {
    throw new Error("Zone ID is required and must be a string.");
  }

  var cleaned = id.trim().toUpperCase();

  // Format check: Z-XX where XX is 01-99
  if (!/^Z-\d{2}$/.test(cleaned)) {
    throw new Error("Invalid zone ID format: '" + id + "'. Expected format: Z-01 through Z-99.");
  }

  // Existence check
  var zoneConfig = getZoneConfig();
  if (!zoneConfig[cleaned]) {
    throw new Error("Zone '" + cleaned + "' not found in configuration. Valid zones: " +
      Object.keys(zoneConfig).sort().join(", "));
  }

  return cleaned;
}

/**
 * Validates a numeric score is within the expected range.
 *
 * @param {*} val — Value to validate
 * @param {number} min — Minimum allowed value (inclusive)
 * @param {number} max — Maximum allowed value (inclusive)
 * @returns {number} Validated integer score
 * @throws {Error} If value is invalid
 */
function validateScore(val, min, max) {
  var num = parseInt(val, 10);
  if (isNaN(num)) {
    throw new Error("Score must be a number. Received: " + String(val));
  }
  if (num < min || num > max) {
    throw new Error("Score " + num + " out of range [" + min + ", " + max + "].");
  }
  return num;
}

/**
 * Validates a date string in yyyy-MM-dd format.
 *
 * @param {string} dateStr — Date string to validate
 * @returns {string} Validated date string
 * @throws {Error} If date is invalid
 */
function validateDateString(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    throw new Error("Date string is required.");
  }

  var cleaned = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new Error("Invalid date format: '" + dateStr + "'. Expected yyyy-MM-dd.");
  }

  var parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date value: '" + dateStr + "'.");
  }

  return cleaned;
}

/**
 * Validates an email address format.
 *
 * @param {string} email — Email to validate
 * @returns {string} Trimmed lowercase email
 * @throws {Error} If invalid
 */
function validateEmail(email) {
  if (!email || typeof email !== "string") {
    throw new Error("Email is required.");
  }

  var cleaned = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error("Invalid email format: '" + email + "'.");
  }

  return cleaned;
}


// ============================================================================
// INPUT SANITISATION
// ============================================================================

/**
 * Sanitises a text input string:
 * - Strips HTML/script tags
 * - Removes control characters
 * - Trims whitespace
 * - Limits to maxLen characters
 *
 * @param {*} str — Input to sanitise
 * @param {number} [maxLen=1000] — Maximum allowed length
 * @returns {string} Sanitised string
 */
function sanitizeInput(str, maxLen) {
  maxLen = maxLen || 1000;

  if (str === null || str === undefined) return "";
  if (typeof str !== "string") str = String(str);

  // Strip HTML tags
  str = str.replace(/<[^>]*>/g, "");

  // Strip script-related keywords (case-insensitive)
  str = str.replace(/javascript\s*:/gi, "");
  str = str.replace(/on\w+\s*=/gi, "");
  str = str.replace(/eval\s*\(/gi, "");
  str = str.replace(/expression\s*\(/gi, "");

  // Remove control characters (keep newlines and tabs)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Trim and limit length
  str = str.trim();
  if (str.length > maxLen) {
    str = str.substring(0, maxLen);
  }

  return str;
}

/**
 * Sanitises all string fields in an object according to rules.
 *
 * @param {Object} obj — Object to sanitise
 * @param {Object} rules — { fieldName: { maxLen: number, required: boolean, type: "string"|"number"|"boolean" } }
 * @returns {Object} Sanitised object
 */
function sanitizeObject(obj, rules) {
  if (!obj || typeof obj !== "object") return {};

  var sanitized = {};
  for (var key in rules) {
    var rule = rules[key];
    var val = obj[key];

    if (rule.required && (val === null || val === undefined || val === "")) {
      throw new Error("Required field missing: " + key);
    }

    if (rule.type === "string") {
      sanitized[key] = sanitizeInput(val, rule.maxLen || 1000);
    } else if (rule.type === "number") {
      var num = Number(val);
      if (isNaN(num) && rule.required) {
        throw new Error("Field '" + key + "' must be a number. Received: " + String(val));
      }
      sanitized[key] = isNaN(num) ? (rule.default || 0) : num;
    } else if (rule.type === "boolean") {
      sanitized[key] = Boolean(val);
    } else if (rule.type === "object") {
      sanitized[key] = val; // Pass through objects (criteria, scores)
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}


// ============================================================================
// FULL PAYLOAD VALIDATION
// ============================================================================

/**
 * Validates and sanitises a complete doPost submission payload.
 * Returns a clean, validated payload or throws an error.
 *
 * @param {Object} data — Raw form data from doPost
 * @returns {Object} Validated and sanitised payload
 * @throws {Error} On validation failure
 */
function validateSubmissionPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Submission payload must be a non-null object.");
  }

  // Validate submission_type
  var type = sanitizeInput(data.submission_type, 20);
  if (["daily", "weekly"].indexOf(type) === -1) {
    throw new Error("Invalid submission_type: '" + type + "'. Must be 'daily' or 'weekly'.");
  }

  // Validate zone_id
  var zoneId = validateZoneId(data.zone_id);

  // Validate submission_id (UUID format)
  var submissionId = sanitizeInput(data.submission_id, 50);
  if (submissionId && !/^[a-f0-9-]{36}$/i.test(submissionId)) {
    submissionId = Utilities.getUuid(); // Generate a valid one if client sent garbage
  }
  if (!submissionId) {
    submissionId = Utilities.getUuid();
  }

  var validated = {
    submission_id: submissionId,
    zone_id: zoneId,
    submission_type: type,
    remarks: sanitizeInput(data.remarks, 500),
    photo_url: sanitizeInput(data.photo_url, 500)
  };

  if (type === "daily") {
    // Validate criteria object
    var criteria = data.criteria;
    if (!criteria || typeof criteria !== "object") {
      throw new Error("Daily submission requires a 'criteria' object.");
    }

    var schema = getChecklistSchema();
    var validatedCriteria = {};
    schema.criteria.forEach(function(c) {
      var val = criteria[c.id];
      if (val === undefined || val === null) {
        throw new Error("Missing criterion: " + c.id);
      }
      var score = parseInt(val, 10);
      if (score !== 0 && score !== 1) {
        throw new Error("Daily criterion " + c.id + " must be 0 or 1. Received: " + val);
      }
      validatedCriteria[c.id] = score;
    });
    validated.criteria = validatedCriteria;
  }

  if (type === "weekly") {
    // Validate scores object
    var scores = data.scores;
    if (!scores || typeof scores !== "object") {
      throw new Error("Weekly submission requires a 'scores' object.");
    }

    var schema2 = getChecklistSchema();
    var validatedScores = {};
    schema2.criteria.forEach(function(c) {
      var val = scores[c.id];
      if (val === undefined || val === null) {
        throw new Error("Missing score for criterion: " + c.id);
      }
      validatedScores[c.id] = validateScore(val, 0, c.maxScore);
    });
    validated.scores = validatedScores;
    validated.auditor_email = sanitizeInput(data.auditor_email, 100);
    validated.photo_urls = sanitizeInput(data.photo_urls, 2000);
  }

  return validated;
}


// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Logs a structured error to AdminLog and Logger.
 * Delegates to v2LogError_() for a unified AdminLog row format.
 *
 * @param {string} context — Where the error occurred
 * @param {Error|string} error — The error object or message
 * @param {string} severity — "low", "medium", "high", "critical"
 * @private
 */
function logError_(context, error, severity) {
  v2LogError_(severity || 'ERROR', 'Execution', context, error ? { message: (error instanceof Error) ? error.message : String(error), stack: (error instanceof Error) ? (error.stack || '') : '' } : undefined);
}

/**
 * Returns error statistics from AdminLog.
 * Useful for the system status display.
 *
 * @param {number} [days=7] — Look back period in days
 * @returns {Object} { total, critical, high, medium, low, recentErrors[] }
 */
function getErrorStats(days) {
  days = days || 7;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName("AdminLog");
  if (!logSheet || logSheet.getLastRow() <= 1) {
    return { total: 0, critical: 0, high: 0, medium: 0, low: 0, recentErrors: [] };
  }

  var data = logSheet.getDataRange().getValues(); // BATCH_READ
  var stats = { total: 0, critical: 0, high: 0, medium: 0, low: 0, recentErrors: [] };

  for (var r = 1; r < data.length; r++) {
    var action = String(data[r][2]).trim();
    if (!action.startsWith("ERROR:")) continue;

    var timestamp = data[r][0];
    if (timestamp instanceof Date && timestamp < cutoff) continue;

    stats.total++;
    var sev = action.replace("ERROR:", "").toLowerCase();
    if (stats[sev] !== undefined) stats[sev]++;

    if (stats.recentErrors.length < 10) {
      stats.recentErrors.push({
        timestamp: timestamp,
        severity: sev,
        details: String(data[r][3]).substring(0, 200)
      });
    }
  }

  return stats;
}
