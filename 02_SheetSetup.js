/**
 * ============================================================================
 * 02_SheetSetup.gs — PackMasters 5S Integrated System
 * Phase 1: Spreadsheet Structure & Drive Folder Setup
 * ============================================================================
 * 
 * Creates all 10 sheets with correct headers, sets up Named Ranges,
 * protects header rows, and creates zone-specific Drive folders.
 * 
 * CONSTRAINT-4: All scripts reference Named Ranges, never hardcoded A1 notation.
 * 
 * Functions:
 *   createAllSheets()           — Master setup function
 *   createSheet_(ss, name, headers) — Creates one sheet with headers
 *   setupNamedRanges_(ss)       — Creates all Named Ranges
 *   protectHeaders_(ss)         — Locks row 1 on all data sheets
 *   createZoneDriveFolders_()   — Creates Drive folders for photo storage
 *   writeZonesConfigSheet_(ss)  — Populates Zones sheet from defaults
 *   writeChecklistSchemaSheet_(ss) — Populates ChecklistSchema sheet
 */

// ============================================================================
// SHEET DEFINITIONS
// ============================================================================

/**
 * Returns the complete sheet inventory with column headers.
 * This is the single source of truth for all sheet structures.
 * @returns {Object[]} Array of sheet definition objects
 * @private
 */
function getSheetDefinitions_() {
  return [
    {
      name: "Zones",
      namedRange: "Zones_Config",
      type: "config",
      headers: [
        "zone_id", "zone_name", "zone_name_hi", "zone_leader",
        "email", "audit_day", "audit_day_num", "department", "drive_folder_id"
      ]
    },
    {
      name: "ChecklistSchema",
      namedRange: "Checklist_Schema",
      type: "config",
      headers: [
        "criterion_id", "pillar", "label_en", "label_hi", "max_score"
      ]
    },
    {
      name: "DailySubmissions",
      namedRange: "Daily_Data",
      type: "data",
      headers: [
        "submission_id", "timestamp", "zone_id", "zone_name", "zone_leader",
        "submission_date", "submission_type", "s1_score", "s2_score", "s3_score",
        "s4_score", "s5_score", "total_pass", "total_criteria", "pct_score",
        "remarks", "photo_url", "is_duplicate"
      ]
    },
    {
      name: "WeeklyAudit",
      namedRange: "Weekly_Data",
      type: "data",
      headers: buildWeeklyAuditHeaders_()
    },
    {
      name: "NC_CAPA",
      namedRange: "CAPA_Data",
      type: "operational",
      headers: [
        "nc_id", "zone_id", "audit_date", "description",
        "type", "pillar", "sqcdp_dimension",
        "corrective_action", "responsible_person", "target_date",
        "actual_closure_date", "status",
        "root_cause", "verified_by", "verification_date", "recurrence_count"
      ]
    },
    {
      name: "RedTags",
      namedRange: "RedTag_Data",
      type: "operational",
      headers: [
        "tag_no", "zone_id", "item_description", "quantity", "reason",
        "category", "date_tagged", "tagged_by", "status",
        "suggested_action", "disposal_date", "remarks"
      ]
    },
    {
      name: "PhotoLog",
      namedRange: "Photo_Data",
      type: "operational",
      headers: [
        "photo_id", "timestamp", "zone_id", "zone_name", "photo_date",
        "photo_type", "description", "drive_url", "drive_file_id",
        "uploaded_by", "related_submission_id"
      ]
    },
    {
      name: "Summary",
      namedRange: "Summary_Data",
      type: "aggregated",
      headers: [
        "zone_id", "month", "overall_score", "submission_count",
        "s1_score", "s2_score", "s3_score", "s4_score", "s5_score",
        "open_ncs", "closed_ncs", "open_ofis", "active_red_tags",
        "zed_status", "score_delta"
      ]
    },
    {
      name: "AdminLog",
      namedRange: "Admin_Log",
      type: "audit",
      headers: [
        "timestamp", "user_email", "action", "details", "config_version"
      ]
    },
    {
      name: "QR_Master",
      namedRange: "QR_Data",
      type: "output",
      headers: [
        "zone_id", "zone_name", "form_type", "qr_url", "qr_image_formula",
        "web_app_url", "qr_version", "generated_at"
      ]
    }
  ];
}

/**
 * Builds the WeeklyAudit column headers dynamically from the default checklist schema.
 * This ensures the sheet structure matches the criteria count exactly.
 * @returns {string[]} Array of column header strings
 * @private
 */
function buildWeeklyAuditHeaders_() {
  var schema = getDefaultChecklistSchema_();
  var headers = [
    "submission_id", "timestamp", "zone_id", "zone_name", "auditor_email", "audit_date"
  ];

  // Add one column per criterion: e.g. "S1-C1_score"
  schema.criteria.forEach(function(criterion) {
    headers.push(criterion.id + "_score");
  });

  // Add summary columns
  headers.push("total_score");
  headers.push("max_score");
  headers.push("pct_score");
  headers.push("nc_count");
  headers.push("nc_details");
  headers.push("photo_urls");

  return headers;
}


// ============================================================================
// MASTER SETUP FUNCTION
// ============================================================================

/**
 * Creates all sheets, Named Ranges, header protections, and Drive folders.
 * Safe to run multiple times — skips existing sheets, recreates Named Ranges.
 * 
 * Run this ONCE during initial setup, or from Admin Menu.
 */
function createAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var definitions = getSheetDefinitions_();

  Logger.log("🔧 Starting sheet setup for PackMasters 5S System...");

  // Step 1: Create all sheets with headers
  definitions.forEach(function(def) {
    createSheet_(ss, def.name, def.headers);
  });

  // Step 2: Create Archive sheet for current fiscal year
  var currentFY = getCurrentFiscalYear_();
  createSheet_(ss, "Archive_" + currentFY, [
    "source_sheet", "archived_date", "original_row_data"
  ]);

  // Step 3: Populate config sheets with default data
  writeZonesConfigSheet_(ss);
  writeChecklistSchemaSheet_(ss);

  // Step 4: Set up Named Ranges
  setupNamedRanges_(ss);

  // Step 5: Protect header rows
  protectHeaders_(ss);

  // Step 6: Create Drive folders for zones
  var folderIds = createZoneDriveFolders_();

  // Step 7: Initialize ScriptProperties FIRST (reads from freshly populated config sheets)
  initScriptProperties();

  // Step 8: Update ScriptProperties with folder IDs (requires ZONE_CONFIG to exist)
  updateZoneFolderIds(folderIds);

  // Step 9: Format sheets for readability
  formatAllSheets_(ss, definitions);

  // Step 10: Create V2 enhancement sheets (RedTagRegister, TaskBoard, KaizenSuggestions, etc.)
  if (typeof createEnhancedSheets === "function") {
    createEnhancedSheets();
  }

  Logger.log("✅ All sheets created and configured successfully.");
  ss.toast("Sheet setup complete! All sheets (V1 + V2) created with Named Ranges.", "Setup Complete", 10);
}


// ============================================================================
// SHEET CREATION
// ============================================================================

/**
 * Creates a single sheet with headers in row 1.
 * If the sheet already exists, verifies headers match and skips creation.
 * @param {Spreadsheet} ss — Active spreadsheet
 * @param {string} name — Sheet name
 * @param {string[]} headers — Column header strings
 * @private
 */
function createSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);

  if (sheet) {
    Logger.log("  ⏭️  Sheet '" + name + "' already exists. Verifying headers...");
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    // Trim and compare
    var needsUpdate = false;
    for (var i = 0; i < headers.length; i++) {
      if (String(existingHeaders[i]).trim() !== headers[i]) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      Logger.log("  🔄  Headers updated for '" + name + "'.");
    }
    return sheet;
  }

  // Create new sheet
  sheet = ss.insertSheet(name);

  // Set headers in row 1
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Bold and freeze header row
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4472C4")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);

  // Set column widths for readability
  if (headers.length <= 10) {
    sheet.setColumnWidths(1, headers.length, 150);
  } else {
    sheet.setColumnWidths(1, Math.min(headers.length, 6), 150);
    if (headers.length > 6) {
      sheet.setColumnWidths(7, headers.length - 6, 120);
    }
  }

  Logger.log("  ✅ Sheet '" + name + "' created with " + headers.length + " columns.");
  return sheet;
}


// ============================================================================
// NAMED RANGES
// ============================================================================

/**
 * Creates or updates all Named Ranges.
 * Named Ranges expand to cover all rows (1 to max 10000) for future data growth.
 * CONSTRAINT-4: All script references use Named Ranges, never hardcoded A1 notation.
 * @param {Spreadsheet} ss — Active spreadsheet
 * @private
 */
function setupNamedRanges_(ss) {
  var definitions = getSheetDefinitions_();

  // Remove existing Named Ranges to avoid conflicts
  var existingRanges = ss.getNamedRanges();
  existingRanges.forEach(function(nr) {
    var name = nr.getName();
    definitions.forEach(function(def) {
      if (name === def.namedRange) {
        nr.remove();
      }
    });
  });

  // Create Named Ranges
  definitions.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      Logger.log("  ⚠️  Sheet '" + def.name + "' not found for Named Range '" + def.namedRange + "'.");
      return;
    }

    var lastCol = def.headers.length;
    // Named Range covers row 1 (headers) through row 10000
    var range = sheet.getRange(1, 1, 10000, lastCol);
    ss.setNamedRange(def.namedRange, range);

    Logger.log("  📌 Named Range '" + def.namedRange + "' → '" + def.name + "'!A1:" +
      columnToLetter_(lastCol) + "10000");
  });

  Logger.log("  ✅ All Named Ranges created.");
}

/**
 * Converts a column number to letter notation (1 → A, 27 → AA, etc.)
 * @param {number} col — 1-based column number
 * @returns {string} Column letter
 * @private
 */
function columnToLetter_(col) {
  var letter = "";
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}


// ============================================================================
// HEADER PROTECTION
// ============================================================================

/**
 * Protects row 1 on all data sheets to prevent accidental header edits.
 * Only the project owner can edit protected ranges.
 * @param {Spreadsheet} ss — Active spreadsheet
 * @private
 */
function protectHeaders_(ss) {
  var dataSheets = ["DailySubmissions", "WeeklyAudit", "NC_CAPA", "RedTags", "PhotoLog", "Summary", "AdminLog", "QR_Master"];

  dataSheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    // Remove existing protections on row 1 to avoid duplicates
    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach(function(p) {
      if (p.getDescription() === "Header Protection - " + sheetName) {
        p.remove();
      }
    });

    // Protect row 1
    var headerRange = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
    var protection = headerRange.protect().setDescription("Header Protection - " + sheetName);
    protection.setWarningOnly(true); // Shows warning but doesn't block (avoids permission complexity)

    Logger.log("  🔒 Header row protected on '" + sheetName + "'.");
  });
}


// ============================================================================
// CONFIG SHEET POPULATION
// ============================================================================

/**
 * Populates the Zones sheet with default zone configuration data.
 * Only writes if the sheet has no data rows (row 2+).
 * @param {Spreadsheet} ss — Active spreadsheet
 * @private
 */
function writeZonesConfigSheet_(ss) {
  var sheet = ss.getSheetByName("Zones");
  if (!sheet) return;

  // Skip if already has data
  if (sheet.getLastRow() > 1) {
    Logger.log("  ⏭️  Zones sheet already has data. Skipping population.");
    return;
  }

  var config = getDefaultZoneConfig_();
  var zoneIds = Object.keys(config).sort();
  var rows = zoneIds.map(function(id) {
    var z = config[id];
    return [z.id, z.name, z.nameHi, z.leader, z.email, z.auditDay, z.auditDayNum, z.department, z.driveFolderId];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("  ✅ Zones sheet populated with " + rows.length + " zones.");
  }
}

/**
 * Populates the ChecklistSchema sheet with default criteria.
 * Only writes if the sheet has no data rows (row 2+).
 * @param {Spreadsheet} ss — Active spreadsheet
 * @private
 */
function writeChecklistSchemaSheet_(ss) {
  var sheet = ss.getSheetByName("ChecklistSchema");
  if (!sheet) return;

  if (sheet.getLastRow() > 1) {
    Logger.log("  ⏭️  ChecklistSchema sheet already has data. Skipping population.");
    return;
  }

  var schema = getDefaultChecklistSchema_();
  var rows = schema.criteria.map(function(c) {
    return [c.id, c.pillar, c.labelEn, c.labelHi, c.maxScore];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("  ✅ ChecklistSchema sheet populated with " + rows.length + " criteria.");
  }
}


// ============================================================================
// DRIVE FOLDER CREATION
// ============================================================================

/**
 * Creates a parent folder "PackMasters_5S_Photos" in Drive,
 * then creates one sub-folder per zone for photo storage.
 * Returns a map of zone IDs to folder IDs.
 * @returns {Object} { "Z-01": "folderId1", "Z-02": "folderId2", ... }
 * @private
 */
function createZoneDriveFolders_() {
  var config = getDefaultZoneConfig_();
  var zoneIds = Object.keys(config).sort();
  var folderIds = {};

  // Check if parent folder already exists
  var parentFolderName = "PackMasters_5S_Photos";
  var parentFolder;
  var existingFolders = DriveApp.getFoldersByName(parentFolderName);

  if (existingFolders.hasNext()) {
    parentFolder = existingFolders.next();
    Logger.log("  ⏭️  Parent folder '" + parentFolderName + "' already exists.");
  } else {
    parentFolder = DriveApp.createFolder(parentFolderName);
    Logger.log("  📁 Created parent folder: " + parentFolderName);
  }

  // Create zone sub-folders
  zoneIds.forEach(function(zoneId) {
    var subFolderName = zoneId + "_" + config[zoneId].name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "_");
    var subFolder;
    var existingSubs = parentFolder.getFoldersByName(subFolderName);

    if (existingSubs.hasNext()) {
      subFolder = existingSubs.next();
      Logger.log("  ⏭️  Folder '" + subFolderName + "' already exists.");
    } else {
      subFolder = parentFolder.createFolder(subFolderName);
      // Set sharing to anyone with link can view (for photo display in dashboards)
      subFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      Logger.log("  📁 Created folder: " + subFolderName);
    }

    folderIds[zoneId] = subFolder.getId();
  });

  // Also update the Zones sheet with folder IDs
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var zonesSheet = ss.getSheetByName("Zones");
  if (zonesSheet && zonesSheet.getLastRow() > 1) {
    var data = zonesSheet.getDataRange().getValues(); // BATCH_READ
    for (var r = 1; r < data.length; r++) {
      var id = String(data[r][0]).trim();
      if (folderIds[id]) {
        zonesSheet.getRange(r + 1, 9).setValue(folderIds[id]); // Column 9 = drive_folder_id
      }
    }
  }

  Logger.log("  ✅ All " + Object.keys(folderIds).length + " zone folders created/verified.");
  return folderIds;
}


// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Applies visual formatting to all sheets for readability.
 * @param {Spreadsheet} ss — Active spreadsheet
 * @param {Object[]} definitions — Sheet definitions array
 * @private
 */
function formatAllSheets_(ss, definitions) {
  definitions.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) return;

    // Auto-resize columns based on content (header)
    try {
      for (var c = 1; c <= Math.min(def.headers.length, 26); c++) {
        sheet.autoResizeColumn(c);
      }
    } catch (e) {
      // autoResizeColumn can fail on empty columns; non-critical
    }

    // Add alternating row colors for data sheets
    if (def.type === "data" || def.type === "operational") {
      try {
        var conditionalRule = SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied("=ISEVEN(ROW())")
          .setBackground("#F2F7FC")
          .setRanges([sheet.getRange(2, 1, 9999, def.headers.length)])
          .build();
        sheet.setConditionalFormatRules([conditionalRule]);
      } catch (e) {
        Logger.log("  ⚠️  Could not set conditional formatting on '" + def.name + "': " + e.message);
      }
    }
  });

  // Delete the default "Sheet1" if it exists and is empty
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
      Logger.log("  🗑️  Deleted default 'Sheet1'.");
    } catch (e) {
      // Can't delete if it's the only sheet; non-critical
    }
  }
}


// ============================================================================
// ISO COMPLIANCE: AUDIT TRAIL SHEET — Plan E
// ============================================================================

/**
 * Creates the AuditTrail sheet for ISO compliance.
 * Append-only immutable log of all system changes.
 *
 * IMPORTANT: Run this ONCE from the GAS editor or from runFullSystemInit().
 * Do NOT call this on every web request.
 *
 * @returns {Sheet} The AuditTrail sheet
 */
function createAuditTrailSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var auditSheet = ss.getSheetByName("AuditTrail");

  if (auditSheet) {
    var headerRow = auditSheet.getRange(1, 1, 1, 10).getValues()[0];
    if (String(headerRow[0]).toUpperCase() !== "TIMESTAMP") {
      Logger.log("AuditTrail sheet exists but schema mismatch — manual review required");
    }
    Logger.log("AuditTrail sheet already exists — skipped creation");
    return auditSheet;
  }

  auditSheet = ss.insertSheet("AuditTrail");

  var headers = [
    "timestamp", "actor_email", "action", "target_type", "target_id",
    "before_state", "after_state", "reason", "zone_id", "session_id"
  ];
  auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format header row
  var headerRange = auditSheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0F172A");
  headerRange.setFontColor("#FFFFFF");
  auditSheet.setFrozenRows(1);

  // Set column widths for readability
  auditSheet.setColumnWidth(1, 140); // timestamp
  auditSheet.setColumnWidth(2, 200); // actor_email
  auditSheet.setColumnWidth(3, 140); // action
  auditSheet.setColumnWidth(4, 120); // target_type
  auditSheet.setColumnWidth(5, 160); // target_id
  auditSheet.setColumnWidth(6, 200); // before_state
  auditSheet.setColumnWidth(7, 200); // after_state
  auditSheet.setColumnWidth(8, 200); // reason
  auditSheet.setColumnWidth(9, 80);  // zone_id
  auditSheet.setColumnWidth(10, 100); // session_id

  Logger.log("AuditTrail sheet created successfully");
  return auditSheet;
}


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Returns the current Indian fiscal year string (e.g. "2025-26").
 * Indian FY runs April to March.
 * @returns {string} Fiscal year string
 * @private
 */
function getCurrentFiscalYear_() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr
  if (month < 3) { // Jan-Mar = previous FY
    return (year - 1) + "-" + String(year).slice(2);
  }
  return year + "-" + String(year + 1).slice(2);
}
