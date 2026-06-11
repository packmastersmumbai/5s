/**
 * ============================================================================
 * 16A_V2Foundation.gs — PackMasters 5S v2.0
 * FOUNDATION: Constants, Profiler, Error Framework, Validation, Utilities
 * ============================================================================
 *
 * This file MUST load before all other V2 files (16–20).
 * Provides shared infrastructure that all V2 code depends on.
 *
 * Created to fix: F-01, F-03, F-04, F-05, F-07, F-10, F-11, F-13,
 *                 F-16, F-18, F-19, F-20
 * ============================================================================
 */

// ============================================================================
// COLUMN INDEX CONSTANTS — Fix F-01, F-10, F-11
// ============================================================================
// Maps column names to zero-based indices. If a schema gains a column,
// update ONLY here — all V2 code references these constants, not raw numbers.

/** NC_CAPA sheet column indices (V1 schema: 20 columns A–T) */
var NC_COL = {
  NC_ID: 0, CREATED: 1, ZONE_ID: 2, ZONE_NAME: 3, AUDIT_DATE: 4,
  CRITERION_ID: 5, CRITERION_LABEL: 6, SCORE: 7, AUDITOR: 8,
  ROOT_CAUSE: 9, CORRECTIVE_ACTION: 10, PREVENTIVE_ACTION: 11,
  RESPONSIBLE: 12, TARGET_DATE: 13, STATUS: 14, CLOSURE_DATE: 15,
  VERIFIED_BY: 16, VERIFICATION_REMARKS: 17, IS_REPEAT: 18, REPEAT_COUNT: 19
};

/** TaskBoard sheet column indices (V2 schema: 18 columns) */
var TASK_COL = {
  TASK_ID: 0, CREATED: 1, ZONE_ID: 2, ZONE_NAME: 3, TITLE: 4,
  DESCRIPTION: 5, CATEGORY: 6, PRIORITY: 7, SOURCE: 8, SOURCE_REF: 9,
  ASSIGNED_TO: 10, DUE_DATE: 11, STATUS: 12, UPDATED: 13,
  CLOSED_DATE: 14, CLOSED_BY: 15, REMARKS: 16, PHOTO_URL: 17
};

/** RedTagRegister sheet column indices (V2 schema: 19 columns) */
var RT_COL = {
  TAG_ID: 0, CREATED: 1, ZONE_ID: 2, ZONE_NAME: 3, ITEM_DESC: 4,
  ITEM_CATEGORY: 5, EST_VALUE: 6, PROPOSED_ACTION: 7, PHOTO_URL: 8,
  PHOTO_FILE_ID: 9, TAGGED_BY: 10, OWNER: 11, DEADLINE: 12,
  DISPOSITION: 13, DISPOSED_DATE: 14, DISPOSED_BY: 15,
  REVIEW_NOTES: 16, STATUS: 17, REMARKS: 18
};

/** KaizenSuggestions sheet column indices (V2 schema: 21 columns) */
var KZ_COL = {
  KAIZEN_ID: 0, CREATED: 1, ZONE_ID: 2, ZONE_NAME: 3, SUBMITTER: 4,
  CATEGORY: 5, TITLE: 6, DESCRIPTION: 7, PHOTO_URL: 8,
  EXPECTED_BENEFIT: 9, EST_SAVINGS: 10, STATUS: 11,
  REVIEWER: 12, REVIEW_DATE: 13, REMARKS: 14, ASSIGNED_TO: 15,
  TARGET_DATE: 16, COMPLETED_DATE: 17, ACTUAL_SAVINGS: 18,
  IMPLEMENTATION_NOTES: 19, BENEFIT_VERIFIED_BY: 20
};

/** GembaWalks sheet column indices (V2 schema: 16 columns) */
var GW_COL = {
  WALK_ID: 0, TIMESTAMP: 1, WALK_TYPE: 2, WALKER_NAME: 3,
  WALKER_EMAIL: 4, ZONE_ID: 5, ZONE_NAME: 6, RESPONSES_JSON: 7,
  OBSERVATIONS: 8, TASK_IDS_JSON: 9, PHOTO_URLS: 10,
  TOTAL_Q: 11, YES_COUNT: 12, NO_COUNT: 13, NA_COUNT: 14, COMPLIANCE_PCT: 15
};

/** WDGLL_Library column indices (V2 schema: 9 columns) */
var WD_COL = {
  WD_ID: 0, ZONE_ID: 1, CRITERION_ID: 2, PHOTO_URL: 3,
  PHOTO_FILE_ID: 4, DESCRIPTION: 5, UPLOADED_BY: 6, UPLOADED_DATE: 7, IS_ACTIVE: 8
};

/** TrainingLog column indices (V2 schema: 13 columns) */
var TR_COL = {
  RECORD_ID: 0, WORKER_NAME: 1, WORKER_EMAIL: 2, ZONE_ID: 3,
  TOPIC: 4, PILLAR: 5, STATUS: 6, TRAINED_DATE: 7,
  CERTIFIED_DATE: 8, EXPIRY_DATE: 9, TRAINER: 10, SOP_URL: 11, REMARKS: 12
};

/** DailySubmissions column indices (V1 schema: 18 columns) */
var DS_COL = {
  SUBMISSION_ID: 0, TIMESTAMP: 1, ZONE_ID: 2, ZONE_NAME: 3,
  ZONE_LEADER: 4, SUBMISSION_DATE: 5, SUBMISSION_TYPE: 6,
  S1_SCORE: 7, S2_SCORE: 8, S3_SCORE: 9, S4_SCORE: 10, S5_SCORE: 11,
  TOTAL_PASS: 12, TOTAL_CRITERIA: 13, PCT_SCORE: 14,
  REMARKS: 15, PHOTO_URL: 16, IS_DUPLICATE: 17
};

/** HandoverLog column indices (V2 schema: 14 columns) */
var HO_COL = {
  HANDOVER_ID: 0, TIMESTAMP: 1, ZONE_ID: 2, ZONE_NAME: 3,
  FROM_SHIFT: 4, TO_SHIFT: 5, HANDOVER_BY: 6, HANDOVER_EMAIL: 7,
  KEY_NOTES: 8, SAFETY_CONCERNS: 9, PENDING_TASKS: 10,
  EQUIPMENT_STATUS: 11, PHOTO_URLS: 12, STATUS: 13
};

/** Status enums — Fix F-10 (eliminates all hardcoded status strings) */
var STATUS = {
  OPEN: "OPEN",
  ROOT_CAUSE: "ROOT_CAUSE",
  ACTION_PLANNED: "ACTION_PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  VERIFICATION: "VERIFICATION",
  CLOSED: "CLOSED",
  OVERDUE: "OVERDUE",
  BACKLOG: "BACKLOG",
  THIS_WEEK: "THIS_WEEK",
  DONE: "DONE",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  IMPLEMENTING: "IMPLEMENTING",
  COMPLETED: "COMPLETED",
  BENEFIT_VERIFIED: "BENEFIT_VERIFIED",
  DELETED: "DELETED",
  IDENTIFIED: "IDENTIFIED",
  EVALUATED: "EVALUATED",
  DISPOSED: "DISPOSED"
};

var PRIORITY = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

/** Common timezone — Fix F-10 */
var TZ = "Asia/Kolkata";

// ============================================================================
// ROLE-BASED ACCESS CONTROL (RBAC) — Security Fix
// ============================================================================
/**
 * Role definitions for permission checking
 * Each user can have multiple roles
 */
var ROLES = {
  ADMIN: "ADMIN",                    // System admin: can reset, backup, configure
  MANAGER: "MANAGER",                // Location manager: can review, approve
  ZONE_LEAD: "ZONE_LEAD",            // Zone leader: can submit, edit own zone
  AUDITOR: "AUDITOR",                // Quality auditor: can create NC/CAPA
  VIEWER: "VIEWER"                   // Read-only access
};

/**
 * Permission matrix: action → required role(s)
 * Users must have AT LEAST ONE of the required roles to perform action
 */
var PERMISSION_MAP = {
  // Admin operations (require ADMIN)
  "SYSTEM_INIT": [ROLES.ADMIN],
  "RESET_SYSTEM": [ROLES.ADMIN],
  "BACKUP_DATA": [ROLES.ADMIN],
  "RESTORE_DATA": [ROLES.ADMIN],
  "CONFIGURE_ZONES": [ROLES.ADMIN],
  "MANAGE_USERS": [ROLES.ADMIN],
  "VIEW_AUDIT_LOG": [ROLES.ADMIN, ROLES.MANAGER],

  // Manager operations
  "APPROVE_KAIZEN": [ROLES.ADMIN, ROLES.MANAGER],
  "REVIEW_CAPA": [ROLES.ADMIN, ROLES.MANAGER],
  "OVERRIDE_AUDIT": [ROLES.ADMIN, ROLES.MANAGER],

  // Zone leader operations
  "SUBMIT_AUDIT": [ROLES.ADMIN, ROLES.MANAGER, ROLES.ZONE_LEAD, ROLES.AUDITOR],
  "CORRECT_AUDIT": [ROLES.ADMIN, ROLES.MANAGER, ROLES.ZONE_LEAD],
  "EDIT_ZONE_CONFIG": [ROLES.ADMIN, ROLES.MANAGER],

  // Auditor operations
  "CREATE_NC": [ROLES.ADMIN, ROLES.AUDITOR],
  "CREATE_CAPA": [ROLES.ADMIN, ROLES.AUDITOR],

  // Zone lead / CAPA operations
  "UPDATE_CAPA": [ROLES.ADMIN, ROLES.MANAGER, ROLES.ZONE_LEAD],
  "DELETE_TASK": [ROLES.ADMIN, ROLES.ZONE_LEAD],

  // Viewer (read-only)
  "VIEW_DASHBOARD": [ROLES.ADMIN, ROLES.MANAGER, ROLES.ZONE_LEAD, ROLES.AUDITOR, ROLES.VIEWER]
};

/**
 * Get user roles from configuration
 * Reads from ScriptProperties → USER_ROLES sheet mapping
 * @param {string} userId User email
 * @returns {array} Array of role strings
 */
function v2GetUserRoles_(userId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var userRolesJson = props.getProperty("USER_ROLES");

    if (!userRolesJson) {
      // No USER_ROLES property — default to VIEWER for safety
      return [ROLES.VIEWER];
    }

    var userRoles = JSON.parse(userRolesJson);
    return userRoles[userId] || [ROLES.VIEWER];
  } catch (e) {
    Logger.log("Error getting user roles: " + e.message);
    return [ROLES.VIEWER];  // Safe default: viewer on error
  }
}

/**
 * Check if user has permission to perform action
 * @param {string} action Action identifier (from PERMISSION_MAP)
 * @param {string} userId User email (optional, defaults to current user)
 * @throws {Error} If user lacks required permission
 */
function v2CheckPermission_(action, userId) {
  userId = userId || v2GetCurrentUser_();

  var requiredRoles = PERMISSION_MAP[action];
  if (!requiredRoles) {
    throw new Error("Unknown permission action: " + action);
  }

  var userRoles = v2GetUserRoles_(userId);

  // Check if user has any of the required roles
  for (var i = 0; i < requiredRoles.length; i++) {
    if (userRoles.indexOf(requiredRoles[i]) >= 0) {
      logSecurityEvent_("PERMISSION_GRANTED", action, userId);
      return true;
    }
  }

  // Permission denied
  logSecurityEvent_("PERMISSION_DENIED", action, userId, {
    requiredRoles: requiredRoles,
    userRoles: userRoles
  });

  throw new Error("Access denied: insufficient permissions for action '" + action +
                  "'. Required roles: " + requiredRoles.join(", ") +
                  ". Your roles: " + userRoles.join(", "));
}

/**
 * Log security events (permission checks, denials) to AdminLog
 * @param {string} eventType PERMISSION_GRANTED, PERMISSION_DENIED, UNAUTHORIZED
 * @param {string} action Action attempted
 * @param {string} userId User email
 * @param {object} details Additional context
 */
function logSecurityEvent_(eventType, action, userId, details) {
  try {
    var ss = v2GetSpreadsheet_();
    var adminLogSheet = ss.getSheetByName("AdminLog");
    if (!adminLogSheet) return;

    adminLogSheet.appendRow([
      new Date(),
      eventType,
      userId,
      action,
      JSON.stringify(details || {}),
      "SECURITY"
    ]);
  } catch (e) {
    Logger.log("Error logging security event: " + e.message);
  }
}

// ============================================================================
// EXECUTION PROFILER — Fix F-13
// ============================================================================

/**
 * Lightweight profiler for tracking sub-task durations.
 * Catches the 6-minute GAS limit early.
 */
var V2_PROFILER = {
  _marks: [],
  _totalStart: null,

  /** Start profiling a named block */
  start: function(label) {
    if (!this._totalStart) this._totalStart = Date.now();
    this._marks.push({ label: label, t0: Date.now(), t1: null });
  },

  /** Stop profiling a named block */
  stop: function(label) {
    for (var i = this._marks.length - 1; i >= 0; i--) {
      if (this._marks[i].label === label && !this._marks[i].t1) {
        this._marks[i].t1 = Date.now();
        break;
      }
    }
  },

  /** Get elapsed wall time in seconds since first start() */
  elapsed: function() {
    return this._totalStart ? ((Date.now() - this._totalStart) / 1000).toFixed(1) : "0.0";
  },

  /** Return a compact performance report string */
  report: function() {
    var parts = this._marks.map(function(m) {
      return m.label + ":" + (m.t1 ? (m.t1 - m.t0) + "ms" : "RUNNING");
    });
    return parts.join(" | ") + " | total:" + this.elapsed() + "s";
  },

  /** Check if approaching the 6-minute limit (warn at 5 min) */
  isNearLimit: function() {
    return this._totalStart && (Date.now() - this._totalStart > 300000);
  },

  /** Reset for next run */
  reset: function() {
    this._marks = [];
    this._totalStart = null;
  }
};


// ============================================================================
// V2 ERROR FRAMEWORK — Fix F-03
// ============================================================================
// Integrates with V1's safeExecute/logError_ when available, falls back gracefully.

/**
 * Safe execution wrapper that delegates to V1 framework if available.
 * Logs to ErrorLog sheet on failure, sends email for high/critical severity.
 *
 * @param {Function} fn — Function to execute
 * @param {string} context — Descriptive context for error logging
 * @param {*} [fallback=null] — Value to return on failure
 * @param {string} [severity="medium"] — low|medium|high|critical
 * @returns {*} fn() result or fallback on error
 */
function v2SafeExecute_(fn, context, fallback, severity) {
  severity = severity || "medium";
  fallback = (fallback !== undefined) ? fallback : null;

  try {
    return fn();
  } catch (error) {
    // Log the error for debugging
    var errMsg = (error instanceof Error) ? error.message : String(error);
    var errStack = (error instanceof Error) ? (error.stack || "") : "";
    Logger.log("❌ [V2:" + context + "] " + errMsg + "\n" + errStack);

    // Try to write to ErrorLog
    try {
      var ss = v2GetSpreadsheet_();
      if (ss) {
        var logSheet = ss.getSheetByName("ErrorLog");
        if (logSheet) {
          logSheet.appendRow([new Date(), "V2:" + context, errMsg, severity.toUpperCase(), errStack, v2GetCurrentUser_()]);
        }
      }
    } catch (logErr) {
      Logger.log("Could not write to ErrorLog: " + logErr.message);
    }

    // For array fallbacks, return error info so HTML can show something useful
    if (Array.isArray(fallback)) {
      return fallback; // empty array — page shows "no data"
    }
    // For object fallbacks, inject error info so page can display it
    if (fallback !== null && typeof fallback === "object") {
      fallback._error = errMsg;
      fallback._context = context;
      return fallback;
    }
    return fallback;
  }
}

/**
 * Unified error logger. Writes a single consistent row to AdminLog.
 * @param {string} severity - INFO | WARNING | ERROR | CRITICAL
 * @param {string} category - Execution | DataIntegrity | Permission | Config | Timeout | Security | Quota
 * @param {string} message  - Human-readable description
 * @param {Object} [context] - Optional key/value context object
 */
function v2LogError_(severity, category, message, context) {
  try {
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName('AdminLog');
    if (!sheet) return;
    var row = [
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      severity || 'ERROR',
      category || 'Execution',
      message || '',
      context ? JSON.stringify(context) : '',
      Session.getActiveUser().getEmail() || 'system'
    ];
    sheet.appendRow(row);
  } catch(e) { /* silent — never throw from logger */ }
}


// ============================================================================
// SAFE USER IDENTITY — Fix F-05
// ============================================================================

/**
 * Gets current user email safely. Returns "system" in trigger context
 * instead of empty string or throwing.
 *
 * @returns {string} User email or "system"
 */
function v2GetCurrentUser_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || "system";
  } catch (e) {
    return "system";
  }
}

/**
 * Gets the effective user, preferring an explicit parameter,
 * then Session, then "system".
 *
 * @param {string} [explicitUser] — User email passed from client
 * @returns {string}
 */
function v2ResolveUser_(explicitUser) {
  if (explicitUser && typeof explicitUser === "string" && explicitUser.indexOf("@") > -1) {
    return explicitUser;
  }
  return v2GetCurrentUser_();
}


// ============================================================================
// INPUT VALIDATION — Fix F-07
// ============================================================================

/**
 * Validates and sanitises a V2 input object.
 * Uses V1 sanitizeInput() if available; otherwise applies basic rules.
 *
 * @param {Object} data — Raw input from HTML form
 * @param {Object} rules — { fieldName: { required:bool, type:str, maxLen:num } }
 * @returns {Object} { valid: true/false, data: sanitised, errors: [] }
 */
function v2ValidateInput_(data, rules) {
  if (!data || typeof data !== "object") {
    return { valid: false, data: {}, errors: ["Input must be a non-null object."] };
  }

  var clean = {};
  var errors = [];

  Object.keys(rules).forEach(function(key) {
    var rule = rules[key];
    var val = data[key];

    // Required check
    if (rule.required && (val === undefined || val === null || val === "")) {
      errors.push("Missing required field: " + key);
      clean[key] = "";
      return;
    }

    // Type coercion and sanitisation
    if (val === undefined || val === null) {
      clean[key] = rule.defaultVal !== undefined ? rule.defaultVal : "";
      return;
    }

    if (rule.type === "string") {
      var s = String(val);
      var maxLen = rule.maxLen || 500;
      if (typeof sanitizeInput === "function") {
        s = sanitizeInput(s, maxLen);
      } else {
        s = s.substring(0, maxLen).replace(/<[^>]*>/g, ""); // Strip HTML tags
      }
      clean[key] = s;
    } else if (rule.type === "number") {
      clean[key] = parseFloat(val) || (rule.defaultVal !== undefined ? rule.defaultVal : 0);
    } else if (rule.type === "date") {
      clean[key] = val ? new Date(val) : "";
    } else if (rule.type === "zoneId") {
      if (typeof validateZoneId === "function") {
        try { clean[key] = validateZoneId(val); } catch (e) {
          errors.push("Invalid zone: " + val);
          clean[key] = "";
        }
      } else {
        clean[key] = String(val).replace(/[^A-Za-z0-9\-]/g, "").substring(0, 10);
      }
    } else {
      clean[key] = val;
    }
  });

  return { valid: errors.length === 0, data: clean, errors: errors };
}


// ============================================================================
// SHARED UTILITIES — Fix F-04, F-16
// ============================================================================

/**
 * Gets the active spreadsheet once per execution. All V2 functions
 * should call this instead of SpreadsheetApp.getActiveSpreadsheet() directly.
 *
 * @returns {Spreadsheet}
 */
var _v2CachedSS = null;
function v2GetSpreadsheet_() {
  if (!_v2CachedSS) {
    _v2CachedSS = SpreadsheetApp.getActiveSpreadsheet();
    // Fallback for web app context where getActiveSpreadsheet() returns null
    if (!_v2CachedSS) {
      var ssId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
      if (ssId) {
        _v2CachedSS = SpreadsheetApp.openById(ssId);
      }
    }
  }
  return _v2CachedSS;
}

/**
 * Loads all data from a sheet as a 2D array. Returns empty array if sheet
 * doesn't exist or has no data rows.
 * Replaces the 17_AlertEngine.gs loadSheetData_() — now shared. Fix F-16.
 *
 * @param {Spreadsheet} ss — Spreadsheet object (pass from v2GetSpreadsheet_)
 * @param {string} sheetName — Name of the sheet
 * @returns {Array[]} 2D array including header row, or []
 */
function v2LoadSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getDataRange().getValues();
}

/**
 * Extracts the pillar code from a criterion ID.
 * Fix F-01: pillar is NOT a column in NC_CAPA. It must be derived.
 *
 * @param {string} criterionId — e.g. "S1-C1", "S2-C3", "S6-C1"
 * @returns {string} Pillar code e.g. "S1", "S2", "S6"
 */
function v2ExtractPillar_(criterionId) {
  if (!criterionId) return "";
  var parts = String(criterionId).split("-");
  return parts[0] || "";
}

/**
 * Formats a date for display. Returns empty string for non-dates.
 *
 * @param {*} val — Value that might be a Date
 * @param {string} [format="dd-MMM-yyyy"] — Date format pattern
 * @returns {string}
 */
function v2FormatDate_(val, format) {
  if (!(val instanceof Date)) return "";
  return Utilities.formatDate(val, TZ, format || "dd-MMM-yyyy");
}

/**
 * Batch-updates a single row in a sheet using one setValues() call.
 * Fix F-02: replaces multiple setValue() calls.
 *
 * @param {Sheet} sheet — The sheet object
 * @param {number} rowIndex — 1-based row index
 * @param {Object} updates — { colIndex: value } where colIndex is 0-based
 * @param {Array} originalRow — The original row data for merge
 */
function v2BatchUpdateRow_(sheet, rowIndex, updates, originalRow) {
  var newRow = originalRow.slice(); // Copy
  Object.keys(updates).forEach(function(colStr) {
    var col = parseInt(colStr, 10);
    newRow[col] = updates[col];
  });
  sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
}

/**
 * Gets the zone name for a zoneId from config. Returns zoneId if not found.
 * Caches zoneConfig for the execution.
 *
 * @param {string} zoneId
 * @returns {string} Zone name
 */
var _v2CachedZoneConfig = null;
function v2GetZoneName_(zoneId) {
  if (!_v2CachedZoneConfig) _v2CachedZoneConfig = getZoneConfig();
  var zone = _v2CachedZoneConfig[zoneId];
  return zone ? zone.name : zoneId;
}

/**
 * Gets the full zone config (cached).
 * @returns {Object}
 */
function v2GetZoneConfig_() {
  if (!_v2CachedZoneConfig) _v2CachedZoneConfig = getZoneConfig();
  return _v2CachedZoneConfig;
}


// ============================================================================
// HTML ESCAPING — Fix F-12 (server-side support)
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS.
 * V2 HTML pages should use this when injecting user data into innerHTML.
 *
 * @param {string} str — Raw string
 * @returns {string} HTML-safe string
 */
function v2EscapeHtml_(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================================
// V2 HEALTH CHECK — Fix F-20 (partial test infrastructure)
// ============================================================================

/**
 * V2 Health check — verifies all V2 sheets exist, have headers,
 * and config keys are populated.
 *
 * @returns {Object} { passed:bool, checks:[], errors:[] }
 */
function v2HealthCheck() {
  var ss = v2GetSpreadsheet_();
  var checks = [];
  var errors = [];

  // Check sheets (both V1 and V2)
  var allSheets = [
    "Zones", "ChecklistSchema", "DailySubmissions", "WeeklyAudit",
    "NC_CAPA", "PhotoLog", "Summary", "AdminLog", "QR_Master",
    "AlertRules", "EscalationConfig", "RedTagRegister", "KaizenSuggestions",
    "TaskBoard", "GembaWalkConfig", "GembaWalks", "MapConfig",
    "WDGLL_Library", "TrainingLog", "HandoverLog", "ErrorLog"
  ];
  allSheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    var exists = !!sheet;
    var hasHeaders = exists && sheet.getLastRow() >= 1;
    var rowCount = exists ? Math.max(0, sheet.getLastRow() - 1) : 0;
    checks.push({ name: name, exists: exists, hasHeaders: hasHeaders, rows: rowCount });
    if (!exists) errors.push("Sheet missing: " + name);
  });

  // Check config keys
  var props = PropertiesService.getScriptProperties();
  var configKeys = ["ZONE_CONFIG", "CHECKLIST_SCHEMA", "SPREADSHEET_ID", "DEPLOY_ID",
                    "ALERT_RULES", "ESCALATION_CONFIG", "GEMBA_WALK_CONFIG"];
  configKeys.forEach(function(key) {
    var val = props.getProperty(key);
    var exists = !!val;
    var preview = exists ? String(val).substring(0, 40) + "..." : "NOT SET";
    checks.push({ name: "Config:" + key, exists: exists, preview: preview });
    if (!exists) errors.push("Config key missing: " + key);
  });

  // Check constants loaded
  checks.push({ name: "NC_COL constants", exists: typeof NC_COL !== "undefined" && NC_COL.STATUS === 14 });
  checks.push({ name: "DS_COL constants", exists: typeof DS_COL !== "undefined" && DS_COL.PCT_SCORE === 14 });
  checks.push({ name: "TASK_COL constants", exists: typeof TASK_COL !== "undefined" });
  checks.push({ name: "V2_PROFILER", exists: typeof V2_PROFILER !== "undefined" });

  var passed = errors.length === 0;
  Logger.log("V2 Health Check: " + (passed ? "PASSED" : "FAILED (" + errors.length + " errors)"));
  errors.forEach(function(e) { Logger.log("  ❌ " + e); });

  return { passed: passed, checks: checks, errors: errors };
}

/**
 * Diagnostic function callable from HTML pages via google.script.run.
 * Returns system status for debugging "pages open but nothing works" issues.
 * @returns {Object} Diagnostic results
 */
function v2Diagnose() {
  var result = {
    timestamp: new Date().toISOString(),
    spreadsheet: false,
    spreadsheetId: "",
    zoneConfig: false,
    zoneCount: 0,
    deployId: "",
    sheets: {},
    errors: []
  };

  // 1. Check spreadsheet access
  try {
    var ss = v2GetSpreadsheet_();
    if (ss) {
      result.spreadsheet = true;
      result.spreadsheetId = ss.getId();
    } else {
      result.errors.push("v2GetSpreadsheet_() returned null. SPREADSHEET_ID may not be set.");
    }
  } catch (e) {
    result.errors.push("Spreadsheet access failed: " + e.message);
  }

  // 2. Check ScriptProperties
  try {
    var props = PropertiesService.getScriptProperties();
    result.spreadsheetId = props.getProperty("SPREADSHEET_ID") || "NOT SET";
    result.deployId = props.getProperty("DEPLOY_ID") || "NOT SET";
    var zc = props.getProperty("ZONE_CONFIG");
    if (zc) {
      result.zoneConfig = true;
      result.zoneCount = Object.keys(JSON.parse(zc)).length;
    } else {
      result.errors.push("ZONE_CONFIG not set. Run Initial Setup from the spreadsheet menu.");
    }
  } catch (e) {
    result.errors.push("ScriptProperties access failed: " + e.message);
  }

  // 3. Check key sheets and data
  if (result.spreadsheet) {
    try {
      var ss = v2GetSpreadsheet_();
      var sheetNames = ["DailySubmissions", "NC_CAPA", "TaskBoard", "RedTagRegister",
                        "KaizenSuggestions", "GembaWalks", "TrainingLog", "HandoverLog", "Summary"];
      sheetNames.forEach(function(name) {
        var sheet = ss.getSheetByName(name);
        result.sheets[name] = sheet ? Math.max(0, sheet.getLastRow() - 1) : -1; // -1 = missing
      });
    } catch (e) {
      result.errors.push("Sheet check failed: " + e.message);
    }
  }

  return result;
}


// ============================================================================
// WORKFLOW & ROLE-BASED ACCESS CONTROL — Phase 7
// ============================================================================

/**
 * Returns available workflows and tools filtered by user role.
 * Works with both Google OAuth (userId) and username/password auth (token).
 * Used by buildBottomNav_() and HomePage to show only allowed tools.
 *
 * @param {string} [token] — Session token (for username/password auth) or userId (for OAuth)
 * @returns {Object} { userId, userRoles, allowedTools:[], isAdmin, isManager }
 */
function getAvailableWorkflows_(token) {
  var userId;
  var userRoles = [];

  try {
    // Try to get session from token (new username/password auth)
    if (token && token.length > 20) { // UUID is longer than email
      var props = PropertiesService.getScriptProperties();
      var sessionKey = "SESSION_" + token;
      var sessionJson = props.getProperty(sessionKey);

      if (sessionJson) {
        var session = JSON.parse(sessionJson);
        userId = session.username;
        userRoles = [session.role]; // Already stored as role string
      }
    }

    // Fallback: Use OAuth (old system)
    if (!userId || userRoles.length === 0) {
      userId = token || v2GetCurrentUser_();
      userRoles = v2GetUserRoles_(userId);
    }
  } catch (e) {
    // Fallback to current user if anything fails
    userId = v2GetCurrentUser_();
    userRoles = v2GetUserRoles_(userId);
  }

  // Define all available tools (ID, label, icon)
  var allTools = {
    home: { label: "Home", icon: "house" },
    sqcdp: { label: "SQCDP Board", icon: "grid" },
    actionlist: { label: "Action List", icon: "zap" },
    quickaudit: { label: "Quick Audit", icon: "clip" },
    handover: { label: "Shift Handover", icon: "swap" },
    tierdash: { label: "Tier Dashboard", icon: "layers" },
    mrmpack: { label: "MRM Report", icon: "file" },
    kaizen: { label: "Kaizen", icon: "bulb" },
    kanban: { label: "Kanban", icon: "kanban" },
    redtag: { label: "Red Tag", icon: "tag" },
    gemba: { label: "Gemba", icon: "walk" },
    opl: { label: "OPL Library", icon: "book" },
    floormap: { label: "Floor Map", icon: "map" },
    skills: { label: "Skills", icon: "people" },
    settings: { label: "Settings", icon: "gear" },
    mapeditor: { label: "Map Editor", icon: "edit" }
  };

  // Base tools: Everyone can see these (read-only)
  var allowedToolIds = ["home", "sqcdp", "actionlist", "quickaudit", "handover",
                        "tierdash", "mrmpack", "opl", "floormap"];

  // AUDITOR: Can create NC/CAPA
  if (userRoles.indexOf(ROLES.AUDITOR) >= 0) {
    allowedToolIds.push("capa");
  }

  // ZONE_LEAD: Can manage tasks and red tags
  if (userRoles.indexOf(ROLES.ZONE_LEAD) >= 0) {
    allowedToolIds.push("taskboard", "kanban", "redtag", "kaizen", "gemba");
  }

  // MANAGER: Can access settings and admin tools
  if (userRoles.indexOf(ROLES.MANAGER) >= 0) {
    allowedToolIds.push("settings", "skills", "mapeditor");
  }

  // ADMIN: Can access everything
  if (userRoles.indexOf(ROLES.ADMIN) >= 0) {
    allowedToolIds = Object.keys(allTools);
  }

  // Build allowed tools array with full details
  var allowedTools = [];
  allowedToolIds.forEach(function(id) {
    if (allTools[id]) {
      var t = allTools[id];
      allowedTools.push({
        id: id,
        label: t.label,
        icon: t.icon
      });
    }
  });

  return {
    userId: userId,
    userRoles: userRoles,
    allowedTools: allowedTools,
    isAdmin: userRoles.indexOf(ROLES.ADMIN) >= 0,
    isManager: userRoles.indexOf(ROLES.MANAGER) >= 0,
    isZoneLead: userRoles.indexOf(ROLES.ZONE_LEAD) >= 0,
    isAuditor: userRoles.indexOf(ROLES.AUDITOR) >= 0
  };
}

/**
 * Assigns roles to a user. Admin-only operation.
 *
 * @param {string} userEmail — User's Google email
 * @param {Array} rolesArray — Array of role strings (e.g., [ROLES.MANAGER, ROLES.AUDITOR])
 * @returns {Object} { success, message }
 */
function setUserRoles_(userEmail, rolesArray) {
  try {
    v2CheckPermission_("MANAGE_USERS", v2GetCurrentUser_());

    var props = PropertiesService.getScriptProperties();
    var userRolesJson = props.getProperty("USER_ROLES") || "{}";
    var userRoles = JSON.parse(userRolesJson);

    // Validate roles
    if (!Array.isArray(rolesArray) || rolesArray.length === 0) {
      return { success: false, message: "Must assign at least one role." };
    }

    // Ensure only valid roles are assigned
    var validRoles = [ROLES.ADMIN, ROLES.MANAGER, ROLES.ZONE_LEAD, ROLES.AUDITOR, ROLES.VIEWER];
    var cleaned = [];
    rolesArray.forEach(function(role) {
      if (validRoles.indexOf(role) >= 0 && cleaned.indexOf(role) < 0) {
        cleaned.push(role);
      }
    });

    if (cleaned.length === 0) {
      return { success: false, message: "No valid roles provided." };
    }

    userRoles[userEmail] = cleaned;
    props.setProperty("USER_ROLES", JSON.stringify(userRoles));

    logSecurityEvent_("USER_ROLES_UPDATED", "setUserRoles", v2GetCurrentUser_(), {
      targetUser: userEmail,
      roles: cleaned
    });

    return { success: true, message: "User " + userEmail + " assigned roles: " + cleaned.join(", ") };
  } catch (e) {
    Logger.log("Error setting user roles: " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Gets all users and their assigned roles. Admin-only operation.
 *
 * @returns {Object} { success, users:[] }
 */
function getAllUserRoles_() {
  try {
    v2CheckPermission_("MANAGE_USERS", v2GetCurrentUser_());

    var props = PropertiesService.getScriptProperties();
    var userRolesJson = props.getProperty("USER_ROLES") || "{}";
    var userRolesMap = JSON.parse(userRolesJson);

    var users = [];
    Object.keys(userRolesMap).forEach(function(email) {
      users.push({
        email: email,
        roles: userRolesMap[email] || [ROLES.VIEWER]
      });
    });

    // Sort by email
    users.sort(function(a, b) { return a.email.localeCompare(b.email); });

    return { success: true, users: users };
  } catch (e) {
    Logger.log("Error getting user roles: " + e.message);
    return { success: false, users: [] };
  }
}

// ============================================================================
// XSS PREVENTION — Fix for buildBottomNav_ string concatenation
// ============================================================================

/**
 * Safely escapes a string for use in HTML attributes.
 * Prevents XSS attacks by escaping special HTML characters.
 *
 * @param {string} value — The value to escape
 * @returns {string} Escaped value safe for HTML attributes
 * @private
 */
function v2EscapeAttributeHtml_(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ✅ REMOVED: setupTestUsers() — Use quickSetup() in 04_AdminUtils.js instead
// The new system uses username/password authentication with the Users sheet

// ============================================================================
// SPC CONTROL LIMIT CALCULATIONS — Plan D (Analytics & SPC)
// ============================================================================

/**
 * Calculate SPC stats: mean, stddev, UCL, LCL, slope over last N days.
 * UCL = mean + 3σ, LCL = max(0, mean - 3σ).
 * @param {number[]} values — Array of numeric values
 * @param {number} [lookbackDays] — Rolling window size (default 30)
 * @returns {Object} { mean, stddev, ucl, lcl, slope, min, max, points }
 */
function v2SPCCalculator_(values, lookbackDays) {
  if (!values || values.length === 0) {
    return { mean: 0, stddev: 0, ucl: 0, lcl: 0, slope: 0, min: 0, max: 0, points: 0 };
  }

  lookbackDays = lookbackDays || 30;

  // Keep only last N data points
  var window = values.slice(Math.max(0, values.length - lookbackDays));

  // Mean
  var sum = window.reduce(function(a, b) { return a + b; }, 0);
  var mean = sum / window.length;

  // Standard deviation (population)
  var variance = window.reduce(function(a, val) {
    return a + Math.pow(val - mean, 2);
  }, 0) / window.length;
  var stddev = Math.sqrt(variance);

  // SPC: UCL = mean + 3σ, LCL = mean - 3σ (floored at 0)
  var ucl = mean + (3 * stddev);
  var lcl = Math.max(0, mean - (3 * stddev));

  // Linear regression slope (per-day trend)
  var n = window.length;
  var sumX = (n * (n - 1)) / 2;
  var sumY = sum;
  var sumXY = 0;
  var sumX2 = 0;

  for (var i = 0; i < n; i++) {
    sumXY += i * window[i];
    sumX2 += i * i;
  }

  var denom = (n * sumX2 - sumX * sumX);
  var slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  return {
    mean:   Math.round(mean   * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    ucl:    Math.round(ucl    * 100) / 100,
    lcl:    Math.round(lcl    * 100) / 100,
    slope:  Math.round(slope  * 10000) / 10000,
    min:    Math.min.apply(null, window),
    max:    Math.max.apply(null, window),
    points: window.length
  };
}

/**
 * Determine 7-day trend status from recent values.
 * Returns GREEN (slope > 0.5), AMBER (flat), RED (slope < -0.5), or GRAY (< 7 points).
 * @param {number[]} values
 * @returns {string} "GREEN" | "AMBER" | "RED" | "GRAY"
 */
function v2TrendStatus_(values) {
  if (!values || values.length < 7) return "GRAY";
  var spc = v2SPCCalculator_(values, 7);
  if (spc.slope > 0.5)  return "GREEN";
  if (spc.slope < -0.5) return "RED";
  return "AMBER";
}
// and no longer relies on Google OAuth email-based user setup.

// ============================================================================
// AUDIT TRAIL LOGGING — Plan E (ISO Compliance)
// ============================================================================

/** AuditTrail sheet column indices (10 columns A–J) */
var AT_COL = {
  TIMESTAMP: 0,
  ACTOR_EMAIL: 1,
  ACTION: 2,
  TARGET_TYPE: 3,
  TARGET_ID: 4,
  BEFORE_STATE: 5,
  AFTER_STATE: 6,
  REASON: 7,
  ZONE_ID: 8,
  SESSION_ID: 9
};

/**
 * Appends an immutable audit trail entry to the AuditTrail sheet.
 * Call at every CAPA/submission status transition.
 *
 * @param {string} action     — e.g. "STATUS_CHANGE", "CAPA_CREATED", "CAPA_CLOSED"
 * @param {string} targetId   — Record ID (NC ID, task ID, submission ID)
 * @param {*}      before     — Previous state/value (object or string)
 * @param {*}      after      — New state/value (object or string)
 * @param {string} [reason]   — Human-readable reason for the change
 * @param {string} [targetType] — Sheet/record type: "NC_CAPA" | "TaskBoard" | "DailySubmissions" etc.
 * @param {string} [zoneId]   — Zone ID for context
 */
function v2LogAuditTrail_(action, targetId, before, after, reason, targetType, zoneId) {
  try {
    var ss = v2GetSpreadsheet_();
    if (!ss) return;
    var auditSheet = ss.getSheetByName("AuditTrail");
    if (!auditSheet) {
      Logger.log("AuditTrail sheet not found — skipping audit log for: " + action + " " + targetId);
      return;
    }
    var actor = v2GetCurrentUser_();
    var sessionId = Utilities.getUuid ? Utilities.getUuid().substring(0, 8) : String(Date.now()).slice(-8);
    var row = [
      new Date(),
      actor,
      String(action || ""),
      String(targetType || ""),
      String(targetId || ""),
      typeof before === "object" ? JSON.stringify(before) : String(before || ""),
      typeof after  === "object" ? JSON.stringify(after)  : String(after  || ""),
      String(reason || ""),
      String(zoneId || ""),
      sessionId
    ];
    auditSheet.appendRow(row);
  } catch (e) {
    Logger.log("v2LogAuditTrail_ error (non-fatal): " + e.message);
  }
}

/**
 * Returns the last N audit trail entries for a specific record.
 * Used by Management Review dashboard and record detail pages.
 *
 * @param {string} targetType — "NC_CAPA" | "TaskBoard" | etc. (pass "" to search all)
 * @param {string} targetId   — Record ID to filter on (pass "" to return all)
 * @param {number} [limit]    — Max rows to return (default 50)
 * @returns {Object[]} Array of audit entry objects, newest first
 */
function v2GetAuditHistory_(targetType, targetId, limit) {
  try {
    limit = limit || 50;
    var ss = v2GetSpreadsheet_();
    if (!ss) return [];
    var auditSheet = ss.getSheetByName("AuditTrail");
    if (!auditSheet || auditSheet.getLastRow() <= 1) return [];

    var data = auditSheet.getDataRange().getValues();
    var results = [];

    for (var r = data.length - 1; r >= 1; r--) {
      var row = data[r];
      var rowTargetType = String(row[AT_COL.TARGET_TYPE] || "");
      var rowTargetId   = String(row[AT_COL.TARGET_ID]   || "");

      if (targetType && rowTargetType !== targetType) continue;
      if (targetId   && rowTargetId   !== targetId)   continue;

      var ts = row[AT_COL.TIMESTAMP];
      results.push({
        timestamp:   ts instanceof Date ? Utilities.formatDate(ts, TZ, "dd-MMM-yyyy HH:mm") : String(ts || ""),
        actorEmail:  String(row[AT_COL.ACTOR_EMAIL] || ""),
        action:      String(row[AT_COL.ACTION]      || ""),
        targetType:  rowTargetType,
        targetId:    rowTargetId,
        beforeState: String(row[AT_COL.BEFORE_STATE] || ""),
        afterState:  String(row[AT_COL.AFTER_STATE]  || ""),
        reason:      String(row[AT_COL.REASON]       || ""),
        zoneId:      String(row[AT_COL.ZONE_ID]      || "")
      });

      if (results.length >= limit) break;
    }
    return results;
  } catch (e) {
    Logger.log("v2GetAuditHistory_ error: " + e.message);
    return [];
  }
}
