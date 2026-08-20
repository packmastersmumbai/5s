/**
 * ============================================================================
 * 03_QRGenerator.gs — PackMasters 5S Integrated System
 * Phase 1: QR Code Generation
 * ============================================================================
 * 
 * Generates QR codes for all zones using Google Charts API (zero external deps).
 * Each zone gets two QR codes: one for the daily checksheet, one for the
 * zone landing page (which offers both daily and weekly options).
 * 
 * QR codes embed the Web App URL with zone ID and QR_VERSION parameters.
 * When the Web App is redeployed, increment QR_VERSION and regenerate.
 * 
 * CONSTRAINT-6: Only Google Charts API used — no external QR libraries.
 * 
 * Functions:
 *   generateQRURL(zoneId, formType)  — Returns a Google Charts QR image URL
 *   generateWebAppURL(zoneId, formType) — Returns the Web App URL for a zone
 *   generateAllQRCodes()             — Writes all QR codes to QR_Master sheet
 *   regenerateQRCodes()              — Increments version and regenerates
 */

// ============================================================================
// QR URL GENERATION
// ============================================================================

/**
 * Generates a Google Charts API URL that produces a QR code image.
 * The QR code encodes the Web App URL for the specified zone and form type.
 * 
 * @param {string} zoneId — Zone identifier (e.g. "Z-01")
 * @param {string} formType — "landing" for zone page, "daily" for direct daily form
 * @param {number} [size=300] — QR image size in pixels (width = height)
 * @returns {string} Google Charts API URL that renders a QR code PNG
 */
function generateQRURL(zoneId, formType, size) {
  size = size || 300;
  var targetUrl = generateWebAppURL(zoneId, formType);

  // Google Charts API for QR code generation
  // Documentation: https://developers.google.com/chart/infographics/docs/qr_codes
  var chartApiUrl = "https://chart.googleapis.com/chart?" +
    "cht=qr" +
    "&chs=" + size + "x" + size +
    "&chl=" + encodeURIComponent(targetUrl) +
    "&choe=UTF-8" +
    "&chld=M|2";  // Error correction level M, margin 2

  return chartApiUrl;
}

/**
 * Generates the Web App URL that a QR code should point to.
 * Includes zone ID, form type, and QR version for cache-busting.
 * 
 * @param {string} zoneId — Zone identifier (e.g. "Z-01")
 * @param {string} formType — "landing", "daily", or "weekly"
 * @returns {string} Complete Web App URL with parameters
 */
function generateWebAppURL(zoneId, formType) {
  var props = PropertiesService.getScriptProperties();
  var deployId = props.getProperty("DEPLOY_ID") || "NOT_SET";
  var qrVersion = props.getProperty("QR_VERSION") || "1";

  // Base URL for deployed Web App.
  // v2WebAppUrl_ handles both storage shapes: DEPLOY_ID may hold a bare id OR a
  // full /exec URL. The old code assumed a bare id and concatenated blindly,
  // which produced .../macros/s/https://script.google.com/macros/s/AKfy.../exec
  // once the property held a full URL — a doubled, unopenable link baked into
  // every printed QR label. QR codes go on walls, so this must be right.
  var baseUrl = (typeof v2WebAppUrl_ === "function") ? v2WebAppUrl_("") : "";
  if (!baseUrl) {
    baseUrl = (deployId && deployId !== "NOT_SET")
      ? (/^https?:\/\//.test(deployId) ? deployId : "https://script.google.com/macros/s/" + deployId + "/exec")
      : "https://script.google.com/macros/s/DEPLOY_ID_NOT_SET/exec";
  }

  // Build URL with parameters
  var params = [];
  params.push("zone=" + encodeURIComponent(zoneId));

  if (formType === "daily") {
    params.push("type=daily");
  } else if (formType === "weekly") {
    params.push("type=weekly");
  }
  // "landing" type has no type parameter — just the zone

  params.push("v=" + qrVersion);

  return baseUrl + "?" + params.join("&");
}


// ============================================================================
// BATCH QR GENERATION
// ============================================================================

/**
 * Generates QR codes for all zones and writes them to the QR_Master sheet.
 * Each zone gets two rows: one for the landing page, one for the daily form.
 * (Weekly form is accessed from the landing page, not a separate QR.)
 * 
 * Writes both the QR image URL and a Google Sheets IMAGE formula so the
 * QR code renders directly in the cell for easy printing.
 * 
 * Called from Admin Menu → Regenerate QRs.
 */
function generateAllQRCodes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qrSheet = ss.getSheetByName("QR_Master");

  if (!qrSheet) {
    throw new Error("QR_Master sheet not found. Run createAllSheets() first.");
  }

  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();
  var props = PropertiesService.getScriptProperties();
  var qrVersion = props.getProperty("QR_VERSION") || "1";
  var now = new Date();

  // Clear existing data (keep headers)
  if (qrSheet.getLastRow() > 1) {
    qrSheet.getRange(2, 1, qrSheet.getLastRow() - 1, qrSheet.getLastColumn()).clearContent();
  }

  var rows = [];
  var formulas = []; // IMAGE formulas need to be set separately

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    var formTypes = ["landing", "daily"];

    formTypes.forEach(function(formType) {
      var qrUrl = generateQRURL(zoneId, formType, 300);
      var webAppUrl = generateWebAppURL(zoneId, formType);
      var imageFormula = '=IMAGE("' + qrUrl + '", 1)'; // Mode 1 = fit to cell

      rows.push([
        zoneId,
        zone.name,
        formType,
        qrUrl,
        imageFormula,  // Will be overwritten with actual formula below
        webAppUrl,
        qrVersion,
        now
      ]);
    });
  });

  // Write all rows at once (CONSTRAINT-1: batch write)
  if (rows.length > 0) {
    // Write data columns (A through H)
    qrSheet.getRange(2, 1, rows.length, 8).setValues(rows);

    // Now set the IMAGE formulas in column E (overwrite the formula strings with actual formulas)
    for (var i = 0; i < rows.length; i++) {
      var qrUrl = rows[i][3]; // Column D = QR URL
      qrSheet.getRange(i + 2, 5).setFormula('=IMAGE("' + qrUrl + '", 1)');
    }

    // Set row heights to display QR codes
    for (var j = 0; j < rows.length; j++) {
      qrSheet.setRowHeight(j + 2, 200);
    }

    // Set column E width for QR display
    qrSheet.setColumnWidth(5, 220);
  }

  // Log the generation
  logAdminAction_("generateAllQRCodes",
    rows.length + " QR codes generated. Version: " + qrVersion);

  Logger.log("✅ Generated " + rows.length + " QR codes (version " + qrVersion + ").");
  ss.toast(rows.length + " QR codes generated! Check QR_Master sheet.", "QR Generation", 5);
}

/**
 * Increments QR_VERSION and regenerates all QR codes.
 * Call this after redeploying the Web App with a new DEPLOY_ID.
 */
function regenerateQRCodes() {
  var props = PropertiesService.getScriptProperties();
  var currentVersion = parseInt(props.getProperty("QR_VERSION") || "1", 10);
  var newVersion = currentVersion + 1;
  props.setProperty("QR_VERSION", String(newVersion));

  Logger.log("🔄 QR_VERSION incremented: " + currentVersion + " → " + newVersion);

  generateAllQRCodes();

  logAdminAction_("regenerateQRCodes",
    "QR_VERSION incremented to " + newVersion + " and all codes regenerated.");
}


// ============================================================================
// QR CODE PRINT PREPARATION
// ============================================================================

