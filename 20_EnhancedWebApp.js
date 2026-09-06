/**
 * ============================================================================
 * 20_EnhancedWebApp.gs — PackMasters 5S v2.0
 * Enhancement: Extended Routes, Enhanced Admin Menu, Data Import, MRM Pack
 * ============================================================================
 *
 * Extends doGet with new routes for v2 HTML pages.
 * Adds enhanced admin menu items.
 * Provides data import utility.
 * Generates monthly MRM report pack.
 *
 * NOTE: The existing doGet/doPost in 05_WebApp.gs remains the entry point.
 * These functions are called FROM the existing router when the action matches.
 */

// ============================================================================
// EXTENDED ROUTE HANDLER (called from existing doGet)
// ============================================================================

/**
 * Handles v2 page routes. Returns HtmlOutput or null if not matched.
 * Add to existing doGet: if (action starts with "v2_") return handleV2Route_(params);
 *
 * @param {Object} params — URL parameters
 * @returns {HtmlOutput|null}
 */
function handleV2Route_(params) {
  var action = params.action || "";
  // Use session role from validated token (params.currentRole set by doGet after validateSession)
  // Fall back to GAS OAuth email lookup only if session role is not available
  var sessionRole = (params.currentRole || "").toUpperCase();
  var userRoles = sessionRole ? [sessionRole] : v2GetUserRoles_(v2GetCurrentUser_());

  // Permission checks for restricted routes
  try {
    switch (action) {
      // Restricted to AUDITOR+: Can create NC/CAPA
      case "capa":
        if (userRoles.indexOf(ROLES.AUDITOR) < 0 && userRoles.indexOf(ROLES.ZONE_LEAD) < 0 &&
            userRoles.indexOf(ROLES.MANAGER) < 0 && userRoles.indexOf(ROLES.ADMIN) < 0) {
          throw new Error("Auditor or higher role required to create CAPAs");
        }
        break;

      // Restricted to ZONE_LEAD+: Can manage tasks, red tags, kaizen
      // 'kaizen' (the idea-submission form) is deliberately NOT here — it is a
      // worker route reached from the zone selector with no login. Reviewing
      // ideas on 'kaizenboard' still requires ZONE_LEAD+.
      case "taskboard":
      case "redtag":
      case "redtagboard":
      case "kaizenboard":
      case "gembawalk":
      case "gembaboard":
        if (userRoles.indexOf(ROLES.ZONE_LEAD) < 0 && userRoles.indexOf(ROLES.MANAGER) < 0 &&
            userRoles.indexOf(ROLES.ADMIN) < 0) {
          throw new Error("Zone Lead or higher role required");
        }
        break;
      // Kanban/Charts/Analytics/RedTagForm: all authenticated users
      case "kanban":
      case "charts":
      case "analytics":
      case "raiseredtag":
        break;

      // Restricted to MANAGER+: Settings, Skills, Map Editor, Management Review
      case "settings":
      case "skills":
      case "mapeditor":
      case "mgmtreview":
        if (userRoles.indexOf(ROLES.MANAGER) < 0 && userRoles.indexOf(ROLES.ADMIN) < 0) {
          throw new Error("Manager or Admin role required");
        }
        break;

      // Restricted to ADMIN: Setup wizard
      case "setupwizard":
      case "dataimport":
      case "zonecriteria":
        if (userRoles.indexOf(ROLES.ADMIN) < 0) {
          throw new Error("Admin role required");
        }
        break;
    }
  } catch (e) {
    Logger.log("Route access denied: " + e.message);
    return serveErrorPage_("Access Denied", e.message);
  }

  switch (action) {
    // ── Primary tool routes (bottom nav + HomePage strip) ────────────────
    case "sqcdp":        return serveV2Page_("InsightsView", params);
    case "sqcdpboard":   return serveV2Page_("InsightsView", params);  // retired SQCDPBoard
    case "actionlist":   return serveV2Page_("ActionsHub", params);
    case "quickaudit":   return serveV2Page_("QuickAudit", params);
    case "zonematrix":   return serveV2Page_("ZoneMatrix", params);
    case "zonecriteria": return serveV2Page_("ZoneCriteria", params);
    case "handover":     return serveV2Page_("ShiftHandover", params);
    case "tierdash":     return serveV2Page_("TierDashboard_Full", params);
    case "mrmpack":      return serveV2Page_("MRMReportPack_Full", params);
    case "opl":          return serveV2Page_("OPLViewer", params);
    case "riskregister": return serveV2Page_("TierDashboard_Full", params);
    // ── Zone-level tools ─────────────────────────────────────────────────
    /* Per-type record pages. Six destinations, one implementation: the hub
       already lists, filters and opens every type, so these arrive pre-scoped
       via params.only rather than duplicating it six times. */
    case "audits":       params.only = "AUDIT";   return serveV2Page_("ActionsHub", params);
    case "issues":       params.only = "NC";      return serveV2Page_("ActionsHub", params);
    case "tasks":        params.only = "TASK";    return serveV2Page_("ActionsHub", params);
    case "walks":        params.only = "GEMBA";   return serveV2Page_("ActionsHub", params);
    case "kaizenlist":   params.only = "KAIZEN";  return serveV2Page_("ActionsHub", params);
    case "kanban":       return serveV2Page_("ActionsHub", params);
    case "charts":       return serveV2Page_("InsightsView", params);
    case "analytics":    return serveV2Page_("InsightsView", params);
    case "insights":     return serveV2Page_("InsightsView", params);
    case "raiseredtag":  return serveV2Page_("ActionsHub", params);   // red tags created via QuickAudit; managed on Actions
    case "taskboard":    return serveV2Page_("TaskBoard", params);
    case "gembaboard":   return serveV2Page_("GembaBoard", params);
    case "gembawalk":    return serveV2Page_("GembaWalkForm", params);
    case "redtag":       return serveV2Page_("ActionsHub", params);   // Red Tag dashboard retired; Actions covers list/manage
    case "redtagboard":  return serveV2Page_("ActionsHub", params);
    case "kaizen":       return serveV2Page_("KaizenForm", params);
    case "kaizenboard":  return serveV2Page_("KaizenBoard", params);
    case "audithistory": return serveV2Page_("AuditHistory", params);
    // ── Admin / configuration tools ───────────────────────────────────────
    case "floormap":     return serveV2Page_("FloorMap", params);
    case "mapeditor":    return serveV2Page_("MapEditor", params);
    case "skills":       return serveV2Page_("SkillsMatrix", params);
    case "photoannotate":
    case "photoannotator": return serveV2Page_("PhotoAnnotator", params);
    case "record":         return serveV2Page_("RecordView", params);   // public read-only single record
    case "wdgll":        return serveV2Page_("WDGLLLibrary", params);
    case "setupwizard":  return serveV2Page_("SetupWizard", params);
    case "dataimport":   return serveV2Page_("DataImport", params);
    case "settings":     return serveV2Page_("MasterSettings", params);
    case "capa":         return serveV2Page_("CAPATracker", params);
    case "mgmtreview":   return serveV2Page_("ManagementReview", params);
    case "home":         return serveV2Page_("HomePage", params);
    case "login": {
      var loginTemplate = HtmlService.createTemplateFromFile("LoginPage");
      loginTemplate.deployUrl = (function() { try { return v2WebAppUrl_("") || "#"; } catch(e) { return "#"; } })();
      loginTemplate.clearStaleToken = false;
      return loginTemplate.evaluate()
        .setTitle("PackMasters 5S — Login")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag("viewport", "width=device-width, initial-scale=1");
    }
    default:             return null;
  }
}

function serveV2Page_(templateFile, params) {
  try {
    // RecordView is a standalone, unauthenticated single-record page opened
    // from Telegram links, hit repeatedly by anonymous visitors with no
    // session. It only ever needs deployUrl — none of the zone/checklist/
    // home/floormap config below applies (no zone context to navigate with,
    // no CommonStyles include for the nav chrome to render against). Skip
    // straight to a minimal render: this avoids reading+parsing ZONE_CONFIG
    // (~195KB of JSON) and CHECKLIST_SCHEMA from PropertiesService on every
    // single load, which was the dominant cost on this page.
    if (templateFile === "RecordView") {
      return serveRecordViewFast_(params);
    }

    var template = HtmlService.createTemplateFromFile(templateFile);
    template.params = params || {};

    // Inject config
    var props = PropertiesService.getScriptProperties();
    var deployId = props.getProperty("DEPLOY_ID") || "";
    // Always prefer the live deployment URL; fall back to stored DEPLOY_ID only if unavailable
    // DEPLOY_ID first via v2WebAppUrl_; the old order preferred the service URL
    // and shipped links to a dead deployment.
    var deployUrl = (function() {
      try { var c = (typeof v2WebAppUrl_ === "function") ? v2WebAppUrl_("") : ""; if (c) return c; } catch(e) {}
      try { var u = ScriptApp.getService().getUrl(); if (u) return u; } catch(e) {}
      return (deployId && deployId !== "NOT_SET")
        ? "https://script.google.com/macros/s/" + deployId + "/exec"
        : "#";
    })();

    template.deployUrl = deployUrl;
    template.zoneId = (params && params.zone) ? String(params.zone).replace(/[^a-zA-Z0-9\-_]/g, "") : "";
    var zoneConfigRaw = props.getProperty("ZONE_CONFIG") || "{}";
    var zoneConfigObj = {};
    try { zoneConfigObj = JSON.parse(zoneConfigRaw); } catch(e) {}
    var zoneIds = Object.keys(zoneConfigObj);
    template.data = JSON.stringify({
      deployUrl: deployUrl,
      zoneId: template.zoneId,
      zones: zoneConfigObj,
      zoneIds: zoneIds
    });
    template.config = {
      zoneConfig: props.getProperty("ZONE_CONFIG") || "{}",
      checklistSchema: props.getProperty("CHECKLIST_SCHEMA") || "{}",
      deployId: deployId,
      deployUrl: deployUrl,
      companyName: props.getProperty("COMPANY_NAME") || "PackMasters",
      auditor: (params && params.currentUserName) || "",
      auditorUsername: (params && params.currentUser) || ""
    };

    var action = (params && params.action) ? String(params.action).toLowerCase() : "";

    // ── Inject home data for home page ──
    var homeData = null;
    if (action === 'home') {
      try {
        homeData = getHomeData_(params && params.token ? params.token : '', template.zoneId || 'Z-01');
      } catch(e) {
        homeData = { score: null, scoreColor: 'a', tasks: [], stats: { openCAPAs: 0, redTags: 0, kaizens: 0, auditStreak: 0 } };
      }
    }
    template.homeData = homeData ? JSON.stringify(homeData) : 'null';

    // ── Inject floor map data for floormap page ──
    try {
      if (action === 'floormap') {
        var fmData = getFloorMapData_();
        template.floorMapData = fmData ? JSON.stringify(fmData) : 'null';
      } else {
        template.floorMapData = 'null';
      }
    } catch(e) {
      template.floorMapData = 'null';
    }

    var output = template.evaluate();

    // Normalize retired aliases so nav highlights the correct item
    var navAction = (action === "sqcdp" || action === "sqcdpboard" || action === "charts") ? "insights"
                  : (action === "redtag" || action === "redtagboard" || action === "raiseredtag" || action === "kanban") ? "actionlist"
                  : action;

    var bottomNavHtml = buildBottomNav_(
      deployUrl,
      navAction,
      params && params.token ? params.token : "",
      params && params.zone ? params.zone : ""
    );
    var sidebarHtml = buildSidebar_(
      deployUrl,
      navAction,
      params && params.token ? params.token : "",
      params && params.zone ? params.zone : "",
      zoneConfigObj
    );
    var pageChromeHtml = buildPageChrome_(
      deployUrl,
      navAction,
      params && params.token ? params.token : "",
      params && params.zone ? params.zone : "",
      zoneConfigObj,
      params && params.only ? params.only : ""
    );
    var finalContent = output.getContent()
      .replace('</body>', sidebarHtml + pageChromeHtml + bottomNavHtml + '\n</body>');
    return HtmlService.createHtmlOutput(finalContent)
      .setTitle("PackMasters 5S — " + templateFile)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (e) {
    Logger.log("Error serving v2 page " + templateFile + ": " + e.message);
    return serveErrorPage_("Page Error", "Could not load " + templateFile + ": " + e.message);
  }
}

/** Minimal, fast render path for RecordView — see serveV2Page_ comment. */
function serveRecordViewFast_(params) {
  var template = HtmlService.createTemplateFromFile("RecordView");
  template.params = params || {};
  // Preload the record server-side. The page previously painted, THEN issued a
  // google.script.run round trip for its data, so the viewer watched a spinner
  // for the full latency of a second GAS invocation on top of the page load.
  // Measured 2026-09-02: the lookup itself is only 0.7-1.3s cold / 4ms warm, so
  // the wait was almost entirely the extra hop. Inlining it means the record is
  // already in the HTML. Failure is non-fatal: preload stays null and the client
  // falls back to its original fetch, so a preload bug degrades to the old speed
  // rather than an empty page.
  template.preload = "null";
  try {
    var _t = String((params && params.type) || "").replace(/[^a-zA-Z]/g, "");
    var _i = String((params && params.id) || "").replace(/[^a-zA-Z0-9\-_]/g, "");
    if (_t && _i) {
      var _rec = getPublicRecord(_t, _i);
      if (_rec) template.preload = JSON.stringify(_rec);
    }
  } catch (e) {
    Logger.log("RecordView preload failed (client will fetch): " + e.message);
  }
  // This is the page Telegram 'Open record' links land on, so its own
  // deployUrl must resolve DEPLOY_ID first — the old order preferred the
  // service URL and pointed onward links at a dead deployment.
  template.deployUrl = (function() {
    try { var c = (typeof v2WebAppUrl_ === "function") ? v2WebAppUrl_("") : ""; if (c) return c; } catch(e) {}
    try { var u = ScriptApp.getService().getUrl(); if (u) return u; } catch(e) {}
    var deployId = PropertiesService.getScriptProperties().getProperty("DEPLOY_ID") || "";
    return (deployId && deployId !== "NOT_SET") ? "https://script.google.com/macros/s/" + deployId + "/exec" : "#";
  })();
  return HtmlService.createHtmlOutput(template.evaluate().getContent())
    .setTitle("PackMasters 5S — Record")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// ============================================================================
// ENHANCED ADMIN MENU
// ============================================================================

/**
 * Adds v2 enhancement menu items.
 * Called from existing onOpen/createAdminMenu.
 */
function createEnhancedAdminMenu() {
  // Menu consolidated into 📋 PackMasters Admin in 04_AdminUtils.js
}

// ============================================================================
// ENHANCED MASTER ORCHESTRATOR HOOK
// ============================================================================

/**
 * V2 orchestrator tasks. Call this from the existing masterOrchestrator.
 * Add to 06_Triggers.gs masterOrchestrator():
 *   if (typeof runV2OrchestratorTasks === "function") runV2OrchestratorTasks(digestEvents);
 *
 * @param {Object} digestEvents
 */
function runV2OrchestratorTasks(digestEvents) {
  V2_PROFILER.reset();
  Logger.log("\n▸ V2 Enhancement Tasks starting...");
  Logger.log("  🔄 Running V2 orchestrator tasks...");

  // Ensure digestEvents has required structure
  if (!digestEvents.zoneEvents) digestEvents.zoneEvents = {};
  if (!digestEvents.mcEvents) digestEvents.mcEvents = [];
  if (!digestEvents.topMgtEvents) digestEvents.topMgtEvents = [];

  try {
    // 1. Evaluate alert rules
    evaluateAlertRules(digestEvents);
  } catch (e) {
    Logger.log("  ⚠️ Alert rules error: " + e.message);
  }

  try {
    // 2. Process escalation ladder
    processEscalationLadder(digestEvents);
  } catch (e) {
    Logger.log("  ⚠️ Escalation error: " + e.message);
  }

  try {
    // 3. Send pre-audit reminders
    sendPreAuditReminders(digestEvents);
  } catch (e) {
    Logger.log("  ⚠️ Pre-audit reminder error: " + e.message);
  }

  try {
    // 4. Detect streaks
    detectStreaks(digestEvents);
  } catch (e) {
    Logger.log("  ⚠️ Streak detection error: " + e.message);
  }

  try {
    // 5. Send webhook digest
    sendWebhookDigest(digestEvents);
  } catch (e) {
    Logger.log("  ⚠️ Webhook digest error: " + e.message);
  }

  Logger.log("  ✅ V2 orchestrator tasks complete.");
}

// ============================================================================
// MRM REPORT PACK AUTO-GENERATION
// ============================================================================

/**
 * Generates and emails a monthly MRM report pack.
 * Scheduled to run on 2nd working day of each month.
 */
function generateMRMReportPack() {
  var ss = v2GetSpreadsheet_();
  var props = PropertiesService.getScriptProperties();
  var mcEmail = props.getProperty("MC_EMAIL") || "";
  var topEmail = props.getProperty("TOP_EMAIL") || "";
  var zoneConfig = v2GetZoneConfig_();
  var zoneIds = Object.keys(zoneConfig).sort();
  var now = new Date();

  // Previous month
  var prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthStr = Utilities.formatDate(prevMonth, TZ, "yyyy-MM");
  var monthDisplay = Utilities.formatDate(prevMonth, TZ, "MMMM yyyy");

  // BATCH_READ all data
  var summaryData = v2LoadSheet_(ss, "Summary");
  var capaData = v2LoadSheet_(ss, "NC_CAPA");
  var weeklyData = v2LoadSheet_(ss, "WeeklyAudit");

  // ── Per-zone scorecards ──
  var zoneScores = [];
  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    var monthScores = [];
    for (var r = 1; r < weeklyData.length; r++) {
      if (String(weeklyData[r][2]).trim() === zoneId) {
        var auditDate = weeklyData[r][5];
        if (auditDate instanceof Date) {
          var auditMonth = Utilities.formatDate(auditDate, TZ, "yyyy-MM");
          if (auditMonth === monthStr) {
            monthScores.push(parseFloat(weeklyData[r][weeklyData[r].length - 4]) || 0);
          }
        }
      }
    }

    var openNCs = 0, closedNCs = 0;
    for (var r = 1; r < capaData.length; r++) {
      if (String(capaData[r][2]).trim() === zoneId) {
        var status = String(capaData[r][14]).trim();
        if (status === "CLOSED") closedNCs++;
        else openNCs++;
      }
    }

    var avgScore = monthScores.length > 0 ? Math.round(monthScores.reduce(function(a, b) { return a + b; }, 0) / monthScores.length) : 0;
    zoneScores.push({
      id: zoneId, name: zone.name, leader: zone.leader,
      avgScore: avgScore, auditCount: monthScores.length,
      openNCs: openNCs, closedNCs: closedNCs
    });
  });

  zoneScores.sort(function(a, b) { return b.avgScore - a.avgScore; });
  var top3 = zoneScores.slice(0, 3);
  var bottom3 = zoneScores.slice(-3).reverse();

  // ── Build HTML email ──
  var html = emailHeader_("📊 MRM Report Pack — " + monthDisplay);
  html += '<div style="padding:20px;">';

  // Plant average
  var plantAvg = zoneScores.length > 0 ? Math.round(zoneScores.reduce(function(s, z) { return s + z.avgScore; }, 0) / zoneScores.length) : 0;
  var totalOpen = zoneScores.reduce(function(s, z) { return s + z.openNCs; }, 0);
  var totalClosed = zoneScores.reduce(function(s, z) { return s + z.closedNCs; }, 0);

  html += '<h2 style="color:#1a5276;margin-bottom:8px;">Executive Summary</h2>';
  html += '<table style="width:100%;border-collapse:collapse;margin:12px 0;">';
  html += '<tr><td style="padding:16px;text-align:center;background:#e8f8f0;width:25%;"><b style="font-size:28px;color:#27ae60;">' + plantAvg + '%</b><br>Plant Average</td>';
  html += '<td style="padding:16px;text-align:center;background:#ebf5fb;width:25%;"><b style="font-size:28px;color:#2980b9;">' + zoneIds.length + '</b><br>Zones</td>';
  html += '<td style="padding:16px;text-align:center;background:#fef9e7;width:25%;"><b style="font-size:28px;color:#f39c12;">' + totalOpen + '</b><br>Open NCs</td>';
  html += '<td style="padding:16px;text-align:center;background:#e8f8f0;width:25%;"><b style="font-size:28px;color:#27ae60;">' + totalClosed + '</b><br>Closed NCs</td></tr>';
  html += '</table>';

  // Top & Bottom 3
  html += '<h3 style="color:#27ae60;">🏆 Top 3 Zones</h3><ol>';
  top3.forEach(function(z) { html += '<li><b>' + z.name + '</b> — ' + z.avgScore + '% (Leader: ' + z.leader + ')</li>'; });
  html += '</ol>';

  html += '<h3 style="color:#e74c3c;">⚠️ Bottom 3 Zones</h3><ol>';
  bottom3.forEach(function(z) { html += '<li><b>' + z.name + '</b> — ' + z.avgScore + '% (Leader: ' + z.leader + ')</li>'; });
  html += '</ol>';

  // Full scorecard table
  html += '<h3 style="color:#1a5276;">Zone Scorecards</h3>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<tr style="background:#1a5276;color:white;">' +
    '<th style="padding:6px;">Zone</th><th style="padding:6px;">Avg Score</th>' +
    '<th style="padding:6px;">Audits</th><th style="padding:6px;">Open NCs</th>' +
    '<th style="padding:6px;">Closed NCs</th><th style="padding:6px;">Leader</th></tr>';

  zoneScores.forEach(function(z, i) {
    var bg = i % 2 === 0 ? "#fff" : "#f8f9fa";
    var scoreColor = z.avgScore >= 80 ? "#27ae60" : (z.avgScore >= 60 ? "#f39c12" : "#e74c3c");
    html += '<tr style="background:' + bg + ';">' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + z.id + ' — ' + z.name + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:' + scoreColor + ';">' + z.avgScore + '%</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + z.auditCount + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + z.openNCs + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + z.closedNCs + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + z.leader + '</td></tr>';
  });
  html += '</table>';

  // Recommended MRM agenda
  html += '<h3 style="color:#1a5276;">📋 Recommended MRM Agenda</h3>';
  html += '<ol style="line-height:1.8;">';
  html += '<li>Review plant average trend (' + plantAvg + '% this month)</li>';
  html += '<li>Recognise top performers: ' + top3.map(function(z) { return z.name; }).join(", ") + '</li>';
  html += '<li>Discuss improvement plans for: ' + bottom3.map(function(z) { return z.name; }).join(", ") + '</li>';
  html += '<li>Review ' + totalOpen + ' open NC/CAPAs — target closure plan</li>';
  html += '<li>Kaizen suggestions review and approval</li>';
  html += '<li>Training & skills matrix update</li>';
  html += '<li>Next month targets and action items</li>';
  html += '</ol>';

  html += '</div>';
  html += emailFooter_();

  // Send
  var recipients = [mcEmail, topEmail].filter(function(e) { return e; }).join(",");
  if (recipients) {
    try {
      emailWrapper_(recipients, "📊 MRM Report Pack — " + monthDisplay + " — Plant Avg " + plantAvg + "%", html);
      Logger.log("  📧 MRM report pack sent for " + monthDisplay);
      logAdminAction_("generateMRMReportPack", "MRM pack for " + monthDisplay + " sent to " + recipients);
    } catch (e) {
      Logger.log("  ⚠️ MRM report email failed: " + e.message);
    }
  }

  v2GetSpreadsheet_().toast("MRM Report Pack sent!", "MRM", 5);
}

// ============================================================================
// DATA IMPORT UTILITY
// ============================================================================

/**
 * Imports CSV data into a target sheet.
 * Called from DataImport.html.
 *
 * @param {string} targetSheet — "DailySubmissions" or "WeeklyAudit"
 * @param {string[][]} rows — Array of arrays (parsed CSV)
 * @param {Object} columnMapping — {csvCol: sheetCol} mapping
 * @returns {Object} {success, importedCount, errors}
 */
function importData(targetSheet, rows, columnMapping) {
  try {
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName(targetSheet);
    if (!sheet) return { success: false, message: "Sheet '" + targetSheet + "' not found." };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var importedCount = 0;
    var errors = [];

    rows.forEach(function(row, idx) {
      try {
        var newRow = new Array(headers.length).fill("");
        Object.keys(columnMapping).forEach(function(csvIdx) {
          var sheetColIdx = parseInt(columnMapping[csvIdx], 10);
          if (sheetColIdx >= 0 && sheetColIdx < headers.length) {
            newRow[sheetColIdx] = row[parseInt(csvIdx, 10)] || "";
          }
        });
        sheet.appendRow(newRow);
        importedCount++;
      } catch (e) {
        errors.push("Row " + (idx + 1) + ": " + e.message);
      }
    });

    logAdminAction_("importData", importedCount + " rows imported to " + targetSheet);
    return { success: true, importedCount: importedCount, errors: errors };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Gets headers for a target sheet (for column mapping UI).
 */
function getSheetHeaders(sheetName) {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// ============================================================================
// SETUP WIZARD SUPPORT
// ============================================================================


// ============================================================================
// BOTTOM NAV — ICON LIBRARY
// ============================================================================

/**
 * SVG icon set used by buildBottomNav_ and the More overlay.
 * Module-level so it is accessible across all GAS files in the project.
 */
var PM_NAV_ICONS_ = {
  house:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>',
  grid:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  zap:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  swap:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  menu:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  list:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  file:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  bulb:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="5" height="14" rx="1"/></svg>',
  tag:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  walk:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><path d="M9 20l2-8-1-1H7l1-4h8l1 4h-3l-1 1 2 8"/><path d="M7 12l-2 5"/></svg>',
  book:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

// ============================================================================
// BOTTOM NAV BUILDER
// ============================================================================

/**
 * Generates mobile-only bottom navigation (≤768px)
 * 5 main tabs: Home, Audit, Actions, Boards, More
 * All links include zone parameter for persistence.
 *
 * @param {string} deployUrl — deployment URL for navigation links
 * @param {string} action — current page action (for active state)
 * @param {string} token — session token
 * @param {string} zone — current zone ID
 * @returns {string} HTML bottom nav bar
 */
/**
 * Filter rail + create button, shared by every record page.
 *
 * The three filters were previously per-page controls in different places (or
 * absent), so changing the working set meant learning a new control on each
 * screen. They are now one rail, in one position, on all of them.
 *
 * Selections are held in sessionStorage: they carry between pages so a zone is
 * picked once, and clear when the app is reopened so nobody inherits
 * yesterday's filter and concludes the records have vanished.
 *
 * @param {string} pageType  record type this page lists — decides what + creates
 */
function buildPageChrome_(deployUrl, action, token, zone, zoneConfig, pageType) {
  deployUrl = String(deployUrl || "").replace(/['"<>]/g, "");
  token = String(token || "").replace(/[^a-zA-Z0-9\-_.]/g, "");
  zone = String(zone || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  action = String(action || "").toLowerCase();

  /* What the + creates, per page. No menu: the page already says what you are
     looking at, so the button adding one more needs no further question.
     Analytics has no entry — nothing there is created by hand. */
  var CREATE = {
    audits:     { action: "quickaudit",  label: "New audit" },
    issues:     { action: "capa",        label: "New NC" },
    tasks:      { action: "actionlist",  label: "New task" },
    walks:      { action: "gembawalk",   label: "New walk" },
    kaizenlist: { action: "kaizen",      label: "New kaizen" }
  };
  var create = CREATE[action] || null;

  /* The status filter defaulted to OPEN on every page. That is the right
     question for work you owe -- tasks and issues -- but an audit or a walk is
     finished the moment it is recorded, so on those pages the default matched
     nothing and the page looked broken: all 27 audits, all 34 NCs, all 11
     walks and 12 of 13 kaizens are not OPEN and were hidden. Only Tasks, with
     101 open rows, appeared to work. */
  var STATUS_DEFAULT = { tasks: "OPEN", issues: "OPEN" };
  var statusDefault = STATUS_DEFAULT.hasOwnProperty(action) ? STATUS_DEFAULT[action] : "";

  var zc = zoneConfig || {};
  var zoneIds = Object.keys(zc).sort();
  var zoneJson = JSON.stringify(zoneIds.map(function (z) {
    return { id: z, name: String((zc[z] || {}).name || z) };
  }));

  var caret = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  var html = '';

  /* The rail only appears on pages that list records; Analytics and the forms
     have nothing for it to filter. */
  if (CREATE[action]) {
    html += '<div class="pm5s-filters" id="pm5sFilters" role="group" aria-label="Filters">\n';
    html += '  <button type="button" class="pm5s-filter" id="fltZone" aria-haspopup="dialog">' +
            '<span id="fltZoneTxt">All zones</span>' + caret + '</button>\n';
    html += '  <button type="button" class="pm5s-filter" id="fltStatus" aria-haspopup="dialog">' +
            '<span id="fltStatusTxt">' + (statusDefault === "OPEN" ? "Open" : "All status") +
            '</span>' + caret + '</button>\n';
    html += '  <button type="button" class="pm5s-filter" id="fltPriority" aria-haspopup="dialog">' +
            '<span id="fltPriorityTxt">All priority</span>' + caret + '</button>\n';
    html += '  <button type="button" class="pm5s-filter-clear" id="fltClear" hidden>Clear</button>\n';
    html += '</div>\n';
  }

  if (create) {
    var href = deployUrl + "?v2=1&action=" + create.action +
               (token ? "&token=" + token : "") + (zone ? "&zone=" + zone : "");
    html += '<a class="pm5s-fab" href="' + href + '" aria-label="' + create.label + '" title="' + create.label + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
            'stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
            '<span class="pm5s-fab-text">' + create.label + '</span></a>\n';
  }

  if (!CREATE[action]) return html;

  /* Filter state. sessionStorage, not localStorage: filters should survive a
     hop between pages, not a return the next morning. */
  html += '<script>\n';
  html += '(function(){\n';
  html += '  var ZONES = ' + zoneJson + ';\n';
  html += '  var KEY = "pm5s_filters_v1";\n';
  html += '  var STATUS = [["","All status"],["OPEN","Open"],["IN_PROGRESS","In progress"],["CLOSED","Closed"]];\n';
  html += '  var PRIO = [["","All priority"],["CRITICAL","Critical"],["HIGH","High"],["MEDIUM","Medium"],["LOW","Low"]];\n';
  html += '  var STATUS_DEFAULT = ' + JSON.stringify(statusDefault) + ';\n';
  html += '  var f = { zone: "", status: STATUS_DEFAULT, priority: "" };\n';
  html += '  try { var raw = sessionStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o) f = o; } } catch(e){}\n';
  /* Status is per page, so it must NOT ride sessionStorage between pages the
     way zone and priority do: carrying "Open" from Tasks onto Audits would
     re-hide all 27 rows and reintroduce the bug one navigation later. Zone and
     priority still carry -- they mean the same thing everywhere. */
  html += '  f.status = STATUS_DEFAULT;\n';
  html += '  var ZONE_FROM_URL = ' + JSON.stringify(zone) + ';\n';
  /* A zone in the URL is an explicit instruction (a QR code, a shared link) and
     outranks whatever was left in the session. */
  html += '  if (ZONE_FROM_URL) f.zone = ZONE_FROM_URL;\n';
  html += '  function save(){ try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch(e){} }\n';
  html += '  function label(list, v){ for (var i=0;i<list.length;i++){ if (list[i][0]===v) return list[i][1]; } return list[0][1]; }\n';
  html += '  function zoneLabel(){ if (!f.zone) return "All zones"; for (var i=0;i<ZONES.length;i++){ if (ZONES[i].id===f.zone) return ZONES[i].id; } return f.zone; }\n';
  html += '  function paint(){\n';
  html += '    var z=document.getElementById("fltZone"), st=document.getElementById("fltStatus"), pr=document.getElementById("fltPriority");\n';
  html += '    if(!z) return;\n';
  html += '    document.getElementById("fltZoneTxt").textContent = zoneLabel();\n';
  html += '    document.getElementById("fltStatusTxt").textContent = label(STATUS, f.status);\n';
  html += '    document.getElementById("fltPriorityTxt").textContent = label(PRIO, f.priority);\n';
  /* Only non-defaults are marked, so the dot means "you changed this". */
  html += '    z.classList.toggle("on", !!f.zone);\n';
  html += '    st.classList.toggle("on", f.status !== STATUS_DEFAULT);\n';
  html += '    pr.classList.toggle("on", !!f.priority);\n';
  html += '    var n = (f.zone?1:0) + (f.status!==STATUS_DEFAULT?1:0) + (f.priority?1:0);\n';
  html += '    var c = document.getElementById("fltClear");\n';
  html += '    c.hidden = (n === 0); c.textContent = "Clear (" + n + ")";\n';
  html += '    apply();\n';
  html += '  }\n';
  /* The host page owns its list; the rail just announces the change. */
  html += '  function apply(){\n';
  html += '    try { window.PM5S_FILTERS = f; } catch(e){}\n';
  html += '    try { window.dispatchEvent(new CustomEvent("pm5s:filters", { detail: f })); } catch(e){}\n';
  html += '  }\n';
  html += '  function pick(title, opts, cur, cb){\n';
  html += '    var host=document.createElement("div"); host.className="pm5s-zp-host";\n';
  html += '    var scrim=document.createElement("div"); scrim.className="pm5s-zp-scrim";\n';
  html += '    var card=document.createElement("div"); card.className="pm5s-zp"; card.setAttribute("role","dialog");\n';
  html += '    var h=document.createElement("h4"); h.textContent=title; card.appendChild(h);\n';
  html += '    var grid=document.createElement("div"); grid.className="pm5s-zp-grid"; card.appendChild(grid);\n';
  html += '    opts.forEach(function(o){\n';
  html += '      var b=document.createElement("button"); b.type="button";\n';
  html += '      b.className="pm5s-zp-z"+(o[0]===cur?" on":"");\n';
  html += '      b.innerHTML="<b></b><span></span>";\n';
  html += '      b.querySelector("b").textContent=o[1];\n';
  html += '      if(o[2]) b.querySelector("span").textContent=o[2];\n';
  html += '      b.onclick=function(){ cb(o[0]); document.body.removeChild(host); };\n';
  html += '      grid.appendChild(b);\n';
  html += '    });\n';
  html += '    scrim.onclick=function(){ document.body.removeChild(host); };\n';
  html += '    host.appendChild(scrim); host.appendChild(card); document.body.appendChild(host);\n';
  html += '  }\n';
  html += '  document.getElementById("fltZone").onclick=function(){\n';
  html += '    var o=[["","All zones",""]].concat(ZONES.map(function(z){return [z.id,z.id,z.name];}));\n';
  html += '    pick("Zone", o, f.zone, function(v){ f.zone=v; save(); paint(); });\n';
  html += '  };\n';
  html += '  document.getElementById("fltStatus").onclick=function(){\n';
  html += '    pick("Status", STATUS.map(function(x){return [x[0],x[1],""];}), f.status, function(v){ f.status=v; save(); paint(); });\n';
  html += '  };\n';
  html += '  document.getElementById("fltPriority").onclick=function(){\n';
  html += '    pick("Priority", PRIO.map(function(x){return [x[0],x[1],""];}), f.priority, function(v){ f.priority=v; save(); paint(); });\n';
  html += '  };\n';
  html += '  document.getElementById("fltClear").onclick=function(){ f={zone:"",status:"OPEN",priority:""}; save(); paint(); };\n';
  html += '  paint();\n';
  html += '})();\n';
  html += '<\/script>\n';

  return html;
}

function buildBottomNav_(deployUrl, action, token, zone) {
  // Sanitize inputs
  deployUrl = String(deployUrl || "").replace(/['"<>]/g, "");
  zone = String(zone || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  token = String(token || "").replace(/[^a-zA-Z0-9\-_.]/g, "");
  action = String(action || "").toLowerCase();

  var zoneParam = zone ? "&zone=" + zone : "";
  var tokenParam = token ? "&token=" + token : "";

  /* Inline SVG at 24x24, stroke 1.75. Emoji rendered as a different glyph on
     every Android skin and Windows build, so the bar looked like a different
     product per device. */
  var ICONS = {
    insights: '<path d="M3 3v18h18"/><path d="m7 15 3.5-3.5 3 3L21 7"/>',
    audits: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m8.5 14.5 2 2 4-4"/>',
    issues: '<path d="M12 9v4.5"/><circle cx="12" cy="17" r="1"/><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    kaizen: '<path d="M9 18h6"/><path d="M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7h6c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5Z"/>',
    tasks: '<path d="M9 5h10M9 12h10M9 19h10"/><path d="m3.5 5 1.2 1.2L7 4M3.5 12l1.2 1.2L7 11M3.5 19l1.2 1.2L7 18"/>',
    walks: '<path d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.75"/>'
  };

  function svg(key) {
    return '<span class="bn-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[key] || '') + '</svg></span>';
  }

  /* Six record destinations, each its own page. Analytics leads because it is
     the landing page and the fast one (~423ms against ~11,975ms for the old
     home). NC and Red Tag share "Issues" and split with a segmented control
     inside — one tab, two lists.
     [action, iconKey, label] */
  var tabs = [
    ["insights",   "insights", "Analytics"],
    ["audits",     "audits",   "Audits"],
    ["issues",     "issues",   "Issues"],
    ["kaizenboard","kaizen",   "Kaizen"],
    ["tasks",      "tasks",    "Tasks"],
    ["walks",      "walks",    "Walks"]
  ];

  /* Many routes render one of these six under a different action name; without
     aliasing, those pages lit no tab at all and the user lost their place. */
  var ALIAS = {
    home: "insights", sqcdp: "insights", charts: "insights", analytics: "insights",
    sqcdpboard: "insights",
    quickaudit: "audits", audithistory: "audits",
    actionlist: "issues", kanban: "issues", redtag: "issues",
    redtagboard: "issues", raiseredtag: "issues", capa: "issues",
    kaizen: "kaizenboard", kaizenlist: "kaizenboard",
    taskboard: "tasks",
    gembawalk: "walks", gembaboard: "walks"
  };
  var activeAction = ALIAS[action] || action;

  var html = '<nav class="bottom-nav" id="pm5sNav" role="navigation" aria-label="Main">\n';
  html += '  <div class="bottom-nav-inner">\n';

  for (var i = 0; i < tabs.length; i++) {
    var tabAction = tabs[i][0], iconKey = tabs[i][1], label = tabs[i][2];
    var isActive = (tabAction === activeAction);
    var href = deployUrl + "?v2=1&action=" + tabAction + tokenParam + zoneParam;

    /* aria-label carries the name permanently: the visible label collapses
       after 3s, and a screen reader must never depend on a timer. */
    html += '    <a href="' + href + '" class="bn-item' + (isActive ? ' active' : '') + '"' +
            ' aria-label="' + label + '"' + (isActive ? ' aria-current="page"' : '') + '>\n';
    html += '      ' + svg(iconKey) + '\n';
    html += '      <span class="bn-lbl">' + label + '</span>\n';
    html += '    </a>\n';
  }

  html += '  </div>\n';
  html += '</nav>\n';

  /* Labels show on arrival, then collapse — they orient you on landing and get
     out of the way afterwards, returning on tap, hover or keyboard focus.
     prefers-reduced-motion keeps them permanently: a timed disappearance is
     precisely what that preference exists to prevent. */
  html += '<script>\n';
  html += '(function(){\n';
  html += '  var nav = document.getElementById("pm5sNav");\n';
  html += '  if (!nav) return;\n';
  html += '  var reduce = false;\n';
  html += '  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e){}\n';
  html += '  if (reduce) { nav.classList.add("labels-locked"); return; }\n';
  html += '  var t = null;\n';
  html += '  function collapse(){ nav.classList.add("compact"); }\n';
  html += '  function expand(hold){\n';
  html += '    nav.classList.remove("compact");\n';
  html += '    if (t) clearTimeout(t);\n';
  html += '    t = setTimeout(collapse, hold || 3000);\n';
  html += '  }\n';
  html += '  expand(3000);\n';
  html += '  nav.addEventListener("pointerenter", function(){ if (t) clearTimeout(t); nav.classList.remove("compact"); });\n';
  html += '  nav.addEventListener("pointerleave", function(){ expand(1200); });\n';
  html += '  nav.addEventListener("focusin", function(){ if (t) clearTimeout(t); nav.classList.remove("compact"); });\n';
  html += '  nav.addEventListener("focusout", function(){ expand(1200); });\n';
  html += '  nav.addEventListener("touchstart", function(){ expand(2500); }, {passive:true});\n';
  html += '})();\n';
  html += '<\/script>\n';
  return html;
}
function buildSidebar_(deployUrl, action, token, zone, zoneConfig) {
  // Sanitize inputs
  deployUrl = String(deployUrl || "").replace(/['"<>]/g, "");
  zone = String(zone || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  token = String(token || "").replace(/[^a-zA-Z0-9\-_.]/g, "");
  action = String(action || "").toLowerCase();

  var zoneParam = zone ? "&zone=" + zone : "";
  var tokenParam = token ? "&token=" + token : "";

  /* The 52px rail is retired — the bottom bar navigates on every screen size
     now. What must survive is the WORKING ZONE control: audits, kaizen and new
     records all key off it, and it was only ever in the rail. It becomes a chip
     in a slim top bar, so it stays visible without costing a nav column.
     The picker dialog below is unchanged; only its container moved. */
  var html = '<div class="pm5s-topbar">\n';
  html += '  <span class="pm5s-topbar-brand">PackMasters <b>5S</b></span>\n';

  /* Zone selector, above Home.
     This was a static span that printed "Z-01" whether or not a zone had been
     chosen -- it looked like a selection but was a hardcoded default, and the
     zone picked on the landing page was invisible and unchangeable from here.
     A real select keeps the working zone visible on every page and switchable
     in one action, which is what audits, kaizen and new records all key off. */
  var zc = zoneConfig || {};
  var zoneIds = Object.keys(zc).sort();
  var current = zone || "";

  /* A <select> inside the 52px rail was the wrong control: .sidebar sets
     overflow:hidden and appearance:none left no arrow, so it read as a
     static badge and its option list was cramped. A button that opens a
     full picker is unambiguous and cannot be clipped by the rail. */
  html += '  <button type="button" class="pm5s-zone-chip" id="pm5s-zone-btn" title="Change working zone" aria-haspopup="dialog">\n';
  html += '    <span class="zb-cap">Zone</span>\n';
  html += '    <span id="pm5s-zone-label">' + (current || 'Select') + '</span>\n';
  html += '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>\n';
  html += '  </button>\n';

  /* No menu items here any more: duplicating the five destinations in a second
     nav meant every change had to be made twice and they drifted apart. */
  html += '</div>\n';

  // Sidebar state management script
  html += '<script>\n';
  html += '(function() {\n';
  var zoneJson = JSON.stringify(zoneIds.map(function (z) {
    return { id: z, name: String((zc[z] || {}).name || z) };
  }));
  html += '  var PM5S_ZONES = ' + zoneJson + ';\n';
  html += '  var zoneBtn = document.getElementById("pm5s-zone-btn");\n';
  html += '  if (zoneBtn) {\n';
  html += '    var lbl = document.getElementById("pm5s-zone-label");\n';
  /* Placeholder-aware. The chip shows "Select" when no zone is set (it showed
     "--" before), and this guard still tested that one literal — so a saved
     zone was never restored and every page reverted to Select. */
  html += '    var PLACEHOLDERS = { "--": 1, "Select": 1, "": 1 };\n';
  html += '    if (lbl && PLACEHOLDERS[String(lbl.textContent).trim()]) {\n';
  html += '      try {\n';
  html += '        var rem = localStorage.getItem("pm5s_zone");\n';
  html += '        if (rem) lbl.textContent = rem;\n';
  html += '      } catch (e) {}\n';
  html += '    }\n';
  html += '    zoneBtn.addEventListener("click", function () {\n';
  html += '      if (document.getElementById("pm5s-zone-pop")) return;\n';
  html += '      var cur = lbl ? lbl.textContent.trim() : "";\n';
  html += '      var host = document.createElement("div");\n';
  html += '      host.id = "pm5s-zone-pop";\n';
  html += '      var scrim = document.createElement("div");\n';
  html += '      scrim.className = "pm5s-zp-scrim";\n';
  html += '      var card = document.createElement("div");\n';
  html += '      card.className = "pm5s-zp";\n';
  html += '      card.setAttribute("role", "dialog");\n';
  html += '      var h4 = document.createElement("h4");\n';
  html += '      h4.textContent = "Working zone";\n';
  html += '      var pEl = document.createElement("p");\n';
  html += '      pEl.textContent = "Audits, kaizen and new records use this zone.";\n';
  html += '      var grid = document.createElement("div");\n';
  html += '      grid.className = "pm5s-zp-grid";\n';
  html += '      card.appendChild(h4); card.appendChild(pEl); card.appendChild(grid);\n';
  html += '      host.appendChild(scrim); host.appendChild(card);\n';
  html += '      PM5S_ZONES.forEach(function (z) {\n';
  html += '        var b = document.createElement("button");\n';
  html += '        b.type = "button";\n';
  html += '        b.className = "pm5s-zp-z" + (z.id === cur ? " on" : "");\n';
  html += '        b.innerHTML = "<b></b><span></span>";\n';
  html += '        b.querySelector("b").textContent = z.id;\n';
  html += '        b.querySelector("span").textContent = z.name;\n';
  html += '        b.addEventListener("click", function () {\n';
  html += '          try { localStorage.setItem("pm5s_zone", z.id); } catch (e) {}\n';
  html += '          var dest = "' + deployUrl + '?v2=1&action=' + (action || 'home') + tokenParam + '&zone=" + encodeURIComponent(z.id);\n';
  html += '          try { window.top.location.href = dest; }\n';
  html += '          catch (e) { window.location.href = dest; }\n';
  html += '        });\n';
  html += '        grid.appendChild(b);\n';
  html += '      });\n';
  html += '      scrim.addEventListener("click", function () { host.remove(); });\n';
  html += '      document.body.appendChild(host);\n';
  html += '    });\n';
  html += '  }\n';
  html += '  var sidebar = document.getElementById("pm5s-sidebar");\n';
  html += '  if (!sidebar) return;\n';
  html += '  var saved = localStorage.getItem("pm5s_sidebar_state");\n';
  html += '  var state = { collapsed: true };\n';
  html += '  try { state = saved ? JSON.parse(saved) : state; } catch(e) {}\n';
  html += '  if (!state.collapsed) { sidebar.classList.add("expanded"); }\n';
  html += '  sidebar.addEventListener("mouseenter", function() {\n';
  html += '    sidebar.classList.add("expanded");\n';
  html += '    localStorage.setItem("pm5s_sidebar_state", JSON.stringify({ collapsed: false }));\n';
  html += '  });\n';
  html += '  sidebar.addEventListener("mouseleave", function() {\n';
  html += '    sidebar.classList.remove("expanded");\n';
  html += '    localStorage.setItem("pm5s_sidebar_state", JSON.stringify({ collapsed: true }));\n';
  html += '  });\n';
  html += '})();\n';
  html += '</script>\n';

  return html;
}


// ============================================================================
// HOME DASHBOARD — DATA AGGREGATION
// ============================================================================

/**
 * Aggregates home dashboard data for a given zone and token.
 * Returns score, 4 stat chips, and personal task queue.
 * @param {string} token - session token
 * @param {string} zone - zone ID (e.g. 'Z-01')
 * @returns {{score:number|null, scoreColor:string, tasks:Array, stats:{openCAPAs:number, redTags:number, kaizens:number, auditStreak:number}}}
 */
function getHomeData_(token, zone) {
  var defaultResult = { score: null, scoreColor: 'a', tasks: [], stats: { openCAPAs: 0, redTags: 0, kaizens: 0, auditStreak: 0 } };
  try {
    // 5-min cache per zone
    var cacheKey = 'home_data_' + (zone || 'Z-01');
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch(e) {}

    var ss = v2GetSpreadsheet_();
    zone = zone || 'Z-01';

    // ── Zone 5S score ──
    var score = null;
    var scoreColor = 'a';
    try {
      var boardData = getSQCDPBoardData();
      if (boardData && boardData.zones) {
        for (var i = 0; i < boardData.zones.length; i++) {
          if (boardData.zones[i].zoneId === zone) {
            var zd = boardData.zones[i];
            score = (zd.pctScore !== undefined && zd.pctScore !== null) ? zd.pctScore
                  : (zd.latestScore !== undefined && zd.latestScore !== null) ? zd.latestScore
                  : null;
            break;
          }
        }
      }
    } catch(e) { Logger.log('getHomeData_ score error: ' + e.message); }
    if (score !== null) {
      scoreColor = score >= 80 ? 'g' : score >= 60 ? 'a' : 'r';
    }

    // ── Open CAPAs count ──
    var openCAPAs = 0;
    try {
      var capaData = v2LoadSheet_(ss, 'NC_CAPA');
      for (var r = 1; r < capaData.length; r++) {
        var capaZone = String(capaData[r][NC_COL.ZONE_ID] || '').trim();
        var capaStatus = String(capaData[r][NC_COL.STATUS] || '').trim().toUpperCase();
        if (capaZone === zone && capaStatus !== STATUS.CLOSED && capaStatus !== STATUS.DELETED) {
          openCAPAs++;
        }
      }
    } catch(e) { Logger.log('getHomeData_ capa error: ' + e.message); }

    // ── Red Tags count (sheet: RedTagRegister, constants: RT_COL) ──
    var redTags = 0;
    try {
      var rtData = v2LoadSheet_(ss, 'RedTagRegister');
      for (var r = 1; r < rtData.length; r++) {
        var rtZone = String(rtData[r][RT_COL.ZONE_ID] || '').trim();
        var rtStatus = String(rtData[r][RT_COL.STATUS] || '').trim().toUpperCase();
        if (rtZone === zone && rtStatus !== STATUS.DISPOSED && rtStatus !== STATUS.CLOSED && rtStatus !== STATUS.DELETED) {
          redTags++;
        }
      }
    } catch(e) { Logger.log('getHomeData_ redtag error: ' + e.message); }

    // ── Kaizens count (sheet: KaizenSuggestions, constants: KZ_COL) ──
    var kaizens = 0;
    try {
      var kzData = v2LoadSheet_(ss, 'KaizenSuggestions');
      for (var r = 1; r < kzData.length; r++) {
        var kzZone = String(kzData[r][KZ_COL.ZONE_ID] || '').trim();
        var kzStatus = String(kzData[r][KZ_COL.STATUS] || '').trim().toUpperCase();
        if (kzZone === zone && kzStatus !== STATUS.CLOSED && kzStatus !== STATUS.DELETED) {
          kaizens++;
        }
      }
    } catch(e) { Logger.log('getHomeData_ kaizen error: ' + e.message); }

    // ── Audit streak (consecutive days with DailySubmissions for this zone) ──
    var auditStreak = 0;
    try {
      var dsData = v2LoadSheet_(ss, 'DailySubmissions');
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var auditDates = {};
      for (var r = 1; r < dsData.length; r++) {
        var dsZone = String(dsData[r][DS_COL.ZONE_ID] || '').trim();
        var dsDate = dsData[r][DS_COL.SUBMISSION_DATE];
        if (dsZone === zone && dsDate instanceof Date) {
          var d = new Date(dsDate);
          d.setHours(0, 0, 0, 0);
          auditDates[d.getTime()] = true;
        }
      }
      for (var dayOffset = 0; dayOffset < 365; dayOffset++) {
        var checkDay = new Date(today.getTime() - dayOffset * 86400000);
        if (auditDates[checkDay.getTime()]) {
          auditStreak++;
        } else {
          break;
        }
      }
    } catch(e) { Logger.log('getHomeData_ streak error: ' + e.message); }

    // ── Personal task queue (sheet: TaskBoard, constants: TASK_COL, up to 5 items) ──
    var tasks = [];
    try {
      var taskData = v2LoadSheet_(ss, 'TaskBoard');
      var now = new Date();
      var sevenDaysOut = new Date(now.getTime() + 7 * 86400000);
      var todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
      for (var r = 1; r < taskData.length; r++) {
        var tZone = String(taskData[r][TASK_COL.ZONE_ID] || '').trim();
        var tStatus = String(taskData[r][TASK_COL.STATUS] || '').trim().toUpperCase();
        if (tZone !== zone) continue;
        if (tStatus === STATUS.CLOSED || tStatus === STATUS.DELETED || tStatus === STATUS.COMPLETED || tStatus === STATUS.DONE) continue;
        var tDue = taskData[r][TASK_COL.DUE_DATE];
        if (!(tDue instanceof Date)) continue;
        if (tDue > sevenDaysOut) continue;
        var urgency = tDue < now ? 'overdue' : (Utilities.formatDate(tDue, TZ, 'yyyy-MM-dd') === todayStr ? 'today' : 'upcoming');
        tasks.push({
          id: String(taskData[r][TASK_COL.TASK_ID] || r),
          title: String(taskData[r][TASK_COL.TITLE] || 'Task'),
          zone: tZone,
          dueDate: Utilities.formatDate(tDue, TZ, 'dd MMM'),
          status: tStatus,
          urgency: urgency
        });
      }
      // Sort: overdue first, then today, then upcoming
      var urgencyOrder = { overdue: 0, today: 1, upcoming: 2 };
      tasks.sort(function(a, b) { return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]; });
      tasks = tasks.slice(0, 5);
    } catch(e) { Logger.log('getHomeData_ tasks error: ' + e.message); }

    var result = {
      score: score !== null ? Math.round(score) : null,
      scoreColor: scoreColor,
      tasks: tasks,
      stats: { openCAPAs: openCAPAs, redTags: redTags, kaizens: kaizens, auditStreak: auditStreak }
    };

    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300);
    } catch(e) {}
    return result;
  } catch(e) {
    Logger.log('getHomeData_ fatal error: ' + e.message);
    return defaultResult;
  }
}


// ============================================================================
// MASTER SETTINGS — SERVER-SIDE FUNCTIONS
// ============================================================================

/**
 * Returns all editable settings data for the Master Settings page.
 * Callable via google.script.run.getMasterSettingsData()
 * @returns {{success:boolean, zones:Array, zoneIds:Array, schema:Object, system:Object}}
 */
function getMasterSettingsData() {
  try {
    var zoneConfig = getZoneConfig();
    var schema     = getChecklistSchema();
    var props      = PropertiesService.getScriptProperties();

    var zoneIds = Object.keys(zoneConfig).sort();
    var zonesArr = zoneIds.map(function(id) {
      var z = zoneConfig[id];
      return {
        id:           id,
        name:         z.name          || "",
        nameHi:       z.nameHi        || "",
        leader:       z.leader        || "",
        email:        z.email         || "",
        auditDay:     z.auditDay      || "Monday",
        auditDayNum:  z.auditDayNum   !== undefined ? z.auditDayNum : 1,
        department:   z.department    || "",
        driveFolderId:z.driveFolderId || "",
        targetScore:  z.targetScore   !== undefined ? z.targetScore : 70,
        criteria:     (z.criteria && z.criteria.length) ? z.criteria : []
      };
    });

    return {
      success:  true,
      zones:    zonesArr,
      zoneIds:  zoneIds,
      schema: {
        criteria:    schema.criteria    || [],
        ncThreshold: schema.ncThreshold !== undefined ? schema.ncThreshold : 1
      },
      system: {
        companyName:  props.getProperty("COMPANY_NAME")  || "PackMasters",
        mcEmail:      props.getProperty("MC_EMAIL")       || "",
        topEmail:     props.getProperty("TOP_EMAIL")      || "",
        // Default ON so existing behaviour is unchanged until switched off.
        digestEnabled: props.getProperty("DIGEST_ENABLED") !== "false",
        ncThreshold:  schema.ncThreshold !== undefined ? schema.ncThreshold : 1,
        deployId:     props.getProperty("DEPLOY_ID")      || ""
      }
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Saves Master Settings: zones, 5S criteria, and system config.
 * Callable via google.script.run.saveMasterSettings(data)
 * @param {{zones:Array, criteria:Array, system:Object}} data
 * @returns {{success:boolean, message:string}}
 */
function saveMasterSettings(data) {
  try {
    var props = PropertiesService.getScriptProperties();
    var ss    = v2GetSpreadsheet_();

    // 1. System props
    if (data.system) {
      var sys = data.system;
      if (sys.companyName !== undefined) props.setProperty("COMPANY_NAME", String(sys.companyName));
      if (sys.mcEmail     !== undefined) props.setProperty("MC_EMAIL",     String(sys.mcEmail));
      if (sys.topEmail    !== undefined) props.setProperty("TOP_EMAIL",    String(sys.topEmail));
      if (sys.digestEnabled !== undefined) {
        props.setProperty("DIGEST_ENABLED", sys.digestEnabled ? "true" : "false");
      }
      if (sys.deployId    && String(sys.deployId).trim() !== "") {
        props.setProperty("DEPLOY_ID", String(sys.deployId).trim());
      }
    }

    // 2. Zones sheet — 10 columns
    if (data.zones && data.zones.length > 0) {
      var zonesSheet = ss.getSheetByName("Zones");
      if (zonesSheet) {
        if (zonesSheet.getLastRow() > 1) {
          zonesSheet.getRange(2, 1, zonesSheet.getLastRow() - 1, 10).clearContent();
        }
        var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        var zoneRows = data.zones.map(function(z) {
          var dayNum = parseInt(z.auditDayNum, 10);
          if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
            dayNum = dayNames.indexOf(z.auditDay);
            if (dayNum < 0) dayNum = 1;
          }
          return [
            z.id           || "",
            z.name         || "",
            z.nameHi       || "",
            z.leader       || "",
            z.email        || "",
            z.auditDay     || "Monday",
            dayNum,
            z.department   || "",
            z.driveFolderId|| "",
            parseFloat(z.targetScore) || 70
          ];
        });
        zonesSheet.getRange(2, 1, zoneRows.length, 10).setValues(zoneRows);
      }
    }

    // 2b. Per-zone criteria → update ZONE_CONFIG in ScriptProperties
    if (data.zones && data.zones.length > 0) {
      var zoneConfigForCrit = getZoneConfig();
      var criteriaChanged = false;
      data.zones.forEach(function(z) {
        if (z.id && zoneConfigForCrit[z.id] && z.criteria) {
          zoneConfigForCrit[z.id].criteria = z.criteria;
          criteriaChanged = true;
        }
      });
      if (criteriaChanged) {
        props.setProperty("ZONE_CONFIG", JSON.stringify(zoneConfigForCrit));
      }
    }

    // 3. ChecklistSchema sheet — 5 columns
    if (data.criteria && data.criteria.length > 0) {
      var schemaSheet = ss.getSheetByName("ChecklistSchema");
      if (schemaSheet) {
        if (schemaSheet.getLastRow() > 1) {
          schemaSheet.getRange(2, 1, schemaSheet.getLastRow() - 1, 5).clearContent();
        }
        var criteriaRows = data.criteria.map(function(c) {
          return [
            c.id      || "",
            c.pillar  || "",
            c.labelEn || "",
            c.labelHi || "",
            parseInt(c.maxScore, 10) || 4
          ];
        });
        schemaSheet.getRange(2, 1, criteriaRows.length, 5).setValues(criteriaRows);
      }
    }

    // 4. Refresh — re-reads sheets → updates ScriptProperties
    refreshConfig();
    if (typeof refreshEnhancedConfig_ === "function") refreshEnhancedConfig_();

    // 5. Apply ncThreshold override (refreshConfig resets it to sheet value)
    if (data.system && data.system.ncThreshold !== undefined) {
      var freshSchema = getChecklistSchema();
      freshSchema.ncThreshold = parseInt(data.system.ncThreshold, 10);
      if (isNaN(freshSchema.ncThreshold)) freshSchema.ncThreshold = 1;
      props.setProperty("CHECKLIST_SCHEMA", JSON.stringify(freshSchema));
    }

    logAdminAction_("masterSettings", "Master Settings saved via Settings page.");
    return { success: true, message: "Settings saved successfully!" };
  } catch (e) {
    Logger.log("saveMasterSettings error: " + e.message);
    return { success: false, message: e.message };
  }
}


// ============================================================================
// ISO COMPLIANCE — Plan E: Management Review Data & Audit Trail Wrappers
// ============================================================================

/**
 * Aggregates ISO KPIs for the Management Review Dashboard.
 * Called from ManagementReview.html via google.script.run.
 *
 * @param {string} [zoneId] — Filter by zone (pass "" or omit for plant-wide)
 * @returns {Object} {
 *   totalOpenNCs, overdueCount,
 *   auditComplianceRate, rcaCompletionRate,
 *   recentAuditTrail
 * }
 */
function getManagementReviewData(zoneId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var now = new Date();

    // ── 1. Open NCs & overdue CAPAs ──────────────────────────────────────
    var capaData = v2LoadSheet_(ss, "NC_CAPA");
    var totalOpenNCs = 0;
    var overdueCount = 0;
    var inProgressWithRCA = 0;
    var inProgressTotal = 0;

    for (var r = 1; r < capaData.length; r++) {
      var row = capaData[r];
      var rowZone   = String(row[NC_COL.ZONE_ID] || "").trim();
      var status    = String(row[NC_COL.STATUS]  || "").trim().toUpperCase();
      var rootCause = String(row[NC_COL.ROOT_CAUSE] || "").trim();

      // Zone filter
      if (zoneId && rowZone !== zoneId) continue;

      if (status === "OPEN" || status === "IN_PROGRESS" || status === "OVERDUE" || status === "REPEAT_NC") {
        totalOpenNCs++;
      }
      if (status === "OVERDUE") {
        overdueCount++;
      } else if (status === "OPEN" || status === "IN_PROGRESS") {
        // Also count as overdue if past target date
        var targetDateVal = row[NC_COL.TARGET_DATE];
        var targetDate = targetDateVal instanceof Date ? targetDateVal : new Date(String(targetDateVal || ""));
        if (!isNaN(targetDate.getTime()) && now > targetDate) overdueCount++;
      }

      if (status === "IN_PROGRESS") {
        inProgressTotal++;
        if (rootCause.length >= 50) inProgressWithRCA++;
      }
    }

    // ── 2. Audit Compliance Rate (last 30 days) ───────────────────────────
    // % of days in last 30 that had at least one audit submission
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    var activeDays = {};

    for (var d = 1; d < dailyData.length; d++) {
      var dRow = dailyData[d];
      var dZone = String(dRow[DS_COL.ZONE_ID] || "").trim();
      if (zoneId && dZone !== zoneId) continue;
      var isDup = dRow[DS_COL.IS_DUPLICATE];
      if (isDup === true || String(isDup).toLowerCase() === "true") continue;
      var ts = dRow[DS_COL.TIMESTAMP];
      var dt = ts instanceof Date ? ts : new Date(String(ts || ""));
      if (!isNaN(dt.getTime()) && dt >= thirtyDaysAgo) {
        var dayKey = Utilities.formatDate(dt, TZ, "yyyy-MM-dd");
        activeDays[dayKey] = true;
      }
    }
    var activeDayCount = Object.keys(activeDays).length;
    var auditComplianceRate = activeDayCount > 0 ? Math.round((activeDayCount / 30) * 100) : 0;

    // ── 3. RCA Completion Rate ────────────────────────────────────────────
    var rcaCompletionRate = inProgressTotal > 0
      ? Math.round((inProgressWithRCA / inProgressTotal) * 100)
      : 100; // No IN_PROGRESS NCs → 100% compliant

    // ── 4. Recent Audit Trail (last 20 entries) ───────────────────────────
    var recentAuditTrail = [];
    if (typeof v2GetAuditHistory_ === "function") {
      recentAuditTrail = v2GetAuditHistory_("", "", 20);
    }

    return {
      totalOpenNCs:       totalOpenNCs,
      overdueCount:       overdueCount,
      auditComplianceRate: auditComplianceRate,
      rcaCompletionRate:  rcaCompletionRate,
      recentAuditTrail:   recentAuditTrail
    };
  }, "getManagementReviewData", {
    totalOpenNCs: 0, overdueCount: 0,
    auditComplianceRate: 0, rcaCompletionRate: 0,
    recentAuditTrail: []
  });
}

/**
 * Public wrapper: returns audit trail entries for a specific record.
 * Called from any HTML page via google.script.run.getAuditTrailForRecord().
 *
 * @param {string} targetType — "NC_CAPA" | "TaskBoard" | "" (all)
 * @param {string} targetId   — Record ID or "" (all)
 * @param {number} [limit]    — Max rows to return (default 50)
 * @returns {Object[]} Audit trail entries
 */
function getAuditTrailForRecord(targetType, targetId, limit) {
  return v2SafeExecute_(function() {
    if (typeof v2GetAuditHistory_ === "function") {
      return v2GetAuditHistory_(targetType || "", targetId || "", limit || 50);
    }
    return [];
  }, "getAuditTrailForRecord", []);
}
