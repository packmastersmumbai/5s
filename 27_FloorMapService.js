/**
 * ============================================================================
 * 27_FloorMapService.gs — PackMasters 5S v2.0
 * Plan C: Floor Map Editor — Backend Service
 * ============================================================================
 *
 * Provides:
 *   getFloorMapData_()         — Returns layout + live scores (cached 5 min)
 *   saveFloorMapLayout_(json)  — RBAC-gated layout writer
 *   colorForScore_(score)      — Colour helper
 *
 * Sheet: FloorMapConfig (zone_id | x | y | width | height | label | floor_level)
 * If FloorMapConfig sheet does not exist, returns mock data for 3 sample zones.
 * ============================================================================
 */

// ── Column indices for FloorMapConfig sheet (0-based) ──────────────────────
var FM_COL = {
  ZONE_ID:     0,
  X:           1,
  Y:           2,
  WIDTH:       3,
  HEIGHT:      4,
  LABEL:       5,
  FLOOR_LEVEL: 6
};

var FM_CACHE_KEY = "floorMapData";

// ── Colour thresholds ───────────────────────────────────────────────────────
function colorForScore_(score) {
  if (score === null || score === undefined || isNaN(score)) return "#94A3B8";
  if (score >= 80) return "#22C55E";
  if (score >= 60) return "#F59E0B";
  return "#EF4444";
}

// ── Mock data (returned when FloorMapConfig sheet is absent) ────────────────
function getFloorMapMockData_() {
  return {
    zones: [
      {
        id: "Z-01", label: "Zone 01 — Assembly",
        x: 60, y: 60, width: 280, height: 200,
        floorLevel: "GF",
        score: 82, color: "#22C55E",
        openCAPAs: 1, openRedTags: 0, hasOverdueItems: false
      },
      {
        id: "Z-02", label: "Zone 02 — Packaging",
        x: 380, y: 60, width: 280, height: 200,
        floorLevel: "GF",
        score: 67, color: "#F59E0B",
        openCAPAs: 3, openRedTags: 2, hasOverdueItems: true
      },
      {
        id: "Z-03", label: "Zone 03 — Warehouse",
        x: 700, y: 60, width: 240, height: 200,
        floorLevel: "GF",
        score: 45, color: "#EF4444",
        openCAPAs: 5, openRedTags: 4, hasOverdueItems: true
      }
    ],
    timestamp: Date.now(),
    isMock: true
  };
}

// ── Main data function ──────────────────────────────────────────────────────
/**
 * Returns floor map layout merged with live 5S scores.
 * Uses 5-min CacheService cache.
 * Falls back to mock data if FloorMapConfig sheet is missing.
 *
 * @returns {Object} { zones: [...], timestamp: ms, isMock: bool }
 */
function getFloorMapData_() {
  // Try cache first
  try {
    var cached = CacheService.getScriptCache().get(FM_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch(e) { /* ignore cache errors */ }

  var result = v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var fmSheet = ss.getSheetByName("FloorMapConfig");

    // ── Layout ────────────────────────────────────────────────────────────
    var layout = [];
    if (!fmSheet || fmSheet.getLastRow() <= 1) {
      // No sheet — return mock immediately (cached too)
      var mock = getFloorMapMockData_();
      try { CacheService.getScriptCache().put(FM_CACHE_KEY, JSON.stringify(mock), 300); } catch(ce) {}
      return mock;
    }

    var fmData = fmSheet.getDataRange().getValues(); // BATCH_READ
    for (var r = 1; r < fmData.length; r++) {
      var row = fmData[r];
      var zid = String(row[FM_COL.ZONE_ID] || "").trim();
      if (!zid) continue;
      layout.push({
        id:         zid,
        label:      String(row[FM_COL.LABEL] || zid),
        x:          parseFloat(row[FM_COL.X]) || 60,
        y:          parseFloat(row[FM_COL.Y]) || 60,
        width:      parseFloat(row[FM_COL.WIDTH]) || 200,
        height:     parseFloat(row[FM_COL.HEIGHT]) || 150,
        floorLevel: String(row[FM_COL.FLOOR_LEVEL] || "GF")
      });
    }

    if (layout.length === 0) {
      var mock2 = getFloorMapMockData_();
      try { CacheService.getScriptCache().put(FM_CACHE_KEY, JSON.stringify(mock2), 300); } catch(ce) {}
      return mock2;
    }

    // ── Latest 5S scores from DailySubmissions ───────────────────────────
    var scoreMap = {};
    var dsSheet = ss.getSheetByName("DailySubmissions");
    if (dsSheet && dsSheet.getLastRow() > 1) {
      var dsData = dsSheet.getDataRange().getValues(); // BATCH_READ
      // Walk newest→oldest; keep only first (latest) score per zone
      for (var d = dsData.length - 1; d >= 1; d--) {
        var dsRow = dsData[d];
        var dsZone = String(dsRow[DS_COL.ZONE_ID] || "").trim();
        if (!dsZone || scoreMap[dsZone] !== undefined) continue;
        var isDup = dsRow[DS_COL.IS_DUPLICATE];
        if (isDup === true || isDup === "TRUE" || isDup === 1) continue;
        var pct = parseFloat(dsRow[DS_COL.PCT_SCORE]);
        scoreMap[dsZone] = isNaN(pct) ? null : Math.round(pct);
      }
    }

    // ── Open CAPA counts from NC_CAPA ────────────────────────────────────
    var capaMap = {};
    var capaSheet = ss.getSheetByName("NC_CAPA");
    if (capaSheet && capaSheet.getLastRow() > 1) {
      var capaData = capaSheet.getDataRange().getValues(); // BATCH_READ
      for (var c = 1; c < capaData.length; c++) {
        var capaRow = capaData[c];
        var capaZone = String(capaRow[NC_COL.ZONE_ID] || "").trim();
        var capaStatus = String(capaRow[NC_COL.STATUS] || "").trim();
        if (!capaZone) continue;
        if (capaStatus === STATUS.CLOSED || capaStatus === STATUS.DELETED) continue;
        capaMap[capaZone] = (capaMap[capaZone] || 0) + 1;
      }
    }

    // ── Open RedTag counts from RedTagRegister ───────────────────────────
    var rtMap = {};
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var overdueMap = {};
    var rtSheet = ss.getSheetByName("RedTagRegister");
    if (rtSheet && rtSheet.getLastRow() > 1) {
      var rtData = rtSheet.getDataRange().getValues(); // BATCH_READ
      for (var t = 1; t < rtData.length; t++) {
        var rtRow = rtData[t];
        var rtZone = String(rtRow[RT_COL.ZONE_ID] || "").trim();
        var rtStatus = String(rtRow[RT_COL.STATUS] || "").trim();
        if (!rtZone) continue;
        if (rtStatus === STATUS.DISPOSED || rtStatus === STATUS.CLOSED || rtStatus === STATUS.DELETED) continue;
        rtMap[rtZone] = (rtMap[rtZone] || 0) + 1;
        // Check overdue
        var deadline = rtRow[RT_COL.DEADLINE];
        if (deadline instanceof Date && deadline < today) {
          overdueMap[rtZone] = true;
        }
      }
    }

    // ── Merge ────────────────────────────────────────────────────────────
    var zones = layout.map(function(z) {
      var score = (scoreMap[z.id] !== undefined) ? scoreMap[z.id] : null;
      return {
        id:              z.id,
        label:           z.label,
        x:               z.x,
        y:               z.y,
        width:           z.width,
        height:          z.height,
        floorLevel:      z.floorLevel,
        score:           score,
        color:           colorForScore_(score),
        openCAPAs:       capaMap[z.id] || 0,
        openRedTags:     rtMap[z.id] || 0,
        hasOverdueItems: !!(overdueMap[z.id])
      };
    });

    return { zones: zones, timestamp: Date.now(), isMock: false };

  }, "getFloorMapData_", getFloorMapMockData_());

  // Cache the result
  try { CacheService.getScriptCache().put(FM_CACHE_KEY, JSON.stringify(result), 300); } catch(ce) {}
  return result;
}

// Public wrapper callable from client via google.script.run
function getFloorMapData() {
  return getFloorMapData_();
}

// ── Save layout (RBAC-gated) ────────────────────────────────────────────────
/**
 * Saves the floor map layout back to FloorMapConfig sheet.
 * RBAC: requires ADMIN or MANAGER role.
 *
 * @param {string} layoutJSON — JSON string: array of zone layout objects
 * @returns {Object} { success: bool, message: string }
 */
function saveFloorMapLayout_(layoutJSON) {
  try {
    // RBAC check — uses existing v2CheckPermission_ from 16A_V2Foundation
    v2CheckPermission_("EDIT_ZONE_CONFIG", v2GetCurrentUser_());
  } catch(e) {
    return { success: false, message: "Access denied: " + e.message };
  }

  try {
    var zones = JSON.parse(layoutJSON);
    if (!Array.isArray(zones) || zones.length === 0) {
      return { success: false, message: "Invalid layout data: expected non-empty array." };
    }

    // Validate each entry
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (!z.id || typeof z.x !== "number" || typeof z.y !== "number" ||
          typeof z.width !== "number" || typeof z.height !== "number") {
        return { success: false, message: "Invalid zone entry at index " + i + ": missing required fields." };
      }
      // Sanity bounds (SVG viewBox 0 0 1000 600)
      if (z.x < 0 || z.y < 0 || z.width < 20 || z.height < 20 ||
          z.x + z.width > 1100 || z.y + z.height > 700) {
        return { success: false, message: "Zone " + z.id + " has out-of-bounds geometry." };
      }
    }

    var ss = v2GetSpreadsheet_();
    var fmSheet = ss.getSheetByName("FloorMapConfig");

    if (!fmSheet) {
      // Create the sheet with headers
      fmSheet = ss.insertSheet("FloorMapConfig");
      fmSheet.appendRow(["zone_id", "x", "y", "width", "height", "label", "floor_level"]);
    }

    // Clear existing data rows (keep header)
    var lastRow = fmSheet.getLastRow();
    if (lastRow > 1) {
      fmSheet.getRange(2, 1, lastRow - 1, 7).clearContent();
    }

    // Write new rows
    var rows = zones.map(function(z) {
      return [
        String(z.id).replace(/[^A-Za-z0-9\-_]/g, ""),
        Math.round(z.x),
        Math.round(z.y),
        Math.round(z.width),
        Math.round(z.height),
        String(z.label || z.id).substring(0, 100),
        String(z.floorLevel || "GF").substring(0, 10)
      ];
    });

    if (rows.length > 0) {
      fmSheet.getRange(2, 1, rows.length, 7).setValues(rows);
    }

    // Invalidate cache
    try { CacheService.getScriptCache().remove(FM_CACHE_KEY); } catch(ce) {}

    Logger.log("FloorMapLayout saved: " + zones.length + " zones by " + v2GetCurrentUser_());
    return { success: true, message: "Layout saved for " + zones.length + " zones." };

  } catch(e) {
    Logger.log("saveFloorMapLayout_ error: " + e.message);
    return { success: false, message: "Save failed: " + e.message };
  }
}

// Public wrapper callable from client
function saveFloorMapLayout(layoutJSON) {
  return saveFloorMapLayout_(layoutJSON);
}
