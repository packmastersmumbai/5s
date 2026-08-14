/**
 * ============================================================================
 * 04_AdminUtils.gs — PackMasters 5S Integrated System
 * Phase 1: Admin Utilities & Custom Menu
 * ============================================================================
 * 
 * Provides the admin interface via the Google Sheets custom menu.
 * All administrative actions are triggered from here.
 * 
 * Functions:
 *   onOpen()                — Simple trigger: loads custom menu
 *   createAdminMenu()       — Builds the PackMasters 5S admin menu
 *   quickSetup()            — Consolidated 4-step first-time setup
 *   runInitialSetup()       — Full first-time setup
 *   setDeploymentId()       — Prompts for and stores DEPLOY_ID
 *   sendTestEmail()         — Sends a test email to MC
 *   showSystemStatus()      — Displays current config status in sidebar
 *   runArchiveManually()    — Manual archive trigger
 *   runMonthlyRollupManually() — Manual monthly rollup trigger
 *   verifyNamedRanges()     — Checks all Named Ranges are intact
 *
 * Every menu entry is registered in createAdminMenu(); there are no manually
 * added items. A handler with no addItem() call is unreachable — four such
 * *FromMenu handlers were removed 2026-08-14.
 */

// ============================================================================
// TRIGGERS & MENU
// ============================================================================

/**
 * Simple trigger — runs automatically when the spreadsheet is opened.
 * Creates the custom admin menu in the Google Sheets toolbar.
 */
function onOpen() {
  createAdminMenu();
  // Add V2 enhancement menu if available
  if (typeof createEnhancedAdminMenu === "function") {
    try { createEnhancedAdminMenu(); } catch(e) {}
  }
}

/**
 * Creates the PackMasters 5S admin menu with all management actions.
 * Menu structure:
 *   PackMasters 5S
 *   ├── 🔧 Initial Setup (First Time)
 *   ├── ─────────────────────────
 *   ├── 🔄 Refresh Config
 *   ├── 📱 Regenerate QR Codes
 *   ├── 🖨️ Create QR Print Layout
 *   ├── ─────────────────────────
 *   ├── 🆔 Set Deployment ID
 *   ├── 📊 System Status
 *   ├── ✅ Verify Named Ranges
 *   ├── ─────────────────────────
 *   ├── 📦 Archive Old Data (Manual)
 *   ├── 📈 Run Monthly Rollup (Manual)
 *   ├── 📧 Send Test Email
 *   └── 🧪 Run All Tests
 */
function createAdminMenu() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu("📋 PackMasters Admin")
    .addItem("🔧 Initial Setup (First Time)", "quickSetup")
    .addItem("🆔 Update Deployment URL", "fixDeployId")
    .addSeparator()
    .addItem("🔄 Refresh Config", "refreshEnhancedConfig_")
    .addItem("🛡️ Add 6S Safety Criteria", "add6SSafetyCriteria")
    .addSeparator()
    .addItem("⏰ Setup Daily Trigger (7 PM)", "setupDailySummaryTrigger")
    .addItem("📊 Send Daily Summary Now", "sendDailySummaryReport")
    .addItem("📋 Generate MRM Report", "generateMRMReportPack")
    .addSeparator()
    .addItem("🤖 Telegram — Set Credentials (run once)", "setTelegramCredentials_5s")
    .addItem("🤖 Telegram — Test Message", "sendTelegramTest_5s")
    .addItem("🤖 Telegram — Enable Bot Commands", "enableTelegramBot_5s")
    .addItem("🤖 Telegram — Disable Bot Commands", "disableTelegramBot_5s")
    .addItem("🤖 Telegram — Send Digest Now", "sendTelegramDailyDigest")
    .addItem("🤖 Telegram — Remind Leaders Now", "remindZoneLeaders")
    .addSeparator()
    .addItem("♻️ Refresh Zone Criteria (from defaults)", "reseedZoneCriteria")
    .addItem("💾 Backup Now", "openManualBackupDialog")
    .addToUi();
}


// ============================================================================
// QUICK SETUP: Simple 4-Step Initialization
// ============================================================================

/**
 * ✨ RECOMMENDED: New consolidated 4-step setup.
 * Replaces all legacy setup functions.
 *
 * Step 1: Create all sheets (V1 + V2)
 * Step 2: Initialize configuration
 * Step 3: Setup user authentication (Users sheet)
 * Step 4: Create Drive folders & QR codes
 *
 * Usage: Run from Apps Script editor Extensions > Apps Script > quickSetup()
 */
function quickSetup() {
  Logger.log("\n╔═══════════════════════════════════════════════════════╗");
  Logger.log("║  📦 PACKMASTERS 5S — QUICK SETUP (4 STEPS)          ║");
  Logger.log("╚═══════════════════════════════════════════════════════╝\n");

  var steps = [];
  var errors = [];

  try {
    // ────────────────────────────────────────────────────────────────
    // STEP 1: Create All Sheets (V1 + V2)
    // ────────────────────────────────────────────────────────────────
    Logger.log("⏳ STEP 1/4: Creating sheets...");
    try {
      createAllSheets(); // Includes V1 sheets (Zones, Summary, DailySubmissions, etc.)
      if (typeof createEnhancedSheets === 'function') {
        createEnhancedSheets(); // V2 sheets (RedTagRegister, TaskBoard, etc.)
      }
      Logger.log("✅ All sheets created");
      steps.push({ step: 1, name: "Create Sheets", ok: true });
    } catch (e) {
      Logger.log("❌ Sheet creation failed: " + e.message);
      errors.push("Step 1: " + e.message);
      steps.push({ step: 1, name: "Create Sheets", ok: false, error: e.message });
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 2: Initialize Configuration & Save to Properties
    // ────────────────────────────────────────────────────────────────
    Logger.log("⏳ STEP 2/4: Initializing configuration...");
    try {
      var props = PropertiesService.getScriptProperties();
      // Initialize full config including ZONE_CONFIG
      if (typeof initScriptProperties === "function") {
        initScriptProperties();
      }
      try { props.setProperty("DEPLOY_ID", ScriptApp.getService().getUrl()); } catch(e) {}
      props.setProperty("MC_EMAIL", Session.getActiveUser().getEmail());
      props.setProperty("INIT_TIMESTAMP", new Date().toISOString());
      props.setProperty("SYSTEM_VERSION", "5S v2.0");
      Logger.log("✅ Configuration initialized");
      steps.push({ step: 2, name: "Initialize Config", ok: true });
    } catch (e) {
      Logger.log("❌ Config initialization failed: " + e.message);
      errors.push("Step 2: " + e.message);
      steps.push({ step: 2, name: "Initialize Config", ok: false, error: e.message });
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 3: Setup Users & Authentication
    // ────────────────────────────────────────────────────────────────
    Logger.log("⏳ STEP 3/4: Setting up user authentication...");
    try {
      // PIN auth (25b_PinAuth.js) owns the Users sheet. The old password-based
      // setupUsersSheet() wrote a 6-column schema that PIN login cannot read.
      var seeded = seedUsers();
      Logger.log("✅ Users sheet seeded with " + (seeded && seeded.count) + " PIN accounts");
      steps.push({ step: 3, name: "Setup Users", ok: true });
    } catch (e) {
      Logger.log("❌ User setup failed: " + e.message);
      errors.push("Step 3: " + e.message);
      steps.push({ step: 3, name: "Setup Users", ok: false, error: e.message });
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 4: Create Drive Folders & Generate QR Codes
    // ────────────────────────────────────────────────────────────────
    Logger.log("⏳ STEP 4/4: Creating Drive folders and QR codes...");
    try {
      createZoneDriveFolders_();
      if (typeof generateAllQRCodes === 'function') {
        generateAllQRCodes();
      }
      Logger.log("✅ Drive setup completed");
      steps.push({ step: 4, name: "Drive & QR Codes", ok: true });
    } catch (e) {
      Logger.log("⚠️ Drive setup warning (non-critical): " + e.message);
      steps.push({ step: 4, name: "Drive & QR Codes", ok: false, error: e.message });
    }

    // ────────────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────────────
    Logger.log("\n╔═══════════════════════════════════════════════════════╗");
    Logger.log("║  ✅ SETUP COMPLETE!                                  ║");
    Logger.log("╚═══════════════════════════════════════════════════════╝");
    Logger.log("\nSetup Summary:");
    steps.forEach(function(s) {
      Logger.log("  " + (s.ok ? "✅" : "❌") + " Step " + s.step + ": " + s.name);
    });

    Logger.log("\n🔐 Test User Credentials:");
    Logger.log("  • admin / Admin@123");
    Logger.log("  • manager / Manager@123");
    Logger.log("  • zonelead / ZoneLead@123");
    Logger.log("  • auditor / Auditor@123");
    Logger.log("  • viewer / Viewer@123");

    SpreadsheetApp.getUi().alert(
      "✅ SETUP COMPLETE! (4 steps)\n\n" +
      "🔐 Login with:\n" +
      "  admin / Admin@123\n\n" +
      "See Execution Log (Ctrl+Enter) for details."
    );

    return { success: errors.length === 0, steps: steps, errors: errors };

  } catch (e) {
    Logger.log("\n❌ CRITICAL ERROR: " + e.message);
    SpreadsheetApp.getUi().alert("❌ Setup failed!\n\nError: " + e.message);
    return { success: false, errors: [e.message] };
  }
}

// ============================================================================
// LEGACY SETUP (DEPRECATED)
// ============================================================================

/**
 * DEPRECATED: Use quickSetup() instead.
 * Full first-time setup. Creates all sheets, initialises config, generates QR codes.
 * Shows a confirmation dialog before proceeding.
 */
function runInitialSetup() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    "PackMasters 5S — Initial Setup",
    "This will create all sheets, Named Ranges, Drive folders, and QR codes.\n\n" +
    "This is safe to run multiple times — existing data will NOT be overwritten.\n\n" +
    "Continue?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert("Setup cancelled.");
    return;
  }

  try {
    // Step 1: Create all V1 sheets and infrastructure
    createAllSheets();

    // Step 2: Create V2 enhancement sheets (if available)
    if (typeof createEnhancedSheets === "function") {
      createEnhancedSheets();
    }

    // Step 3: Generate QR codes
    generateAllQRCodes();

    // Step 4: Show completion message
    ui.alert(
      "✅ Setup Complete!",
      "All sheets, Named Ranges, Drive folders, and QR codes have been created.\n\n" +
      "Next steps:\n" +
      "1. Review the Zones sheet and update email addresses\n" +
      "2. Deploy the Web App (Publish → Deploy as web app)\n" +
      "3. Use '🆔 Set Deployment ID' to store the deploy ID\n" +
      "4. Use '📱 Regenerate QR Codes' to update QR URLs\n" +
      "5. Print QR codes from the QR_Print_Layout sheet",
      ui.ButtonSet.OK
    );

  } catch (error) {
    ui.alert("❌ Setup Error", "An error occurred during setup:\n\n" + error.message, ui.ButtonSet.OK);
    Logger.log("Setup error: " + error.message + "\n" + error.stack);
  }
}


// ============================================================================
// DEPLOYMENT ID MANAGEMENT
// ============================================================================

/**
 * Prompts the admin to enter the Web App Deployment ID.
 * This ID is embedded in all QR code URLs.
 * 
 * To find the Deployment ID:
 * 1. In Apps Script Editor → Deploy → Manage Deployments
 * 2. Copy the deployment ID (starts with "AKfycb...")
 */
function setDeploymentId() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var currentId = props.getProperty("DEPLOY_ID") || "NOT_SET";

  var response = ui.prompt(
    "Set Web App Deployment ID",
    "Current ID: " + currentId + "\n\n" +
    "Enter the new Deployment ID (from Deploy → Manage Deployments):\n" +
    "(Starts with 'AKfycb...')",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  var newId = response.getResponseText().trim();
  if (!newId) {
    ui.alert("No ID entered. Deployment ID unchanged.");
    return;
  }

  props.setProperty("DEPLOY_ID", newId);
  logAdminAction_("setDeploymentId", "DEPLOY_ID updated to: " + newId);

  // Ask if QR codes should be regenerated
  var regenResponse = ui.alert(
    "Regenerate QR Codes?",
    "The Deployment ID has been updated. QR codes should be regenerated " +
    "so they point to the correct URL.\n\nRegenerate now?",
    ui.ButtonSet.YES_NO
  );

  if (regenResponse === ui.Button.YES) {
    regenerateQRCodes();
  }

  ui.alert("✅ Deployment ID updated successfully.");
}


// ============================================================================
// SYSTEM STATUS
// ============================================================================

/**
 * Displays a comprehensive system status report in a dialog.
 * Shows all config values, sheet status, Named Range status, and Drive folders.
 */
function showSystemStatus() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var status = [];
  status.push("═══════════════════════════════════");
  status.push("  PackMasters 5S System Status");
  status.push("═══════════════════════════════════");
  status.push("");

  // Config versions
  status.push("📋 Configuration:");
  status.push("  CONFIG_VERSION: " + (props.getProperty("CONFIG_VERSION") || "NOT SET"));
  status.push("  QR_VERSION: " + (props.getProperty("QR_VERSION") || "NOT SET"));
  status.push("  DEPLOY_ID: " + (props.getProperty("DEPLOY_ID") || "NOT SET"));
  status.push("  SPREADSHEET_ID: " + (props.getProperty("SPREADSHEET_ID") || "NOT SET"));
  status.push("");

  // Email config
  status.push("📧 Email Configuration:");
  status.push("  MC_EMAIL: " + (props.getProperty("MC_EMAIL") || "NOT SET"));
  status.push("  TOP_EMAIL: " + (props.getProperty("TOP_EMAIL") || "NOT SET"));
  status.push("");

  // Sheet status
  status.push("📊 Sheets:");
  var expectedSheets = ["Zones", "ChecklistSchema", "DailySubmissions", "WeeklyAudit",
    "NC_CAPA", "PhotoLog", "Summary", "AdminLog", "QR_Master"];
  expectedSheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      var rowCount = sheet.getLastRow() - 1; // Exclude header
      status.push("  ✅ " + name + " — " + rowCount + " data rows");
    } else {
      status.push("  ❌ " + name + " — MISSING");
    }
  });
  status.push("");

  // Named Ranges
  status.push("📌 Named Ranges:");
  var expectedRanges = ["Zones_Config", "Checklist_Schema", "Daily_Data", "Weekly_Data",
    "CAPA_Data", "Photo_Data", "Summary_Data", "Admin_Log", "QR_Data"];
  expectedRanges.forEach(function(name) {
    try {
      var range = ss.getRangeByName(name);
      if (range) {
        status.push("  ✅ " + name + " → " + range.getA1Notation());
      } else {
        status.push("  ❌ " + name + " — NOT FOUND");
      }
    } catch (e) {
      status.push("  ❌ " + name + " — ERROR: " + e.message);
    }
  });
  status.push("");

  // Zone config summary
  try {
    var zoneConfig = JSON.parse(props.getProperty("ZONE_CONFIG") || "{}");
    var zoneIds = Object.keys(zoneConfig);
    status.push("🏭 Zones Configured: " + zoneIds.length);
    zoneIds.sort().forEach(function(id) {
      var z = zoneConfig[id];
      var folderStatus = z.driveFolderId ? "📁" : "⚠️ No folder";
      status.push("  " + id + " — " + z.name + " (" + z.leader + ") " + folderStatus);
    });
  } catch (e) {
    status.push("⚠️ Could not parse ZONE_CONFIG: " + e.message);
  }
  status.push("");

  // Checklist schema summary
  try {
    var schema = JSON.parse(props.getProperty("CHECKLIST_SCHEMA") || "{}");
    status.push("📝 Checklist: " + (schema.totalCriteria || 0) + " criteria, max score " +
      (schema.maxTotalScore || 0));
  } catch (e) {
    status.push("⚠️ Could not parse CHECKLIST_SCHEMA: " + e.message);
  }
  status.push("");

  // Triggers
  var triggers = ScriptApp.getProjectTriggers();
  status.push("⏰ Active Triggers: " + triggers.length);
  triggers.forEach(function(t) {
    status.push("  • " + t.getHandlerFunction() + " (" + t.getEventType() + ")");
  });

  status.push("");
  status.push("═══════════════════════════════════");
  status.push("  Report generated: " + new Date().toLocaleString());
  status.push("═══════════════════════════════════");

  // Display in alert (limited to ~1000 chars in alert, so use sidebar for full report)
  var html = HtmlService.createHtmlOutput(
    "<pre style='font-family:monospace; font-size:12px; white-space:pre-wrap;'>" +
    status.join("\n") +
    "</pre>"
  )
    .setWidth(500)
    .setHeight(600)
    .setTitle("System Status");

  ui.showModalDialog(html, "PackMasters 5S — System Status");
}


// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Verifies all Named Ranges exist and point to valid sheets.
 * Reports results in an alert dialog.
 */
function verifyNamedRanges() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var expectedRanges = [
    "Zones_Config", "Checklist_Schema", "Daily_Data", "Weekly_Data",
    "CAPA_Data", "Photo_Data", "Summary_Data", "Admin_Log", "QR_Data"
  ];

  var results = [];
  var allPassed = true;

  expectedRanges.forEach(function(name) {
    try {
      var range = ss.getRangeByName(name);
      if (range) {
        results.push("✅ " + name + " → " + range.getSheet().getName() + "!" + range.getA1Notation());
      } else {
        results.push("❌ " + name + " — NOT FOUND");
        allPassed = false;
      }
    } catch (e) {
      results.push("❌ " + name + " — ERROR: " + e.message);
      allPassed = false;
    }
  });

  var summary = allPassed ?
    "✅ All Named Ranges verified successfully!\n\n" :
    "⚠️ Some Named Ranges are missing or broken.\nRun Initial Setup to fix.\n\n";

  ui.alert("Named Range Verification", summary + results.join("\n"), ui.ButtonSet.OK);
}


// ============================================================================
// EMAIL TESTING
// ============================================================================

/**
 * Sends a test email to the MC email address to verify email configuration.
 */
function sendTestEmail() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var mcEmail = props.getProperty("MC_EMAIL");

  if (!mcEmail || mcEmail === "tarun.mishra@packmasters.in") {
    var response = ui.prompt(
      "Test Email",
      "MC_EMAIL is currently: " + (mcEmail || "NOT SET") + "\n\n" +
      "Enter an email address to send the test to:\n" +
      "(Leave blank to use the current MC_EMAIL)",
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== ui.Button.OK) return;
    var inputEmail = response.getResponseText().trim();
    if (inputEmail) mcEmail = inputEmail;
  }

  if (!mcEmail) {
    ui.alert("No email configured. Set MC_EMAIL in ScriptProperties first.");
    return;
  }

  try {
    MailApp.sendEmail({
      to: mcEmail,
      subject: "PackMasters 5S System — Test Email",
      htmlBody: buildTestEmailHtml_()
    });

    logAdminAction_("sendTestEmail", "Test email sent to: " + mcEmail);
    ui.alert("✅ Test email sent to: " + mcEmail);
  } catch (e) {
    ui.alert("❌ Email failed: " + e.message);
  }
}

/**
 * Builds the HTML body for a test email.
 * @returns {string} HTML string
 * @private
 */
function buildTestEmailHtml_() {
  var props = PropertiesService.getScriptProperties();
  return '<div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;">' +
    '<div style="background:#1a5276; color:white; padding:20px; text-align:center;">' +
    '<h1 style="margin:0;">PackMasters</h1>' +
    '<p style="margin:5px 0 0 0;">5S Integrated Management System</p>' +
    '</div>' +
    '<div style="padding:20px; background:#f8f9fa;">' +
    '<h2 style="color:#1a5276;">✅ Email Configuration Test</h2>' +
    '<p>This is a test email from the PackMasters 5S system.</p>' +
    '<table style="width:100%; border-collapse:collapse;">' +
    '<tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">System</td>' +
    '<td style="padding:8px; border:1px solid #ddd;">PackMasters 5S IMS</td></tr>' +
    '<tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Config Version</td>' +
    '<td style="padding:8px; border:1px solid #ddd;">' + (props.getProperty("CONFIG_VERSION") || "N/A") + '</td></tr>' +
    '<tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">QR Version</td>' +
    '<td style="padding:8px; border:1px solid #ddd;">' + (props.getProperty("QR_VERSION") || "N/A") + '</td></tr>' +
    '<tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Sent At</td>' +
    '<td style="padding:8px; border:1px solid #ddd;">' + new Date().toLocaleString() + '</td></tr>' +
    '</table>' +
    '<p style="color:#666; font-size:12px; margin-top:20px;">' +
    'If you received this email, the email notification system is working correctly.</p>' +
    '</div>' +
    '<div style="background:#1a5276; color:white; padding:10px; text-align:center; font-size:12px;">' +
    '© PackMasters | ZED-2 Compliant | ISO 9001:2015</div>' +
    '</div>';
}


// ============================================================================
// MANUAL TRIGGER FUNCTIONS (STUBS FOR PHASE 3)
// ============================================================================

/**
 * Manual archive trigger — placeholder for Phase 3 implementation.
 * In Phase 3, this will call archiveOldData(90).
 */
function runArchiveManually() {
  var ui = SpreadsheetApp.getUi();

  // Check if Phase 3 archive function exists
  if (typeof archiveOldData === "function") {
    var response = ui.alert(
      "Archive Old Data",
      "This will move data older than 90 days to the archive sheet.\n\nContinue?",
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      archiveOldData(90);
      ui.alert("✅ Archive complete.");
    }
  } else {
    ui.alert(
      "Not Available Yet",
      "The archive function will be available after Phase 3 deployment.\n" +
      "This is a placeholder menu item.",
      ui.ButtonSet.OK
    );
  }
}

/**
 * Manual monthly rollup trigger — placeholder for Phase 3 implementation.
 */
function runMonthlyRollupManually() {
  var ui = SpreadsheetApp.getUi();

  if (typeof monthlyRollup === "function") {
    var response = ui.alert(
      "Run Monthly Rollup",
      "This will compute monthly scores for all zones.\n\nContinue?",
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      monthlyRollup();
      ui.alert("✅ Monthly rollup complete.");
    }
  } else {
    ui.alert(
      "Not Available Yet",
      "The monthly rollup function will be available after Phase 3 deployment.\n" +
      "This is a placeholder menu item.",
      ui.ButtonSet.OK
    );
  }
}



// ============================================================================
// VERSIONS FILE
// ============================================================================

/**
 * Project version tracking object.
 * Updated with each deployment.
 */
var PROJECT_VERSION = {
  current: "1.0.0",
  phases: {
    "1.0.0": {
      date: "2025-04-01",
      phases: "1",
      deployId: "NOT_SET",
      description: "Phase 1 — Foundation: Spreadsheet, Config & QR Generation"
    }
  }
};

/**
 * Returns the current project version.
 * @returns {string} Version string
 */
function getProjectVersion() {
  return PROJECT_VERSION.current;
}


// ============================================================================
// DIAGNOSTICS
// ============================================================================



// ============================================================================
// ONE-STEP SYSTEM INITIALIZATION
// ============================================================================


/**
 * One-step system initialization orchestrator.
 * Replaces the 6-8 manual Admin menu clicks previously required.
 *
 * @param {Object} config — { deployUrl, mcEmail, mgmtEmail, auditorEmails, targetScore }
 * @returns {Object} { success, steps:[{name, ok, msg}], errors:[], qrPrintUrl }
 */
function runFullSystemInit(config) {
  // ✅ SECURITY CHECK: Only ADMIN role can initialize system
  try {
    v2CheckPermission_("SYSTEM_INIT", v2GetCurrentUser_());
  } catch (e) {
    return {
      success: false,
      steps: [{ name: "Authorization", ok: false, msg: e.message }],
      errors: [e.message],
      qrPrintUrl: ""
    };
  }

  config = config || {};
  var steps = [];
  var errors = [];

  function step(name, fn) {
    try {
      var msg = fn();
      steps.push({ name: name, ok: true, msg: msg || "Done" });
    } catch (e) {
      steps.push({ name: name, ok: false, msg: e.message });
      errors.push(name + ": " + e.message);
    }
  }

  // 1. Create all sheets (V1 + V2)
  step("Create Sheets", function() {
    createAllSheets();
    return "All sheets created";
  });

  // 2. Store script properties
  step("Save Configuration", function() {
    var props = PropertiesService.getScriptProperties();
    if (config.deployUrl) {
      var idMatch = String(config.deployUrl).match(/\/s\/([^\/]+)\/exec/);
      if (idMatch) props.setProperty("DEPLOY_ID", idMatch[1]);
      props.setProperty("DEPLOY_URL", config.deployUrl);
    }
    if (config.mcEmail)       props.setProperty("MC_EMAIL",       config.mcEmail);
    if (config.mgmtEmail)     props.setProperty("MGMT_EMAIL",     config.mgmtEmail);
    if (config.auditorEmails) props.setProperty("AUDITOR_EMAILS", config.auditorEmails);
    if (config.targetScore)   props.setProperty("TARGET_SCORE",   String(config.targetScore));
    var ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
    props.setProperty("SPREADSHEET_ID", ssId);
    return "Properties stored";
  });

  // 3. Create Drive photo folders (if function exists)
  step("Create Drive Folders", function() {
    if (typeof createZoneDriveFolders_ === "function") {
      createZoneDriveFolders_();
      return "Drive folders created";
    }
    return "Skipped (function not found)";
  });

  // 4. Generate QR codes
  step("Generate QR Codes", function() {
    if (typeof generateAllQRCodes === "function") {
      generateAllQRCodes();
      return "QR codes generated";
    }
    return "Skipped (function not found)";
  });

  // 5. Set up daily trigger
  step("Setup Trigger", function() {
    if (typeof setupTrigger === "function") {
      setupTrigger();
      return "Daily trigger created";
    }
    return "Skipped (function not found)";
  });

  // 6. Log admin action
  step("Log Init", function() {
    if (typeof logAdminAction_ === "function") {
      logAdminAction_("runFullSystemInit", "Full system initialization completed. Config: " + JSON.stringify({
        deployUrl: config.deployUrl || "", mcEmail: config.mcEmail || ""
      }));
    }
    return "Logged";
  });

  // 7. Initialize SPC thresholds for Analytics & SPC Dashboard (Plan D)
  step("SPC Thresholds", function() {
    var spcThresholds = {
      S_critical:       1,       // Safety: 1+ incidents = RED
      Q_target:         70,      // Quality: <70% score = RED
      C_threshold:      50000,   // Cost: >₹50K pending Red Tags = RED
      D_critical:       1,       // Delivery: 1+ overdue actions = RED
      P_expiring:       7,       // People: certs expiring within 7 days = RED
      trend_improving:  0.5,     // Slope > +0.5/day = GREEN trend
      trend_declining:  -0.5,    // Slope < -0.5/day = RED trend
      spc_lookback:     30       // Rolling window for UCL/LCL calculation (days)
    };
    PropertiesService.getScriptProperties().setProperty(
      "pm5s_spc_thresholds",
      JSON.stringify(spcThresholds)
    );
    return "SPC thresholds stored";
  });

  // Build QR print URL
  var qrPrintUrl = "";
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var qrSheet = ss.getSheetByName("QR_Print_Layout");
    if (qrSheet) {
      qrPrintUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/edit#gid=" + qrSheet.getSheetId();
    }
  } catch(e) {}

  return {
    success: errors.length === 0,
    steps: steps,
    errors: errors,
    qrPrintUrl: qrPrintUrl
  };
}

// ============================================================================
// BACKUP MANAGEMENT MENU HANDLERS
// ============================================================================

/**
 * Dialog for creating a manual backup with custom label.
 */
function openManualBackupDialog() {
  var ui = SpreadsheetApp.getUi();
  var label = ui.prompt(
    "Create Manual Backup",
    "Enter a custom label for this backup (optional):\nExample: 'Pre-Migration', 'Before Month-End', etc.",
    ui.ButtonSet.OK_CANCEL
  );

  if (label.getSelectedButton() === ui.Button.OK) {
    var customLabel = label.getResponseText().trim();
    try {
      var result = createManualBackup(customLabel);
      if (result.success) {
        ui.alert(
          "✅ Backup Created",
          result.message + "\n\nBackup ID: " + result.backupId,
          ui.ButtonSet.OK
        );
      } else {
        ui.alert("❌ Backup Failed", result.message, ui.ButtonSet.OK);
      }
    } catch (e) {
      ui.alert("❌ Error", e.message, ui.ButtonSet.OK);
    }
  }
}


function fixDeployId() {
  var newId = "AKfycbwCp-llVo81JDPQLMoIWa-vP9BiRaNwwMjjKxh9elI8HLju9umi_dgokXXgYYK9HIg3_w";
  PropertiesService.getScriptProperties().setProperty("DEPLOY_ID", newId);
  return "DEPLOY_ID updated to @44: " + newId;
}
