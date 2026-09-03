/**
 * ============================================================================
 * 01_Config.gs — PackMasters 5S Integrated System
 * Phase 1: Configuration Management
 * ============================================================================
 * 
 * This file manages all system configuration via PropertiesService.
 * CONSTRAINT-2: All runtime config reads come from ScriptProperties, never Sheets.
 * CONSTRAINT-7: All operational parameters are config-driven, not code-driven.
 * 
 * Functions:
 *   initScriptProperties()  — First-time setup of all config keys
 *   refreshConfig()         — Reloads config from Zones/Checklist sheets into Properties
 *   getConfig(key)          — Runtime config reader (Properties only, never Sheets)
 *   getZoneConfig()         — Returns parsed ZONE_CONFIG object
 *   getChecklistSchema()    — Returns parsed CHECKLIST_SCHEMA object
 *   getAllZoneIds()          — Returns array of zone ID strings
 */

// ============================================================================
// DEFAULT ZONE CONFIGURATION
// ============================================================================

/**
 * Returns the default ZONE_CONFIG object.
 * This is used ONLY for initial setup. After init, all reads come from ScriptProperties.
 * Email addresses are placeholders — replace before going live.
 */
function getDefaultZoneConfig_() {
  // Delegate to 01b_ZoneData.js — keeps this file readable
  var meta = getDefaultZoneMetadata_();
  var criteria = getDefaultZoneCriteria_();
  var config = {};
  Object.keys(meta).sort().forEach(function(zid) {
    config[zid] = meta[zid];
    config[zid].criteria = criteria[zid] || [];
  });
  return config;
}


// ============================================================================
// DEFAULT CHECKLIST SCHEMA
// ============================================================================

/**
 * Returns the default CHECKLIST_SCHEMA object.
 * 20 criteria across 5 pillars. Each criterion scores 0–4 in weekly audits.
 * Daily checksheets use Pass(1)/Fail(0) per criterion.
 * Total max score for weekly audit: 80 (20 criteria × 4 points each).
 */
function getDefaultChecklistSchema_() {
  return {
    pillars: ["S1", "S2", "S3", "S4", "S5"],
    pillarNames: {
      "S1": { en: "Sort (Seiri)", hi: "छंटाई (सेइरी)" },
      "S2": { en: "Set in Order (Seiton)", hi: "व्यवस्था (सेइतोन)" },
      "S3": { en: "Shine (Seiso)", hi: "सफाई (सेइसो)" },
      "S4": { en: "Standardize (Seiketsu)", hi: "मानकीकरण (सेइकेत्सु)" },
      "S5": { en: "Sustain (Shitsuke)", hi: "अनुशासन (शित्सुके)" }
    },
    criteria: [
      // S1 — Sort
      { id: "S1-C1", pillar: "S1", labelEn: "Unnecessary items removed (Red Tag system used)", labelHi: "अनावश्यक वस्तुएं हटाई गईं (रेड टैग प्रणाली)", maxScore: 4 },
      { id: "S1-C2", pillar: "S1", labelEn: "Red Tag register updated", labelHi: "रेड टैग रजिस्टर अपडेट किया गया", maxScore: 4 },
      { id: "S1-C3", pillar: "S1", labelEn: "Before/after photos for removed items", labelHi: "हटाई गई वस्तुओं के पहले/बाद के फोटो", maxScore: 4 },
      { id: "S1-C4", pillar: "S1", labelEn: "Floor gangways clear and marked", labelHi: "फर्श गैंगवे साफ और चिन्हित", maxScore: 4 },

      // S2 — Set in Order
      { id: "S2-C1", pillar: "S2", labelEn: "Designated places for all items (shadow boards/labels)", labelHi: "सभी वस्तुओं के लिए निर्धारित स्थान", maxScore: 4 },
      { id: "S2-C2", pillar: "S2", labelEn: "Storage areas labelled and colour-coded", labelHi: "भंडारण क्षेत्र लेबल और रंग-कोडित", maxScore: 4 },
      { id: "S2-C3", pillar: "S2", labelEn: "FIFO system maintained for materials", labelHi: "सामग्री के लिए FIFO प्रणाली बनाए रखी", maxScore: 4 },
      { id: "S2-C4", pillar: "S2", labelEn: "Tools returned to designated locations after use", labelHi: "उपयोग के बाद उपकरण निर्धारित स्थानों पर लौटाए गए", maxScore: 4 },

      // S3 — Shine
      { id: "S3-C1", pillar: "S3", labelEn: "Work area clean and free of debris", labelHi: "कार्य क्षेत्र साफ और मलबे से मुक्त", maxScore: 4 },
      { id: "S3-C2", pillar: "S3", labelEn: "Cleaning schedule displayed and followed", labelHi: "सफाई अनुसूची प्रदर्शित और अनुसरण", maxScore: 4 },
      { id: "S3-C3", pillar: "S3", labelEn: "Equipment clean and well-maintained", labelHi: "उपकरण साफ और अच्छी तरह से रखरखाव", maxScore: 4 },
      { id: "S3-C4", pillar: "S3", labelEn: "Waste bins available, labelled, and not overflowing", labelHi: "कचरा पात्र उपलब्ध, लेबल और अतिप्रवाह नहीं", maxScore: 4 },

      // S4 — Standardize
      { id: "S4-C1", pillar: "S4", labelEn: "SOPs displayed at workstations", labelHi: "कार्यस्थलों पर SOP प्रदर्शित", maxScore: 4 },
      { id: "S4-C2", pillar: "S4", labelEn: "Visual management boards updated", labelHi: "दृश्य प्रबंधन बोर्ड अपडेट", maxScore: 4 },
      { id: "S4-C3", pillar: "S4", labelEn: "Standard operating conditions maintained", labelHi: "मानक परिचालन स्थितियां बनाए रखी गईं", maxScore: 4 },
      { id: "S4-C4", pillar: "S4", labelEn: "Safety signage visible and correct", labelHi: "सुरक्षा संकेत दृश्यमान और सही", maxScore: 4 },

      // S5 — Sustain
      { id: "S5-C1", pillar: "S5", labelEn: "5S training records up to date", labelHi: "5S प्रशिक्षण रिकॉर्ड अद्यतित", maxScore: 4 },
      { id: "S5-C2", pillar: "S5", labelEn: "Daily checksheets completed on time", labelHi: "दैनिक चेकशीट समय पर पूर्ण", maxScore: 4 },
      { id: "S5-C3", pillar: "S5", labelEn: "Improvement suggestions submitted this month", labelHi: "इस महीने सुधार सुझाव प्रस्तुत", maxScore: 4 },
      { id: "S5-C4", pillar: "S5", labelEn: "Previous audit NCs closed within target", labelHi: "पिछले ऑडिट NC लक्ष्य के भीतर बंद", maxScore: 4 }
    ],
    totalCriteria: 20,
    maxTotalScore: 80,
    dailyMaxPerCriterion: 1,
    weeklyMaxPerCriterion: 4,
    ncThreshold: 1  // Weekly score <= this value triggers NC
  };
}


// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * First-time setup: writes all configuration to ScriptProperties.
 * Call this ONCE when setting up the project, or from the Admin Menu → Refresh Config.
 * 
 * IMPORTANT: This function also reads from the Zones and ChecklistSchema sheets
 * if they exist and contain data. If they are empty, it uses defaults.
 * After this function runs, no other function should ever read those sheets.
 */
function initScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Criteria are edited in ZONE_CONFIG by the criteria master page, but this
  // function rebuilds ZONE_CONFIG from the 01b_ZoneData defaults -- which would
  // silently discard every edit. Carry the live criteria across the rebuild.
  var liveCriteria = {};
  try {
    var existing = JSON.parse(props.getProperty("ZONE_CONFIG") || "{}");
    Object.keys(existing).forEach(function(zid) {
      if (existing[zid] && existing[zid].criteria && existing[zid].criteria.length) {
        liveCriteria[zid] = existing[zid].criteria;
      }
    });
  } catch (e) {}

  // Attempt to read from Zones sheet; fall back to defaults
  var zoneConfig = getDefaultZoneConfig_();
  var zonesSheet = ss.getSheetByName("Zones");
  if (zonesSheet && zonesSheet.getLastRow() > 1) {
    var zonesData = zonesSheet.getDataRange().getValues(); // BATCH_READ
    var headers = zonesData[0];
    for (var r = 1; r < zonesData.length; r++) {
      var row = zonesData[r];
      var zoneId = String(row[0]).trim();
      if (zoneId && zoneConfig[zoneId]) {
        zoneConfig[zoneId].name = row[1] || zoneConfig[zoneId].name;
        zoneConfig[zoneId].nameHi = row[2] || zoneConfig[zoneId].nameHi;
        zoneConfig[zoneId].leader = row[3] || zoneConfig[zoneId].leader;
        zoneConfig[zoneId].email = row[4] || zoneConfig[zoneId].email;
        zoneConfig[zoneId].auditDay = row[5] || zoneConfig[zoneId].auditDay;
        zoneConfig[zoneId].auditDayNum = row[6] !== undefined ? row[6] : zoneConfig[zoneId].auditDayNum;
        zoneConfig[zoneId].department = row[7] || zoneConfig[zoneId].department;
        // driveFolderId is populated by createAllSheets(), not from this sheet
        if (row[8]) {
          zoneConfig[zoneId].driveFolderId = row[8];
        }
        // targetScore — column J (index 9), written by MasterSettings save
        if (row.length > 9 && row[9] !== "" && row[9] !== null && row[9] !== undefined) {
          zoneConfig[zoneId].targetScore = parseFloat(row[9]) || 70;
        }
      }
    }
  }

  // Attempt to read from ChecklistSchema sheet; fall back to defaults
  var checklistSchema = getDefaultChecklistSchema_();
  var schemaSheet = ss.getSheetByName("ChecklistSchema");
  if (schemaSheet && schemaSheet.getLastRow() > 1) {
    var schemaData = schemaSheet.getDataRange().getValues(); // BATCH_READ
    var customCriteria = [];
    for (var r = 1; r < schemaData.length; r++) {
      var sRow = schemaData[r];
      if (sRow[0] && sRow[1]) {
        customCriteria.push({
          id: String(sRow[0]).trim(),
          pillar: String(sRow[1]).trim(),
          labelEn: String(sRow[2] || ""),
          labelHi: String(sRow[3] || ""),
          maxScore: parseInt(sRow[4], 10) || 4
        });
      }
    }
    // ChecklistSchema is the retired global 20-criterion schema (S1-C1 style).
    // Zones now carry their own criteria (S1-1 style) with helper text, SQCDP
    // and trigger, none of which this sheet has columns for. Applying it would
    // flatten all 28 zones back to the old list, so it is used only as a
    // fallback when no zone has criteria of its own.
    var anyZoneCriteria = Object.keys(zoneConfig).some(function(zid) {
      return zoneConfig[zid].criteria && zoneConfig[zid].criteria.length > 0;
    });
    if (customCriteria.length > 0 && !anyZoneCriteria) {
      checklistSchema.criteria = customCriteria;
      checklistSchema.totalCriteria = customCriteria.length;
      checklistSchema.maxTotalScore = customCriteria.reduce(function(sum, c) { return sum + c.maxScore; }, 0);
      // Rebuild pillars list from criteria
      var pillarSet = {};
      customCriteria.forEach(function(c) { pillarSet[c.pillar] = true; });
      checklistSchema.pillars = Object.keys(pillarSet).sort();
    }
  }

  Object.keys(liveCriteria).forEach(function(zid) {
    if (zoneConfig[zid]) zoneConfig[zid].criteria = liveCriteria[zid];
  });

  // Store everything in ScriptProperties
  props.setProperties({
    "ZONE_CONFIG": JSON.stringify(zoneConfig),
    "CHECKLIST_SCHEMA": JSON.stringify(checklistSchema),
    "DEPLOY_ID": props.getProperty("DEPLOY_ID") || "NOT_SET",
    "QR_VERSION": props.getProperty("QR_VERSION") || "1",
    "CONFIG_VERSION": String((parseInt(props.getProperty("CONFIG_VERSION") || "0", 10) + 1)),
    "MC_EMAIL": props.getProperty("MC_EMAIL") || "tarun.mishra@packmasters.in",
    "TOP_EMAIL": props.getProperty("TOP_EMAIL") || "balkrishna.mishra@packmasters.in",
    "MC_WHITELIST": props.getProperty("MC_WHITELIST") || JSON.stringify([
      "tarun.mishra@packmasters.in"
    ]),
    "SPREADSHEET_ID": ss.getId()
  }, false);

  // Log to AdminLog
  logAdminAction_("initScriptProperties", "Config initialized. Version: " + props.getProperty("CONFIG_VERSION"));

  Logger.log("✅ ScriptProperties initialized. CONFIG_VERSION: " + props.getProperty("CONFIG_VERSION"));
}


/**
 * Refreshes config from Zones and ChecklistSchema sheets into ScriptProperties.
 * This is the ONLY function that reads from those sheets.
 * Called from Admin Menu → Refresh Config.
 */
function refreshConfig() {
  initScriptProperties();
  Logger.log("✅ Config refreshed from Sheets and stored in ScriptProperties.");
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Configuration refreshed successfully. Version: " +
    PropertiesService.getScriptProperties().getProperty("CONFIG_VERSION"),
    "Config Refresh", 5
  );
}


// ============================================================================
// RUNTIME CONFIG READERS
// ============================================================================
// These functions are the ONLY way to read config at runtime.
// They NEVER touch Google Sheets. They read from PropertiesService only.

/**
 * Returns a parsed config value from ScriptProperties.
 * @param {string} key — The ScriptProperties key
 * @returns {*} Parsed JSON value, or raw string if not JSON
 */
function getConfig(key) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  if (val === null) {
    throw new Error("Config key not found: " + key + ". Run initScriptProperties() first.");
  }
  try {
    return JSON.parse(val);
  } catch (e) {
    return val; // Return raw string if not JSON
  }
}

/**
 * Returns the parsed ZONE_CONFIG object.
 * @returns {Object} Zone configuration keyed by zone ID
 */
function getZoneConfig() {
  return getConfig("ZONE_CONFIG");
}

/**
 * Returns the parsed CHECKLIST_SCHEMA object.
 * @returns {Object} Checklist schema with pillars, criteria, totals
 */
function getChecklistSchema() {
  return getConfig("CHECKLIST_SCHEMA");
}

/**
 * Returns an array of all zone IDs.
 * @returns {string[]} e.g. ["Z-01","Z-02",...,"Z-08"]
 */
function getAllZoneIds() {
  var config = getZoneConfig();
  return Object.keys(config).sort();
}



/**
 * Returns the 5S criteria for a specific zone.
 * Falls back to the global CHECKLIST_SCHEMA criteria if the zone has none.
 * @param {string} zoneId
 * @returns {Array}
 */
function getZoneCriteria(zoneId) {
  var config = getZoneConfig();
  if (config[zoneId] && config[zoneId].criteria && config[zoneId].criteria.length > 0) {
    return config[zoneId].criteria;
  }
  return getChecklistSchema().criteria || [];
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Logs an admin action to the AdminLog sheet.
 * @param {string} action — Action name
 * @param {string} details — Description
 * @private
 */
function logAdminAction_(action, details) {
  try {
    var ss = (typeof v2GetSpreadsheet_ === "function") ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("AdminLog");
    if (logSheet) {
      logSheet.appendRow([
        new Date(),
        Session.getActiveUser().getEmail() || "system",
        action,
        details,
        PropertiesService.getScriptProperties().getProperty("CONFIG_VERSION") || "0"
      ]);
    }
  } catch (e) {
    Logger.log("Warning: Could not write to AdminLog: " + e.message);
  }
}

/**
 * Updates the ZONE_CONFIG in ScriptProperties with new Drive folder IDs.
 * Called by 02_SheetSetup.gs after creating zone folders.
 * @param {Object} folderIdMap — { "Z-01": "folderId1", "Z-02": "folderId2", ... }
 */
function updateZoneFolderIds(folderIdMap) {
  var config = getZoneConfig();
  for (var zoneId in folderIdMap) {
    if (config[zoneId]) {
      config[zoneId].driveFolderId = folderIdMap[zoneId];
    }
  }
  PropertiesService.getScriptProperties().setProperty("ZONE_CONFIG", JSON.stringify(config));
  logAdminAction_("updateZoneFolderIds", "Updated folder IDs for " + Object.keys(folderIdMap).length + " zones.");
}

/**
 * DESTRUCTIVE. Resets every zone's criteria in ZONE_CONFIG to the hardcoded
 * defaults in 01b_ZoneData.js, discarding anything entered in the criteria
 * master page. Criteria are now edited in the UI (saveZoneCriteria), so this is
 * a factory reset, not a refresh -- it is no longer the way to publish edits.
 * Folder IDs, names and leaders are left untouched.
 * @returns {Object} { zones: N, updated: N, backupKey: string }
 */
function reseedZoneCriteria() {
  var config = getZoneConfig();
  var defaults = getDefaultZoneCriteria_();
  var updated = 0;
  // Snapshot what is about to be discarded, so a mistaken reset is recoverable.
  var backupKey = 'CRITERIA_BACKUP_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm');
  var snapshot = {};
  Object.keys(config).forEach(function (zid) {
    if (config[zid].criteria) snapshot[zid] = config[zid].criteria;
  });
  try {
    PropertiesService.getScriptProperties().setProperty(backupKey, JSON.stringify(snapshot));
  } catch (e) { backupKey = '(backup failed: ' + e.message + ')'; }

  Object.keys(defaults).forEach(function (zid) {
    if (config[zid]) { config[zid].criteria = defaults[zid]; updated++; }
  });
  PropertiesService.getScriptProperties().setProperty("ZONE_CONFIG", JSON.stringify(config));
  logAdminAction_("reseedZoneCriteria", "RESET criteria for " + updated + " zones to defaults. Backup: " + backupKey);
  return { zones: Object.keys(config).length, updated: updated, backupKey: backupKey };
}


// ============================================================================
// MAP EDITOR — SERVER-SIDE FUNCTIONS
// ============================================================================

/**
 * Returns zone config and floor map layout for the Map Editor page.
 * Callable via google.script.run.getMapEditorData()
 * @returns {{ success:boolean, zones:Object, layout:Object }}
 */
function getMapEditorData() {
  try {
    var zones = getZoneConfig();
    var layoutJson = PropertiesService.getScriptProperties().getProperty('FLOOR_MAP_LAYOUT');
    var layout = layoutJson ? JSON.parse(layoutJson) : {};
    return { success: true, zones: zones, layout: layout };
  } catch (e) {
    logAdminAction_('getMapEditorData_ERROR', e.message);
    return { success: false, message: e.message, zones: {}, layout: {} };
  }
}

/**
 * Saves all zone data and floor map layout from the Map Editor.
 * Writes to the Zones sheet, updates ZONE_CONFIG and FLOOR_MAP_LAYOUT in ScriptProperties.
 * Callable via google.script.run.saveMapEditorData(data)
 * @param {{ zones: Array, layout: Object }} data
 * @returns {{ success:boolean, message:string }}
 */
function saveMapEditorData(data) {
  try {
    if (!data || !data.zones || !Array.isArray(data.zones)) {
      return { success: false, message: 'Invalid data: zones array required.' };
    }

    // Build ZONE_CONFIG object from zones array
    var newZoneConfig = {};
    data.zones.forEach(function(z) {
      if (!z.id || !/^Z-\d{2}$/.test(z.id)) return;
      newZoneConfig[z.id] = {
        id: z.id,
        name: z.name || '',
        nameHi: z.nameHi || '',
        leader: z.leader || '',
        email: z.email || '',
        auditDay: z.auditDay || 'Monday',
        auditDayNum: parseInt(z.auditDayNum, 10) || 1,
        department: z.dept || z.department || '',
        driveFolderId: z.driveFolderId || ''
      };
      if (z.targetScore) {
        newZoneConfig[z.id].targetScore = parseFloat(z.targetScore) || 70;
      }
    });

    if (Object.keys(newZoneConfig).length === 0) {
      return { success: false, message: 'No valid zones provided (IDs must match Z-XX format).' };
    }

    // Write zones to the Zones sheet (clear rows 2+ then rewrite)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (!zonesSheet) {
      return { success: false, message: 'Zones sheet not found in spreadsheet.' };
    }
    var lastRow = zonesSheet.getLastRow();
    if (lastRow > 1) {
      zonesSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
    }
    var sortedIds = Object.keys(newZoneConfig).sort();
    var rows = sortedIds.map(function(id) {
      var z = newZoneConfig[id];
      return [z.id, z.name, z.nameHi, z.leader, z.email,
              z.auditDay, z.auditDayNum, z.department, z.driveFolderId,
              z.targetScore || ''];
    });
    if (rows.length > 0) {
      zonesSheet.getRange(2, 1, rows.length, 10).setValues(rows);
    }

    // Save ZONE_CONFIG and FLOOR_MAP_LAYOUT directly to ScriptProperties
    var props = PropertiesService.getScriptProperties();
    props.setProperty('ZONE_CONFIG', JSON.stringify(newZoneConfig));
    props.setProperty('FLOOR_MAP_LAYOUT', JSON.stringify(data.layout || {}));

    logAdminAction_('SAVE_MAP_EDITOR', 'zones:' + sortedIds.length + ' layout-keys:' + Object.keys(data.layout || {}).length);
    return { success: true, message: 'Saved ' + sortedIds.length + ' zones and floor layout.' };

  } catch (e) {
    logAdminAction_('SAVE_MAP_EDITOR_ERROR', e.message);
    return { success: false, message: 'Save failed: ' + e.message };
  }
}

/**
 * Adds a single new zone. Validates ID format and checks for duplicates.
 * Public wrapper for addZone_().
 * @param {Object} zoneObj — {id, name, nameHi?, leader?, email?, auditDay?, dept?}
 * @returns {{ success:boolean, message:string }}
 */
function addZone(zoneObj) {
  return addZone_(zoneObj);
}

/** @private */
function addZone_(zoneObj) {
  try {
    if (!zoneObj || !zoneObj.id) return { success: false, message: 'Zone ID is required.' };
    if (!/^Z-\d{2}$/.test(zoneObj.id)) {
      return { success: false, message: 'Zone ID must match format Z-XX (e.g. Z-09).' };
    }

    var config = getZoneConfig();
    if (config[zoneObj.id]) {
      return { success: false, message: 'Zone ' + zoneObj.id + ' already exists.' };
    }

    config[zoneObj.id] = {
      id: zoneObj.id,
      name: zoneObj.name || zoneObj.id,
      nameHi: zoneObj.nameHi || '',
      leader: zoneObj.leader || '',
      email: zoneObj.email || '',
      auditDay: zoneObj.auditDay || 'Monday',
      auditDayNum: parseInt(zoneObj.auditDayNum, 10) || 1,
      department: zoneObj.dept || zoneObj.department || '',
      driveFolderId: zoneObj.driveFolderId || ''
    };

    // Append row to Zones sheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (zonesSheet) {
      var z = config[zoneObj.id];
      zonesSheet.appendRow([z.id, z.name, z.nameHi, z.leader, z.email,
                            z.auditDay, z.auditDayNum, z.department, z.driveFolderId, '']);
    }

    PropertiesService.getScriptProperties().setProperty('ZONE_CONFIG', JSON.stringify(config));
    logAdminAction_('ADD_ZONE', zoneObj.id + ': ' + (zoneObj.name || ''));
    return { success: true, message: 'Zone ' + zoneObj.id + ' added successfully.' };

  } catch (e) {
    return { success: false, message: 'Add zone failed: ' + e.message };
  }
}

/**
 * Deletes a zone by ID. Clears the matching row in the Zones sheet (does NOT delete the row).
 * Public wrapper for deleteZone_().
 * @param {string} zoneId — e.g. "Z-09"
 * @returns {{ success:boolean, message:string }}
 */
function deleteZone(zoneId) {
  return deleteZone_(zoneId);
}

/** @private */
function deleteZone_(zoneId) {
  try {
    if (!zoneId) return { success: false, message: 'Zone ID required.' };

    var config = getZoneConfig();
    if (!config[zoneId]) return { success: false, message: 'Zone ' + zoneId + ' not found.' };

    delete config[zoneId];
    PropertiesService.getScriptProperties().setProperty('ZONE_CONFIG', JSON.stringify(config));

    // Clear matching row in Zones sheet (preserve row numbering)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (zonesSheet && zonesSheet.getLastRow() > 1) {
      var sheetData = zonesSheet.getRange(2, 1, zonesSheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < sheetData.length; i++) {
        if (String(sheetData[i][0]).trim() === zoneId) {
          zonesSheet.getRange(i + 2, 1, 1, 10).clearContent();
          break;
        }
      }
    }

    logAdminAction_('DELETE_ZONE', zoneId);
    return { success: true, message: 'Zone ' + zoneId + ' deleted.' };

  } catch (e) {
    return { success: false, message: 'Delete zone failed: ' + e.message };
  }
}

/**
 * Returns the floor map layout from ScriptProperties.
 * Callable via google.script.run.getFloorMapLayout()
 * @returns {Object|null} Layout object or null if not set
 */
function getFloorMapLayout() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('FLOOR_MAP_LAYOUT');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Saves the criteria list for one zone into ZONE_CONFIG.
 *
 * ZONE_CONFIG is already the per-zone criteria store that getZoneCriteria()
 * reads, so criteria are edited in place rather than mirrored into a sheet --
 * a second source of truth would only add a sync bug to maintain.
 *
 * ponytail: all 28 zones share one ScriptProperty (~180KB of 500KB today).
 * If it approaches the cap, split to one CRITERIA_<zoneId> key per zone.
 *
 * @param {string} zoneId    e.g. "Z-01"
 * @param {Array}  criteria  criterion objects; see getDefaultZoneCriteria_()
 * @returns {{success:boolean, message:string, count:number}}
 */
function saveZoneCriteria(zoneId, criteria) {
  try {
    if (!zoneId) return { success: false, message: 'Zone ID required.', count: 0 };
    if (!Array.isArray(criteria)) return { success: false, message: 'Criteria must be an array.', count: 0 };

    var config = getZoneConfig();
    if (!config[zoneId]) return { success: false, message: 'Zone ' + zoneId + ' not found.', count: 0 };

    var SQ = ['S', 'Q', 'C', 'D', 'P'];
    var seen = {}, clean = [];
    for (var i = 0; i < criteria.length; i++) {
      var c = criteria[i] || {};
      var id = String(c.id || '').trim();
      if (!id) return { success: false, message: 'Criterion ' + (i + 1) + ' has no id.', count: 0 };
      if (seen[id]) return { success: false, message: 'Duplicate criterion id: ' + id, count: 0 };
      seen[id] = true;

      var sq = {};
      for (var k = 0; k < SQ.length; k++) sq[SQ[k]] = !!(c.sqdcp && c.sqdcp[SQ[k]]);

      clean.push({
        id: id,
        pillar: String(c.pillar || id.split('-')[0] || '').trim(),
        labelEn: String(c.labelEn || ''),
        labelHi: String(c.labelHi || ''),
        helperEn: String(c.helperEn || ''),
        helperHi: String(c.helperHi || ''),
        sqdcp: sq,
        trigger: String(c.trigger || ''),
        maxScore: parseInt(c.maxScore, 10) || 4,
        active: c.active === false ? false : true
      });
    }

    config[zoneId].criteria = clean;
    var payload = JSON.stringify(config);

    // Fail loudly rather than let setProperty truncate silently.
    if (payload.length > 480000) {
      return { success: false, count: 0,
               message: 'ZONE_CONFIG would be ' + payload.length + ' bytes, over the safe limit. Split per-zone keys before adding more.' };
    }

    PropertiesService.getScriptProperties().setProperty('ZONE_CONFIG', payload);
    logAdminAction_('saveZoneCriteria', zoneId + ': ' + clean.length + ' criteria');
    return { success: true, message: 'Saved ' + clean.length + ' criteria for ' + zoneId + '.', count: clean.length };

  } catch (e) {
    return { success: false, message: 'Save failed: ' + e.message, count: 0 };
  }
}

/**
 * Returns every zone id -> criteria in one call, so the criteria editor can
 * load the whole plant once and switch zones client-side with no round trip.
 * @returns {Object} { zones: {id:{name,criteria}}, totalCriteria: n }
 */
function getAllZoneCriteria() {
  var config = getZoneConfig() || {};
  var out = {}, total = 0;
  Object.keys(config).sort().forEach(function(zid) {
    var c = config[zid].criteria || [];
    out[zid] = { name: config[zid].name || zid, criteria: c };
    total += c.length;
  });
  return { zones: out, totalCriteria: total };
}

/**
 * Restores zone criteria from a CRITERIA_BACKUP_* snapshot written by
 * reseedZoneCriteria(). Pass the key it returned.
 * @param {string} backupKey
 * @returns {{success:boolean, message:string, restored:number}}
 */
function restoreZoneCriteria(backupKey) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(backupKey);
    if (!raw) return { success: false, message: 'No backup found for key ' + backupKey, restored: 0 };
    var snapshot = JSON.parse(raw);
    var config = getZoneConfig();
    var n = 0;
    Object.keys(snapshot).forEach(function (zid) {
      if (config[zid]) { config[zid].criteria = snapshot[zid]; n++; }
    });
    props.setProperty('ZONE_CONFIG', JSON.stringify(config));
    logAdminAction_('restoreZoneCriteria', 'Restored ' + n + ' zones from ' + backupKey);
    return { success: true, message: 'Restored criteria for ' + n + ' zones.', restored: n };
  } catch (e) {
    return { success: false, message: 'Restore failed: ' + e.message, restored: 0 };
  }
}
