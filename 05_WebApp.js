/**
 * ============================================================================
 * 05_WebApp.gs — PackMasters 5S Integrated System
 * Phase 2: Web App Router, doGet/doPost, Form Submission Handler
 * ============================================================================
 *
 * This is the single entry point for all HTTP requests to the Web App.
 * doGet(e) routes to the correct HTML page based on URL parameters.
 * doPost(e) handles all form submissions.
 *
 * CONSTRAINT-1: BATCH_READ only — one getDataRange().getValues() per function.
 * CONSTRAINT-2: doGet makes ZERO Sheets API calls. All config injected from ScriptProperties.
 * CONSTRAINT-3: One appendRow() call per valid form submission.
 * CONSTRAINT-7: All zone/criteria data comes from config, never hardcoded.
 * CONSTRAINT-8: All HTML is mobile-first (360px minimum).
 *
 * URL Routing:
 *   ?zone=Z-01                         → Zone Landing Page
 *   ?zone=Z-01&type=daily              → Daily Checksheet Form
 *   ?zone=Z-01&type=weekly             → Weekly Audit Form (auth-gated)
 *   ?action=data&zone=Z-01             → JSON data endpoint for dashboard
 *   ?action=dashboard&zone=Z-01        → Zone Dashboard (Phase 4)
 *   ?action=print&zone=Z-01&month=YYYY-MM → Printable Audit Report (Phase 4)
 *   (no params)                        → System Home / Zone Selector
 *
 * Functions:
 *   doGet(e)                   — HTTP GET router
 *   doPost(e)                  — HTTP POST form handler
 *   buildDailyRow_(data)       — Constructs complete daily submission row array
 *   buildWeeklyRow_(data)      — Constructs complete weekly audit row array
 *   checkDuplicate_(zoneId, type, dateStr) — Dedup check
 *   checkAuditorAuth(email)    — Validates auditor email against whitelist
 *   generateUUID()             — Creates a UUID for client-side use
 *   uploadPhotoToDrive(base64, fileName, zoneId) — Saves photo to zone folder
 *   servePage_(templateFile, templateData) — Renders HTML template with injected data
 */

// ============================================================================
// doGet — HTTP GET ROUTER
// ============================================================================

/**
 * Main entry point for all GET requests.
 * Routes based on URL parameters. Makes ZERO Sheets API calls.
 * All config data is injected into templates from ScriptProperties.
 *
 * @param {Object} e — Event object with parameter and parameters
 * @returns {HtmlOutput} Rendered HTML page
 */
function doGet(e) {
  var params = e ? (e.parameter || {}) : {};
  var action = params.action || "";
  var zoneId = params.zone || "";
  var formType = params.type || "";
  var token = params.token || "";

  try {
    // ── JSONP API (GitHub Pages cross-origin calls) ──
    if (params.fn && params.callback) {
      var cb = String(params.callback).replace(/[^a-zA-Z0-9_]/g, '');
      var fnArgs = [];
      try { if (params.args) fnArgs = JSON.parse(params.args); } catch(ignore) {}
      var fnResult = null;
      try {
        if (params.fn === 'getPublicZones') {
          var zc = getZoneConfig();
          fnResult = Object.keys(zc).sort().map(function(id) {
            return { id: id, name: zc[id].name || id };
          });
        } else if (params.fn === 'getZoneMapData') {
          fnResult = getZoneMapData();
        }
      } catch(fnErr) {
        Logger.log('JSONP fn error: ' + fnErr.message);
        fnResult = {};
      }
      return ContentService.createTextOutput(cb + '(' + JSON.stringify(fnResult) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // ═════════════════════════════════════════════════════════
    // AUTHENTICATION CHECK
    // Worker actions (QR zone access) bypass login.
    // Protected actions (dashboards, admin) require a session.
    // Default route (no action, no session) → Zone Selector.
    // ═════════════════════════════════════════════════════════

    // Actions that floor workers can access without logging in
    var WORKER_ACTIONS = ['quickaudit', 'daily', 'weeklyaudit', 'sw', 'manifest'];

    var isLoginAction  = action === "login";
    var isWorkerAction = WORKER_ACTIONS.indexOf(action) >= 0;

    var session = null;
    if (!isLoginAction && !isWorkerAction) {
      // Validate session token for all protected pages
      session = validateSession(token);
      if (!session.valid) {
        // No session and no action → show Zone Selector (not login)
        if (!action) {
          return serveZoneSelector_();
        }
        // Protected action requested without session → show login
        var loginTmpl = HtmlService.createTemplateFromFile("LoginPage");
        loginTmpl.deployUrl = ScriptApp.getService().getUrl();
        loginTmpl.clearStaleToken = token ? true : false;
        return loginTmpl.evaluate()
          .setTitle("PackMasters 5S — Login")
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
          .addMetaTag("viewport", "width=device-width, initial-scale=1");
      }

      // ✅ VALID SESSION → Inject auth context
      params.token = token;
      params.currentUser = session.username;
      params.currentRole = session.role;
    } else if (isWorkerAction) {
      // Worker bypass — inject minimal context
      params.currentUser = "worker";
      params.currentRole = "WORKER";
    }

    // Route: Login page
    if (isLoginAction) {
      var loginTmpl = HtmlService.createTemplateFromFile("LoginPage");
      loginTmpl.deployUrl = ScriptApp.getService().getUrl();
      loginTmpl.clearStaleToken = token ? true : false;
      return loginTmpl.evaluate()
        .setTitle("PackMasters 5S — Login")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
    }

    // Route: V2 enhancement pages (v2=1 parameter)
    if (params.v2 === "1" && typeof handleV2Route_ === "function") {
      var v2Result = handleV2Route_(params);
      if (v2Result) return v2Result;
    }

    // Route: JSON data endpoint (for dashboard async loading — Phase 4)
    if (action === "data") {
      return handleDataRequest_(params);
    }

    // Route: Dashboard view (Phase 4 — serve shell now, data loaded async)
    if (action === "dashboard") {
      return serveDashboardPage_(params);
    }

    // Route: Print view (Phase 4)
    if (action === "print") {
      return servePrintPage_(params);
    }

    // Route: Service Worker JS file
    if (action === "sw") {
      return serveServiceWorker_();
    }

    // Route: PWA Manifest
    if (action === "manifest") {
      return serveManifest_();
    }

    // Route: Kanban action board
    if (action === "kanban") {
      return servePage_("KanbanBoard", { zone: params.zone || "ALL" });
    }

    // Route: Pillar trend charts
    if (action === "charts") {
      return servePage_("ChartsView", { zone: params.zone || "ALL" });
    }

    // Route: Analytics KPI dashboard
    if (action === "analytics") {
      return servePage_("AnalyticsView", {});
    }

    // Route: Raise red tag form
    if (action === "raiseredtag") {
      return servePage_("RedTagForm", { zone: params.zone || "" });
    }

    // Route: Zone specified
    if (zoneId) {
      // Validate zone ID against config (no Sheets call)
      var zoneConfig = getZoneConfig();
      if (!zoneConfig[zoneId]) {
        return serveErrorPage_("Invalid Zone", "Zone ID '" + zoneId + "' not found in system configuration.");
      }

      var zone = zoneConfig[zoneId];

      if (formType === "daily") {
        return serveDailyForm_(zone);
      }

      if (formType === "weekly") {
        return serveWeeklyForm_(zone);
      }

      // No type specified — show landing page
      return serveLandingPage_(zone);
    }

    // Route: No parameters — show zone selector / home page
    return serveHomePage_();

  } catch (error) {
    Logger.log("doGet error: " + error.message + "\n" + error.stack);
    return serveErrorPage_("System Error", error.message);
  }
}


// ============================================================================
// doPost — HTTP POST FORM HANDLER
// ============================================================================

/**
 * Handles all form submissions (daily checksheet and weekly audit).
 * Validates input, checks for duplicates, writes exactly ONE row.
 *
 * CONSTRAINT-3: Exactly one appendRow() per valid submission.
 *
 * @param {Object} e — Event object with postData
 * @returns {TextOutput} JSON response
 */
function doPost(e) {
  try {
    // Parse the POST body
    var data;
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    } else {
      return jsonResponse_(400, { error: "No data received" });
    }

    // Validate required fields
    if (!data.zone_id) {
      return jsonResponse_(400, { error: "Missing zone_id" });
    }
    if (!data.submission_type || ["daily", "weekly"].indexOf(data.submission_type) === -1) {
      return jsonResponse_(400, { error: "Invalid submission_type. Must be 'daily' or 'weekly'." });
    }

    // Validate zone against config (no Sheets call)
    var zoneConfig = getZoneConfig();
    if (!zoneConfig[data.zone_id]) {
      return jsonResponse_(400, { error: "Unknown zone_id: " + data.zone_id });
    }

    var zone = zoneConfig[data.zone_id];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");

    // ── DAILY SUBMISSION ──
    if (data.submission_type === "daily") {
      // Dedup check
      var isDuplicate = checkDuplicate_(data.zone_id, "daily", dateStr);

      // Build complete row array
      var dailyRow = buildDailyRow_(data, zone, now, dateStr, isDuplicate);

      // Write ONE row
      var dailySheet = ss.getSheetByName("DailySubmissions");
      if (!dailySheet) {
        return jsonResponse_(500, { error: "DailySubmissions sheet not found" });
      }
      dailySheet.appendRow(dailyRow);

      var response = {
        success: true,
        submission_id: dailyRow[0],
        zone_id: data.zone_id,
        zone_name: zone.name,
        total_pass: dailyRow[12],
        total_criteria: dailyRow[13],
        pct_score: dailyRow[14],
        is_duplicate: isDuplicate,
        message: isDuplicate ?
          "⚠️ Duplicate submission detected for " + zone.name + " on " + dateStr + ". Recorded with duplicate flag." :
          "✅ Daily checksheet submitted successfully for " + zone.name + "."
      };

      return jsonResponse_(200, response);
    }

    // ── WEEKLY AUDIT SUBMISSION ──
    if (data.submission_type === "weekly") {
      // Auth check — only MC whitelist can submit weekly audits
      // Validate session token — weekly audits require a logged-in session
      var weeklySession = validateSession(data.token || "");
      if (!weeklySession.valid) {
        return jsonResponse_(403, { error: "Unauthorized. Weekly audits require a valid login session." });
      }
      var auditorEmail = weeklySession.username + "@packmasters.in"; // resolved from session, not client-supplied

      if (!checkAuditorAuth(auditorEmail)) {
        return jsonResponse_(403, {
          error: "Unauthorized. Only designated auditors can submit weekly audits.",
          email: auditorEmail
        });
      }

      // Build complete row array
      var weeklyRow = buildWeeklyRow_(data, zone, now, dateStr, auditorEmail);

      // Write ONE row
      var weeklySheet = ss.getSheetByName("WeeklyAudit");
      if (!weeklySheet) {
        return jsonResponse_(500, { error: "WeeklyAudit sheet not found" });
      }
      weeklySheet.appendRow(weeklyRow);

      // Auto-create CAPAs for any score <= ncThreshold (Phase 3 hook)
      if (typeof createCAPAFromAudit_ === "function") {
        createCAPAFromAudit_(data, zone, auditorEmail, dateStr);
      }

      var weeklyResponse = {
        success: true,
        submission_id: weeklyRow[0],
        zone_id: data.zone_id,
        zone_name: zone.name,
        total_score: weeklyRow[weeklyRow.length - 6],
        max_score: weeklyRow[weeklyRow.length - 5],
        pct_score: weeklyRow[weeklyRow.length - 4],
        nc_count: weeklyRow[weeklyRow.length - 3],
        message: "✅ Weekly audit submitted successfully for " + zone.name + "."
      };

      return jsonResponse_(200, weeklyResponse);
    }

  } catch (error) {
    Logger.log("doPost error: " + error.message + "\n" + error.stack);
    return jsonResponse_(500, { error: "Server error: " + error.message });
  }
}


// ============================================================================
// ROW BUILDERS
// ============================================================================

/**
 * Constructs the complete daily submission row array.
 * Pre-builds everything in memory before any sheet write.
 *
 * @param {Object} data — Form data from POST
 * @param {Object} zone — Zone config object
 * @param {Date} now — Server timestamp
 * @param {string} dateStr — YYYY-MM-DD date string
 * @param {boolean} isDuplicate — Whether this is a duplicate submission
 * @returns {Array} Complete row array matching DailySubmissions column schema
 */
function buildDailyRow_(data, zone, now, dateStr, isDuplicate) {
  var schema = getChecklistSchema();

  // Parse criterion results per pillar
  // data.criteria should be an object like: { "S1-C1": 1, "S1-C2": 0, ... }
  var criteria = data.criteria || {};
  var pillarScores = {};
  var totalPass = 0;

  schema.pillars.forEach(function(pillar) {
    var pillarPass = 0;
    var pillarCriteria = schema.criteria.filter(function(c) { return c.pillar === pillar; });
    pillarCriteria.forEach(function(c) {
      var score = parseInt(criteria[c.id], 10);
      if (score === 1) {
        pillarPass++;
        totalPass++;
      }
    });
    pillarScores[pillar] = pillarPass;
  });

  var totalCriteria = schema.totalCriteria;
  var pctScore = totalCriteria > 0 ? Math.round((totalPass / totalCriteria) * 10000) / 100 : 0;

  // Columns A through R per schema
  return [
    data.submission_id || generateUUID(),    // A: submission_id
    now,                                      // B: timestamp
    zone.id,                                  // C: zone_id
    zone.name,                                // D: zone_name
    zone.leader,                              // E: zone_leader
    dateStr,                                  // F: submission_date
    "daily",                                  // G: submission_type
    pillarScores["S1"] || 0,                  // H: s1_score
    pillarScores["S2"] || 0,                  // I: s2_score
    pillarScores["S3"] || 0,                  // J: s3_score
    pillarScores["S4"] || 0,                  // K: s4_score
    pillarScores["S5"] || 0,                  // L: s5_score
    totalPass,                                // M: total_pass
    totalCriteria,                            // N: total_criteria
    pctScore,                                 // O: pct_score
    data.remarks || "",                       // P: remarks
    data.photo_url || "",                     // Q: photo_url
    isDuplicate                               // R: is_duplicate
  ];
}

/**
 * Constructs the complete weekly audit row array.
 *
 * @param {Object} data — Form data from POST
 * @param {Object} zone — Zone config object
 * @param {Date} now — Server timestamp
 * @param {string} dateStr — YYYY-MM-DD date string
 * @param {string} auditorEmail — Auditor's email address
 * @returns {Array} Complete row array matching WeeklyAudit column schema
 */
function buildWeeklyRow_(data, zone, now, dateStr, auditorEmail) {
  var schema = getChecklistSchema();
  var scores = data.scores || {};

  // Build row: fixed columns + per-criterion scores + summary columns
  var row = [
    data.submission_id || generateUUID(),    // A: submission_id
    now,                                      // B: timestamp
    zone.id,                                  // C: zone_id
    zone.name,                                // D: zone_name
    auditorEmail,                             // E: auditor_email
    dateStr                                   // F: audit_date
  ];

  // Add per-criterion scores (columns G through Z, one per criterion)
  var totalScore = 0;
  var maxScore = 0;
  var ncCount = 0;
  var ncDetails = [];

  schema.criteria.forEach(function(criterion) {
    var score = parseInt(scores[criterion.id], 10);
    if (isNaN(score)) score = 0;
    score = Math.max(0, Math.min(criterion.maxScore, score)); // Clamp to valid range

    row.push(score);
    totalScore += score;
    maxScore += criterion.maxScore;

    // NC detection: score <= ncThreshold (default 1)
    if (score <= (schema.ncThreshold || 1)) {
      ncCount++;
      ncDetails.push({
        criterionId: criterion.id,
        pillar: criterion.pillar,
        label: criterion.labelEn,
        score: score,
        maxScore: criterion.maxScore
      });
    }
  });

  var pctScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  // Add summary columns
  row.push(totalScore);                          // total_score
  row.push(maxScore);                             // max_score
  row.push(pctScore);                             // pct_score
  row.push(ncCount);                              // nc_count
  row.push(JSON.stringify(ncDetails));            // nc_details
  row.push(data.photo_urls || "[]");              // photo_urls

  return row;
}


// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Checks if a submission already exists for the given zone+type+date.
 * Reads from the appropriate sheet using BATCH_READ pattern.
 *
 * CONSTRAINT-1: One getDataRange().getValues() call only.
 *
 * @param {string} zoneId — Zone ID
 * @param {string} type — "daily" or "weekly"
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {boolean} true if duplicate found
 */
function checkDuplicate_(zoneId, type, dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = (type === "daily") ? "DailySubmissions" : "WeeklyAudit";
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    return false;
  }

  // BATCH_READ — read all data once
  var data = sheet.getDataRange().getValues();

  // Column indices (0-based)
  var zoneCol = 2;    // C: zone_id
  var dateCol = 5; // F: submission_date / audit_date
  var dupCol = (type === "daily") ? 17 : -1; // R: is_duplicate (daily only)

  for (var r = 1; r < data.length; r++) {
    var rowZone = String(data[r][zoneCol]).trim();
    var rowDate = "";

    // Handle date formatting
    if (data[r][dateCol] instanceof Date) {
      rowDate = Utilities.formatDate(data[r][dateCol], "Asia/Kolkata", "yyyy-MM-dd");
    } else {
      rowDate = String(data[r][dateCol]).trim();
    }

    // Check for non-duplicate match for same zone and date
    if (rowZone === zoneId && rowDate === dateStr) {
      // For daily: skip rows already flagged as duplicates
      if (type === "daily" && dupCol >= 0 && data[r][dupCol] === true) {
        continue;
      }
      return true;
    }
  }

  return false;
}


// ============================================================================
// AUDITOR AUTHENTICATION
// ============================================================================

/**
 * Checks if the given email is in the MC auditor whitelist.
 * Called from weekly form via google.script.run and from doPost.
 *
 * @param {string} email — Email to check
 * @returns {boolean} true if authorized
 */
function checkAuditorAuth(email) {
  if (!email) return false;
  email = email.toLowerCase().trim();

  try {
    var whitelist = getConfig("MC_WHITELIST");
    if (Array.isArray(whitelist)) {
      return whitelist.some(function(e) { return e.toLowerCase().trim() === email; });
    }
  } catch (err) {
    Logger.log("Auth check error: " + err.message);
  }

  // Fallback: check MC_EMAIL directly
  var mcEmail = PropertiesService.getScriptProperties().getProperty("MC_EMAIL") || "";
  return email === mcEmail.toLowerCase().trim();
}


// ============================================================================
// UUID GENERATOR
// ============================================================================

/**
 * Generates a UUID v4 string.
 * Used for submission IDs when not provided by the client.
 *
 * @returns {string} UUID string like "550e8400-e29b-41d4-a716-446655440000"
 */
function generateUUID() {
  return Utilities.getUuid();
}


// ============================================================================
// PHOTO UPLOAD
// ============================================================================

/**
 * Uploads a base64-encoded photo to the zone's Drive folder.
 * Called from the HTML form via google.script.run.
 *
 * @param {string} base64Data — Base64 encoded image data (without data: prefix)
 * @param {string} fileName — Desired file name
 * @param {string} zoneId — Zone ID for folder selection
 * @returns {Object} { url: string, fileId: string } or { error: string }
 */
function uploadPhotoToDrive(base64Data, fileName, zoneId) {
  try {
    var zoneConfig = getZoneConfig();
    if (!zoneConfig[zoneId]) {
      return { error: "Unknown zone: " + zoneId };
    }

    var folderId = zoneConfig[zoneId].driveFolderId;
    if (!folderId) {
      return { error: "No Drive folder configured for zone: " + zoneId };
    }

    // Decode base64
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, "image/jpeg", fileName);

    // Save to zone folder
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);

    // Set sharing to anyone with link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var url = file.getUrl();
    var thumbnailUrl = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400";

    return {
      url: url,
      fileId: file.getId(),
      thumbnailUrl: thumbnailUrl,
      fileName: file.getName()
    };

  } catch (error) {
    Logger.log("Photo upload error: " + error.message);
    return { error: "Upload failed: " + error.message };
  }
}

/**
 * Gets the current user's email.
 * Called from HTML forms to check auth before rendering weekly form.
 *
 * @returns {string} User's email or empty string
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (e) {
    return "";
  }
}


// ============================================================================
// PAGE SERVING FUNCTIONS
// ============================================================================

/**
 * Serves the system home page with zone selector.
 * @returns {HtmlOutput}
 * @private
 */
/**
 * Serve zone selector — public landing for floor workers (no login required).
 * Workers tap their zone to go directly to QuickAudit.
 * @private
 */
function serveZoneSelector_() {
  var deployUrl = getDeployUrl_();
  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();
  var zones = zoneIds.map(function(id) {
    return { id: id, name: zoneConfig[id].name || id };
  });
  var template = HtmlService.createTemplateFromFile("ZoneSelector");
  template.deployUrl = deployUrl;
  template.zonesJson = JSON.stringify(zones);
  return template.evaluate()
    .setTitle("PackMasters 5S — Select Zone")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function serveHomePage_() {
  var zoneConfig = getZoneConfig();
  var templateData = {
    zones: zoneConfig,
    zoneIds: Object.keys(zoneConfig).sort(),
    pageTitle: "PackMasters 5S System"
  };

  // Use direct template.evaluate() so we can inject the bottom nav via string-replace
  var template = HtmlService.createTemplateFromFile("HomePage");
  template.data      = JSON.stringify(templateData);
  var deployUrl      = getDeployUrl_();
  template.deployUrl = deployUrl;

  var output  = template.evaluate();
  var navHtml = buildBottomNav_(deployUrl, "", ""); // empty action → Home tab active (V1 pages have no token)
  var content = output.getContent().replace('</body>', navHtml + '\n</body>');

  return HtmlService.createHtmlOutput(content)
    .setTitle(templateData.pageTitle || "PackMasters 5S")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
}

/**
 * Serves the zone landing page with Daily/Weekly buttons.
 * @param {Object} zone — Zone config object
 * @returns {HtmlOutput}
 * @private
 */
function serveLandingPage_(zone) {
  var templateData = {
    zone: zone,
    pageTitle: zone.id + " — " + zone.name
  };
  return servePage_("LandingPage", templateData);
}

/**
 * Serves the daily checksheet form.
 * @param {Object} zone — Zone config object
 * @returns {HtmlOutput}
 * @private
 */
function serveDailyForm_(zone) {
  var schema = getChecklistSchema();
  var templateData = {
    zone: zone,
    schema: schema,
    pageTitle: "Daily Checksheet — " + zone.name
  };
  return servePage_("DailyForm", templateData);
}

/**
 * Serves the weekly audit form (auth-gated).
 * @param {Object} zone — Zone config object
 * @returns {HtmlOutput}
 * @private
 */
function serveWeeklyForm_(zone) {
  var schema = getChecklistSchema();
  var templateData = {
    zone: zone,
    schema: schema,
    pageTitle: "Weekly Audit — " + zone.name
  };
  return servePage_("WeeklyForm", templateData);
}

/**
 * Serves the service worker JavaScript file.
 * @returns {TextOutput}
 * @private
 */
function serveServiceWorker_() {
  var template = HtmlService.createTemplateFromFile("ServiceWorker");
  var output = ContentService.createTextOutput(template.evaluate().getContent());
  output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return output;
}

/**
 * Serves the PWA manifest JSON.
 * @returns {TextOutput}
 * @private
 */
function serveManifest_() {
  var manifest = {
    name: "PackMasters 5S",
    short_name: "PM 5S",
    description: "PackMasters 5S Integrated Management System",
    start_url: ScriptApp.getService().getUrl(),
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a5276",
    theme_color: "#1a5276",
    icons: [
      {
        src: "https://chart.googleapis.com/chart?cht=qr&chs=192x192&chl=PM5S&choe=UTF-8",
        sizes: "192x192",
        type: "image/png"
      }
    ]
  };
  return ContentService.createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Serves dashboard page stub (Phase 4 implementation).
 * @param {Object} params — URL parameters
 * @returns {HtmlOutput}
 * @private
 */
function serveDashboardPage_(params) {
  if (typeof serveDashboardFull_ === "function") {
    return serveDashboardFull_(params);
  }
  return serveErrorPage_("Coming Soon", "Dashboard will be available after Phase 4 deployment.");
}

/**
 * Serves print page stub (Phase 4 implementation).
 * @param {Object} params — URL parameters
 * @returns {HtmlOutput}
 * @private
 */
function servePrintPage_(params) {
  if (typeof servePrintFull_ === "function") {
    return servePrintFull_(params);
  }
  return serveErrorPage_("Coming Soon", "Print view will be available after Phase 4 deployment.");
}

/**
 * Handles data request for async dashboard loading (Phase 4).
 * @param {Object} params — URL parameters
 * @returns {TextOutput} JSON
 * @private
 */
function handleDataRequest_(params) {
  if (typeof handleDataRequestFull_ === "function") {
    return handleDataRequestFull_(params);
  }
  return jsonResponse_(200, { message: "Data endpoint ready. Phase 4 will provide full data." });
}

/**
 * Renders an HTML template file with injected data.
 * Uses scriptlet injection to pass server data to client without API calls.
 *
 * @param {string} templateFile — HTML file name (without extension)
 * @param {Object} templateData — Data to inject
 * @returns {HtmlOutput}
 * @private
 */
function servePage_(templateFile, templateData) {
  var template = HtmlService.createTemplateFromFile(templateFile);

  // Inject all template data as a JSON string
  template.data = JSON.stringify(templateData);
  template.deployUrl = getDeployUrl_();

  var htmlOutput = template.evaluate()
    .setTitle(templateData.pageTitle || "PackMasters 5S")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");

  return htmlOutput;
}

/**
 * Serves an error page.
 * @param {string} title — Error title
 * @param {string} message — Error details
 * @returns {HtmlOutput}
 * @private
 */
function serveErrorPage_(title, message) {
  var html = '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;}' +
    '.error-box{max-width:400px;margin:40px auto;background:white;border-radius:12px;' +
    'padding:30px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1);}' +
    '.error-icon{font-size:48px;margin-bottom:15px;}' +
    'h2{color:#c0392b;margin:0 0 10px;}' +
    'p{color:#555;line-height:1.5;}' +
    'a{color:#1a5276;text-decoration:none;font-weight:bold;}' +
    '</style></head><body>' +
    '<div class="error-box">' +
    '<div class="error-icon">⚠️</div>' +
    '<h2>' + title + '</h2>' +
    '<p>' + message + '</p>' +
    '<p><a href="' + getDeployUrl_() + '">← Back to Home</a></p>' +
    '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle("Error — PackMasters 5S")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Creates a JSON response for doPost.
 * @param {number} statusCode — HTTP status code (informational only in Apps Script)
 * @param {Object} body — Response object
 * @returns {TextOutput}
 * @private
 */
function jsonResponse_(statusCode, body) {
  body.statusCode = statusCode;
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Gets the current Web App deployment URL.
 * Returns the deployment URL from DEPLOY_ID, or the current execution URL,
 * or an empty string as last resort (makes links relative to current page).
 * NEVER returns "#" which would break navigation in Apps Script iframes.
 *
 * @returns {string}
 * @private
 */
function getDeployUrl_() {
  // Always prefer the live URL of whichever deployment is executing
  try {
    var url = ScriptApp.getService().getUrl();
    if (url) return url;
  } catch (e) {
    Logger.log("getDeployUrl_ ScriptApp fallback failed: " + e.message);
  }
  var deployId = PropertiesService.getScriptProperties().getProperty("DEPLOY_ID");
  if (deployId && deployId !== "NOT_SET") {
    return "https://script.google.com/macros/s/" + deployId + "/exec";
  }
  return "";
}

/**
 * Include helper for HTML templates — allows <?!= include('FileName') ?>
 * @param {string} filename — HTML file name to include
 * @returns {string} File content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
