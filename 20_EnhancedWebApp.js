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
      case "taskboard":
      case "redtag":
      case "redtagboard":
      case "kaizen":
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
    case "handover":     return serveV2Page_("ShiftHandover", params);
    case "tierdash":     return serveV2Page_("TierDashboard_Full", params);
    case "mrmpack":      return serveV2Page_("MRMReportPack_Full", params);
    case "opl":          return serveV2Page_("OPLViewer", params);
    case "riskregister": return serveV2Page_("TierDashboard_Full", params);
    // ── Zone-level tools ─────────────────────────────────────────────────
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
      loginTemplate.deployUrl = (function() { try { return ScriptApp.getService().getUrl(); } catch(e) { return "#"; } })();
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
    var template = HtmlService.createTemplateFromFile(templateFile);
    template.params = params || {};

    // Inject config
    var props = PropertiesService.getScriptProperties();
    var deployId = props.getProperty("DEPLOY_ID") || "";
    // Always prefer the live deployment URL; fall back to stored DEPLOY_ID only if unavailable
    var deployUrl = (function() {
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

    // RecordView is a standalone, unauthenticated single-record page opened
    // from Telegram links — it has no session/zone context to navigate with,
    // and doesn't include CommonStyles, so the app chrome would render as
    // unstyled raw links. Skip nav injection for it entirely.
    var noChrome = (templateFile === "RecordView");
    var finalContent = output.getContent();
    if (!noChrome) {
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
      finalContent = finalContent.replace('</body>', sidebarHtml + bottomNavHtml + '\n</body>');
    }
    return HtmlService.createHtmlOutput(finalContent)
      .setTitle("PackMasters 5S — " + templateFile)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (e) {
    Logger.log("Error serving v2 page " + templateFile + ": " + e.message);
    return serveErrorPage_("Page Error", "Could not load " + templateFile + ": " + e.message);
  }
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

function testWebhook_() {
  sendWebhookNotification("🧪 PackMasters 5S webhook test — " + new Date().toLocaleString());
  v2GetSpreadsheet_().toast("Webhook test sent!", "Webhook", 3);
}

function openDataImport_() {
  var html = HtmlService.createHtmlOutputFromFile("DataImport")
    .setWidth(700).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, "📥 Data Import");
}

function openSetupWizard_() {
  var html = HtmlService.createHtmlOutputFromFile("SetupWizard")
    .setWidth(800).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "🧙 Setup Wizard");
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

/**
 * Applies setup wizard configuration.
 */
function applySetupWizardConfig(wizConfig) {
  try {
    var props = PropertiesService.getScriptProperties();

    if (wizConfig.companyName) props.setProperty("COMPANY_NAME", wizConfig.companyName);
    if (wizConfig.logoUrl) props.setProperty("LOGO_URL", wizConfig.logoUrl);
    if (wizConfig.mcEmail) props.setProperty("MC_EMAIL", wizConfig.mcEmail);
    if (wizConfig.topEmail) props.setProperty("TOP_EMAIL", wizConfig.topEmail);

    // Update zone config if provided
    if (wizConfig.zones && wizConfig.zones.length > 0) {
      var ss = v2GetSpreadsheet_();
      var zonesSheet = ss.getSheetByName("Zones");
      if (zonesSheet) {
        // Clear existing data (keep headers)
        if (zonesSheet.getLastRow() > 1) {
          zonesSheet.getRange(2, 1, zonesSheet.getLastRow() - 1, zonesSheet.getLastColumn()).clearContent();
        }
        // Write new zone data
        var zoneRows = wizConfig.zones.map(function(z) {
          return [z.id, z.name, z.nameHi || "", z.leader, z.email || "",
                  z.auditDay || "Monday", z.auditDayNum || 1, z.driveFolderId || ""];
        });
        if (zoneRows.length > 0) {
          zonesSheet.getRange(2, 1, zoneRows.length, zoneRows[0].length).setValues(zoneRows);
        }
      }
    }

    // Refresh all configs
    refreshConfig();
    if (typeof refreshEnhancedConfig_ === "function") refreshEnhancedConfig_();

    logAdminAction_("setupWizard", "Configuration applied via Setup Wizard.");
    return { success: true, message: "Configuration applied successfully!" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

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
function buildBottomNav_(deployUrl, action, token, zone) {
  // Sanitize inputs
  deployUrl = String(deployUrl || "").replace(/['"<>]/g, "");
  zone = String(zone || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  token = String(token || "").replace(/[^a-zA-Z0-9\-_.]/g, "");
  action = String(action || "").toLowerCase();

  // Zone parameter for all links
  var zoneParam = zone ? "&zone=" + zone : "";
  var tokenParam = token ? "&token=" + token : "";

  // Tab definitions: [action, icon, label]
  var tabs = [
    ["home", "🏠", "Home"],
    ["quickaudit", "✓", "Audit"],
    ["actionlist", "📋", "Actions"],
    ["insights", "📈", "Analytics"],
    ["more", "⋯", "More"]
  ];

  var html = '<nav class="bottom-nav">\n';

  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    var tabAction = tab[0];
    var icon = tab[1];
    var label = tab[2];
    var isActive = (tabAction === action) ? " active" : "";
    var href = deployUrl + "?v2=1&action=" + tabAction + tokenParam + zoneParam;

    html += '  <a href="' + href + '" class="bottom-nav-item' + isActive + '">\n';
    html += '    <span class="bottom-nav-icon">' + icon + '</span>\n';
    html += '    <span class="bottom-nav-label">' + label + '</span>\n';
    html += '  </a>\n';
  }

  html += '</nav>\n';
  return html;
}

/**
 * Generates desktop-only sidebar navigation (>768px)
 * Icon-only (52px width), expands to 200px on hover.
 * Saves expanded state to localStorage.
 * Includes zone switcher pill at top.
 *
 * @param {string} deployUrl — deployment URL for navigation links
 * @param {string} action — current page action (for active state)
 * @param {string} token — session token
 * @param {string} zone — current zone ID
 * @param {Object} zoneConfig — full zone configuration (used for zone switcher)
 * @returns {string} HTML sidebar + script
 */
function buildSidebar_(deployUrl, action, token, zone, zoneConfig) {
  // Sanitize inputs
  deployUrl = String(deployUrl || "").replace(/['"<>]/g, "");
  zone = String(zone || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  token = String(token || "").replace(/[^a-zA-Z0-9\-_.]/g, "");
  action = String(action || "").toLowerCase();

  var zoneParam = zone ? "&zone=" + zone : "";
  var tokenParam = token ? "&token=" + token : "";

  // Sidebar menu items: [action, icon, label]
  var items = [
    ["home", "&#x1F3E0;", "Home"],
    ["quickaudit", "&#x2713;", "Audit"],
    ["actionlist", "&#x1F4CB;", "Actions"],
    ["insights", "&#x1F4C8;", "Analytics"],
    ["kaizen", "&#x1F4A1;", "Kaizen"],
    ["gembawalk", "&#x1F441;", "Gemba"],
    ["settings", "&#x2699;", "Settings"]
  ];

  // Build sidebar HTML
  var html = '<aside class="sidebar" id="pm5s-sidebar">\n';

  // Zone switcher pill (always visible at top)
  html += '  <div class="sidebar-zone-switcher" id="pm5s-zone-switcher">\n';
  html += '    <span id="pm5s-zone-label">' + (zone || "Z-01") + '</span>\n';
  html += '  </div>\n';

  // Menu items
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var itemAction = item[0];
    var icon = item[1];
    var label = item[2];
    var isActive = (itemAction === action) ? " active" : "";
    var href = deployUrl + "?v2=1&action=" + itemAction + tokenParam + zoneParam;

    html += '  <a href="' + href + '" class="sidebar-item' + isActive + '" title="' + label + '">\n';
    html += '    <span class="sidebar-item-icon">' + icon + '</span>\n';
    html += '    <span class="sidebar-item-label">' + label + '</span>\n';
    html += '  </a>\n';
  }

  html += '</aside>\n';

  // Sidebar state management script
  html += '<script>\n';
  html += '(function() {\n';
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
