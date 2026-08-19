/**
 * ============================================================================
 * 27_CacheManager.js — PackMasters 5S v2.0
 * Centralized Cache Invalidation System
 * ============================================================================
 *
 * Manages all CacheService keys and provides centralized invalidation.
 * Ensures data consistency by invalidating caches when relevant sheets change.
 *
 * Cache Strategy:
 *   • 5-minute TTL for aggregation queries (SQCDP, Actions, Kaizen, etc.)
 *   • Invalidate on write operations (create, update, delete)
 *   • Support zone-specific and plant-wide cache keys
 *
 * Key Functions:
 *   v2InvalidateCache(sheet, zoneId) — Invalidate specific cache
 *   v2InvalidateCacheForZone(zoneId) — Invalidate all caches for a zone
 *   v2ClearAllCaches() — Nuclear option: clear everything
 */

// ============================================================================
// CACHE KEY REGISTRY
// ============================================================================

var CACHE_KEYS = {
  // SQCDP Board data (by zone or ALL)
  SQCDP: "pm5s_sqcdp_{zone}",

  // Auto-generated action list
  ACTIONS: "pm5s_actions_{zone}",

  // Kaizen board data
  KAIZEN: "pm5s_kaizen_{zone}",

  // Kanban/CAPA data
  CAPA_KANBAN: "pm5s_capa_kanban_{zone}",

  // Red Tag data
  RED_TAGS: "pm5s_redtags_{zone}",

  // Task board data
  TASKS: "pm5s_tasks_{zone}",

  // Summary/zone summary
  ZONE_SUMMARY: "pm5s_summary_{zone}",

  // Shift handover data
  SHIFT_HANDOVER: "pm5s_handover_{zone}",

  // Gemba walk data
  GEMBA: "pm5s_gemba_{zone}",

  // Floor map summary
  FLOOR_MAP: "pm5s_floormap_{zone}",

  // Config caches (loaded once at startup, rarely change)
  ZONE_CONFIG: "pm5s_zone_config",
  CHECKLIST_SCHEMA: "pm5s_checklist_schema"
};

// Map of sheet names to cache keys that depend on them
var SHEET_CACHE_DEPENDENCIES = {
  "DailySubmissions": [CACHE_KEYS.SQCDP, CACHE_KEYS.ZONE_SUMMARY, CACHE_KEYS.FLOOR_MAP],
  "WeeklyAudit": [CACHE_KEYS.SQCDP, CACHE_KEYS.ZONE_SUMMARY, CACHE_KEYS.FLOOR_MAP],
  "NC_CAPA": [CACHE_KEYS.SQCDP, CACHE_KEYS.ACTIONS, CACHE_KEYS.CAPA_KANBAN, CACHE_KEYS.ZONE_SUMMARY],
  "TaskBoard": [CACHE_KEYS.ACTIONS, CACHE_KEYS.TASKS, CACHE_KEYS.ZONE_SUMMARY],
  "RedTagRegister": [CACHE_KEYS.SQCDP, CACHE_KEYS.RED_TAGS, CACHE_KEYS.ZONE_SUMMARY],
  "KaizenSuggestions": [CACHE_KEYS.KAIZEN, CACHE_KEYS.ZONE_SUMMARY],
  "GembaWalks": [CACHE_KEYS.SQCDP, CACHE_KEYS.GEMBA, CACHE_KEYS.ZONE_SUMMARY],
  "ShiftHandover": [CACHE_KEYS.SHIFT_HANDOVER],
  "TrainingLog": [CACHE_KEYS.SQCDP, CACHE_KEYS.ZONE_SUMMARY],
  "Zones": [CACHE_KEYS.ZONE_CONFIG, CACHE_KEYS.SQCDP, CACHE_KEYS.ACTIONS, CACHE_KEYS.ZONE_SUMMARY, CACHE_KEYS.FLOOR_MAP],
  "ChecklistSchema": [CACHE_KEYS.CHECKLIST_SCHEMA, CACHE_KEYS.SQCDP, CACHE_KEYS.ZONE_SUMMARY]
};

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidates cache for a specific operation on a sheet.
 * Invalidates all dependent caches for all zones.
 *
 * @param {string} sheetName — Sheet that was modified (e.g., "NC_CAPA")
 * @param {string} [zoneId] — Optional: if provided, only invalidate for this zone
 * @returns {Array} Array of invalidated cache keys
 */
function v2InvalidateCache(sheetName, zoneId) {
  try {
    var cache = CacheService.getScriptCache();
    var invalidated = [];

    // Get dependent cache keys for this sheet
    var dependentKeys = SHEET_CACHE_DEPENDENCIES[sheetName] || [];

    if (dependentKeys.length === 0) {
      return invalidated; // Sheet has no cache dependencies
    }

    // If zoneId provided, only invalidate for that zone
    if (zoneId) {
      dependentKeys.forEach(function(keyTemplate) {
        var key = keyTemplate.replace("{zone}", zoneId);
        try {
          cache.remove(key);
          invalidated.push(key);
        } catch (e) {
          Logger.log("  ⚠️ Could not invalidate " + key + ": " + e.message);
        }
      });
    } else {
      // Invalidate for all zones (get zone list from config)
      var zoneConfig = v2GetZoneConfig_();
      var zoneIds = Object.keys(zoneConfig);

      // Invalidate for each zone
      zoneIds.forEach(function(zid) {
        dependentKeys.forEach(function(keyTemplate) {
          var key = keyTemplate.replace("{zone}", zid);
          try {
            cache.remove(key);
            invalidated.push(key);
          } catch (e) {
            // Silently fail if key doesn't exist
          }
        });
      });

      // Also invalidate plant-wide caches (zone=ALL)
      dependentKeys.forEach(function(keyTemplate) {
        var key = keyTemplate.replace("{zone}", "ALL");
        try {
          cache.remove(key);
          invalidated.push(key);
        } catch (e) {
          // Silently fail if key doesn't exist
        }
      });
    }

    if (invalidated.length > 0) {
      logSecurityEvent_("CACHE_INVALIDATED", "v2InvalidateCache", v2GetCurrentUser_(), {
        sheet: sheetName,
        zone: zoneId || "ALL",
        keysInvalidated: invalidated.length
      });
    }

    return invalidated;
  } catch (e) {
    Logger.log("Error invalidating cache: " + e.message);
    return [];
  }
}

/**
 * Invalidates ALL caches for a specific zone.
 * Called when zone configuration changes.
 *
 * @param {string} zoneId — Zone ID to invalidate
 * @returns {Array} Invalidated keys
 */
function v2InvalidateCacheForZone(zoneId) {
  try {
    var cache = CacheService.getScriptCache();
    var invalidated = [];

    Object.keys(CACHE_KEYS).forEach(function(keyName) {
      var keyTemplate = CACHE_KEYS[keyName];
      var key = keyTemplate.replace("{zone}", zoneId);
      try {
        cache.remove(key);
        invalidated.push(key);
      } catch (e) {
        // Key may not exist
      }
    });

    logSecurityEvent_("CACHE_ZONE_CLEARED", "v2InvalidateCacheForZone", v2GetCurrentUser_(), {
      zone: zoneId,
      keysInvalidated: invalidated.length
    });

    return invalidated;
  } catch (e) {
    Logger.log("Error invalidating zone cache: " + e.message);
    return [];
  }
}

/**
 * NUCLEAR OPTION: Clears all caches.
 * Use only for:
 *   - Config migrations
 *   - Data restores
 *   - Emergency troubleshooting
 *
 * @returns {Object} { success: bool, keysCleared: int }
 */
function v2ClearAllCaches() {
  try {
    var cache = CacheService.getScriptCache();
    var keysCleared = 0;

    // Clear all registered cache keys for all zones
    var zoneConfig = v2GetZoneConfig_();
    var zoneIds = Object.keys(zoneConfig);
    zoneIds.push("ALL"); // Also clear plant-wide caches

    Object.keys(CACHE_KEYS).forEach(function(keyName) {
      var keyTemplate = CACHE_KEYS[keyName];
      zoneIds.forEach(function(zid) {
        var key = keyTemplate.replace("{zone}", zid);
        try {
          cache.remove(key);
          keysCleared++;
        } catch (e) {
          // Key may not exist
        }
      });
    });

    logSecurityEvent_("CACHE_CLEARED_ALL", "v2ClearAllCaches", v2GetCurrentUser_(), {
      keysCleared: keysCleared
    });

    Logger.log("✅ All caches cleared: " + keysCleared + " keys");
    return { success: true, keysCleared: keysCleared };
  } catch (e) {
    Logger.log("Error clearing all caches: " + e.message);
    return { success: false, message: e.message };
  }
}

// ============================================================================
// CACHE STATISTICS & MONITORING
// ============================================================================


// ============================================================================
// INTEGRATION HOOKS — Call these in CRUD operations
// ============================================================================

/**
 * AUTO-INVALIDATION HELPERS
 * Call these in createRedTag(), editRedTag(), deleteRedTag(), etc.
 */

function invalidateRedTagCache_(zoneId) {
  v2InvalidateCache("RedTagRegister", zoneId);
}

function invalidateTaskCache_(zoneId) {
  v2InvalidateCache("TaskBoard", zoneId);
}


// ============================================================================
// CACHE HEALTH CHECK
// ============================================================================

/**
 * Validates cache system is working.
 * Called during system health check.
 *
 * @returns {Object} { working: bool, issues: [] }
 */
function v2CacheHealthCheck() {
  var issues = [];
  try {
    var cache = CacheService.getScriptCache();
    var testKey = "pm5s_health_test_" + new Date().getTime();
    var testValue = JSON.stringify({ test: true });

    // Test write
    try {
      cache.put(testKey, testValue, 60);
    } catch (e) {
      issues.push("Cache write failed: " + e.message);
    }

    // Test read
    try {
      var retrieved = cache.get(testKey);
      if (!retrieved) {
        issues.push("Cache read returned null after write");
      }
    } catch (e) {
      issues.push("Cache read failed: " + e.message);
    }

    // Cleanup
    try {
      cache.remove(testKey);
    } catch (e) {
      // Silent cleanup failure
    }

    return {
      working: issues.length === 0,
      issues: issues,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return {
      working: false,
      issues: ["CacheService unavailable: " + e.message],
      timestamp: new Date().toISOString()
    };
  }
}
