/**
 * ============================================================================
 * 21_ImprovementEngine.gs — PackMasters 5S v2.0
 * IMPROVEMENT ENGINE: 12 Strategic Improvements (IMP-01 through IMP-12)
 * ============================================================================
 *
 * Depends on: 16A_V2Foundation.gs (constants, utilities)
 *             17_AlertEngine.gs (alert rules)
 *             19_KanbanTaskService.gs (CRUD operations)
 *             20_EnhancedWebApp.gs (routing)
 *
 * IMP-01: SQCDP Daily Management Board
 * IMP-02: Auto-Generated Action List (Digital Andon)
 * IMP-03: One-Tap Quick Audit
 * IMP-04: Shift Handover Digital Log
 * IMP-05: Auto-Generated MRM Report Pack
 * IMP-06: Risk Register with Auto-Classification
 * IMP-07: Integrated IMS Audit (environment criteria)
 * IMP-08: Kaizen Impact Tracker with ROI
 * IMP-09: Predictive Trend Alerts
 * IMP-10: Visual Standard (WDGLL) Comparison
 * IMP-11: Tiered Meeting Dashboard (Tier 1/2/3)
 * IMP-12: One-Point Lesson (OPL) Generator
 * ============================================================================
 */

// ============================================================================
// IMP-01: SQCDP DAILY MANAGEMENT BOARD
// ============================================================================
// Aggregates Safety, Quality, Cost, Delivery, People into one per-zone view.
// Red = needs action, Green = on target.

/**
 * Returns SQCDP board data for all zones (or one zone).
 * @param {string} [zoneId] — Optional filter
 * @returns {Object} { zones: [...], plant: {...}, generated: string }
 */
function getSQCDPBoardData(zoneId) {
  return v2SafeExecute_(function() {
    V2_PROFILER.start("getSQCDPBoardData");

    var cacheKey = "pm5s_sqcdp_" + (zoneId || "ALL");
    try { var cached = CacheService.getScriptCache().get(cacheKey); if (cached) return JSON.parse(cached); } catch(e) {}
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var zoneIds = zoneId ? [zoneId] : Object.keys(config);
    var now = new Date();
    var todayStr = Utilities.formatDate(now, TZ, "yyyy-MM-dd");

    // Load data once
    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var rtData = v2LoadSheet_(ss, "RedTagRegister");
    var taskData = v2LoadSheet_(ss, "TaskBoard");
    var trData = v2LoadSheet_(ss, "TrainingLog");
    var safetyData = v2LoadSheet_(ss, "GembaWalks");
    var kzData = v2LoadSheet_(ss, "KaizenSuggestions");

    // Pre-index all datasets by zoneId — eliminates O(zones × rows) loops
    var ncByZone = {}, dailyByZone = {}, rtByZone = {}, taskByZone = {}, trByZone = {};
    for (var ri = 1; ri < ncData.length; ri++) {
      var z_ = String(ncData[ri][NC_COL.ZONE_ID]);
      if (!ncByZone[z_]) ncByZone[z_] = [];
      ncByZone[z_].push(ncData[ri]);
    }
    for (var ri2 = 1; ri2 < dailyData.length; ri2++) {
      var z2_ = String(dailyData[ri2][DS_COL.ZONE_ID]).trim();
      if (!dailyByZone[z2_]) dailyByZone[z2_] = [];
      dailyByZone[z2_].push(dailyData[ri2]);
    }
    for (var ri3 = 1; ri3 < rtData.length; ri3++) {
      var z3_ = String(rtData[ri3][RT_COL.ZONE_ID]);
      if (!rtByZone[z3_]) rtByZone[z3_] = [];
      rtByZone[z3_].push(rtData[ri3]);
    }
    for (var ri4 = 1; ri4 < taskData.length; ri4++) {
      var z4_ = String(taskData[ri4][TASK_COL.ZONE_ID]);
      if (!taskByZone[z4_]) taskByZone[z4_] = [];
      taskByZone[z4_].push(taskData[ri4]);
    }
    for (var ri5 = 1; ri5 < trData.length; ri5++) {
      var z5_ = String(trData[ri5][TR_COL.ZONE_ID]);
      if (!trByZone[z5_]) trByZone[z5_] = [];
      trByZone[z5_].push(trData[ri5]);
    }

    var zones = [];
    var plantTotals = { S: 0, Q: 0, C: 0, D: 0, P: 0, total: 0, green: 0 };
    var warnings = [];
    var isPartial = false;

    // Use for loop instead of forEach to allow early break on timeout
    for (var zIdx = 0; zIdx < zoneIds.length; zIdx++) {
      // Check if approaching 6-minute limit (warn at 5 min)
      if (V2_PROFILER.isNearLimit()) {
        isPartial = true;
        warnings.push("⏱️ Timeout: Showing data for " + zones.length + " of " + zoneIds.length + " zones. Refresh to retry remaining zones.");
        logSecurityEvent_("TIMEOUT_WARNING", "getSQCDPBoardData partial result", v2GetCurrentUser_(), {
          zonesProcessed: zones.length,
          totalZones: zoneIds.length,
          elapsedSeconds: V2_PROFILER.elapsed()
        });
        break;
      }

      var zid = zoneIds[zIdx];
      var zone = config[zid] || {};
      var z = { zoneId: zid, zoneName: zone.name || zid, sqcdp: {} };
      var zNc = ncByZone[zid] || [];
      var zDaily = dailyByZone[zid] || [];
      var zRt = rtByZone[zid] || [];
      var zTask = taskByZone[zid] || [];
      var zTr = trByZone[zid] || [];

      // ── S: Safety ──
      var safetyIncidents = 0;
      for (var i = 0; i < zNc.length; i++) {
        if (v2ExtractPillar_(String(zNc[i][NC_COL.CRITERION_ID])) === "S6" &&
            String(zNc[i][NC_COL.STATUS]) !== STATUS.CLOSED) {
          safetyIncidents++;
        }
      }
      z.sqcdp.S = {
        label: "Safety", value: safetyIncidents, target: 0,
        status: safetyIncidents === 0 ? "GREEN" : "RED",
        detail: safetyIncidents === 0 ? "No open safety NCs" : safetyIncidents + " open safety NC(s)"
      };

      // ── Q: Quality (5S Score vs Target) ──
      var latestScore = null, scoreTarget = zone.targetScore || 70;
      for (var j = zDaily.length - 1; j >= 0; j--) {
        latestScore = parseFloat(zDaily[j][DS_COL.PCT_SCORE]) || null;
        if (latestScore !== null) break;
      }
      var qPct = latestScore !== null ? Math.round(latestScore) : null;
      z.sqcdp.Q = {
        label: "Quality", value: qPct !== null ? qPct + "%" : "N/A", target: scoreTarget + "%",
        status: qPct === null ? "GRAY" : (qPct >= scoreTarget ? "GREEN" : "RED"),
        detail: qPct !== null ? "Latest 5S score: " + qPct + "% (target: " + scoreTarget + "%)" : "No audit data today"
      };

      // ── C: Cost (Red Tag pending disposal value) ──
      var pendingValue = 0, pendingCount = 0;
      for (var k = 0; k < zRt.length; k++) {
        if (String(zRt[k][RT_COL.STATUS]) !== STATUS.CLOSED) {
          pendingValue += parseFloat(zRt[k][RT_COL.EST_VALUE]) || 0;
          pendingCount++;
        }
      }
      z.sqcdp.C = {
        label: "Cost", value: "₹" + Math.round(pendingValue).toLocaleString(), target: "₹0",
        status: pendingCount === 0 ? "GREEN" : (pendingValue > 50000 ? "RED" : "AMBER"),
        detail: pendingCount + " Red Tag(s) pending, ₹" + Math.round(pendingValue).toLocaleString()
      };

      // ── D: Delivery (Overdue NC/CAPA + Tasks) ──
      var overdueCount = 0;
      for (var m = 0; m < zNc.length; m++) {
        if (String(zNc[m][NC_COL.STATUS]) !== STATUS.CLOSED) {
          var target = zNc[m][NC_COL.TARGET_DATE];
          if (target instanceof Date && target < now) overdueCount++;
        }
      }
      for (var n = 0; n < zTask.length; n++) {
        if (String(zTask[n][TASK_COL.STATUS]) !== STATUS.DONE &&
            String(zTask[n][TASK_COL.STATUS]) !== STATUS.CLOSED) {
          var due = zTask[n][TASK_COL.DUE_DATE];
          if (due instanceof Date && due < now) overdueCount++;
        }
      }
      z.sqcdp.D = {
        label: "Delivery", value: overdueCount, target: 0,
        status: overdueCount === 0 ? "GREEN" : "RED",
        detail: overdueCount === 0 ? "All items on time" : overdueCount + " overdue action(s)"
      };

      // ── P: People (Training gaps — expiring within 30d or expired) ──
      var trainingGaps = 0;
      var thirtyDays = new Date(now.getTime() + 30 * 86400000);
      for (var p = 0; p < zTr.length; p++) {
        var expiry = zTr[p][TR_COL.EXPIRY_DATE];
        if (expiry instanceof Date && expiry < thirtyDays) trainingGaps++;
      }
      z.sqcdp.P = {
        label: "People", value: trainingGaps, target: 0,
        status: trainingGaps === 0 ? "GREEN" : (trainingGaps > 3 ? "RED" : "AMBER"),
        detail: trainingGaps === 0 ? "All certifications current" : trainingGaps + " certification(s) expiring/expired"
      };

      // ── SPC: Build 30-day history arrays per metric ──
      // S: Daily incident counts from NC_CAPA
      var safetyByDate = {};
      for (var s1 = 0; s1 < zNc.length; s1++) {
        if (v2ExtractPillar_(String(zNc[s1][NC_COL.CRITERION_ID])) === "S6") {
          var sDate = String(zNc[s1][NC_COL.CREATED] || "").substring(0, 10);
          if (sDate) safetyByDate[sDate] = (safetyByDate[sDate] || 0) + 1;
        }
      }
      var safetyHistory = Object.keys(safetyByDate).sort().map(function(dk) { return safetyByDate[dk]; });

      // Q: Daily average audit scores from DailySubmissions
      var qualityByDate = {};
      for (var q1 = 0; q1 < zDaily.length; q1++) {
        var qDate = String(zDaily[q1][DS_COL.SUBMISSION_DATE] || "").substring(0, 10);
        var qVal = parseFloat(zDaily[q1][DS_COL.PCT_SCORE]) || 0;
        if (qDate) {
          if (!qualityByDate[qDate]) qualityByDate[qDate] = [];
          qualityByDate[qDate].push(qVal);
        }
      }
      var qualityHistory = Object.keys(qualityByDate).sort().map(function(dk) {
        var arr = qualityByDate[dk];
        return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
      });

      // C: Daily pending Red Tag value
      var costByDate = {};
      for (var c1 = 0; c1 < zRt.length; c1++) {
        if (String(zRt[c1][RT_COL.STATUS]) !== STATUS.CLOSED) {
          var cDate = String(zRt[c1][RT_COL.CREATED] || "").substring(0, 10);
          if (cDate) costByDate[cDate] = (costByDate[cDate] || 0) + (parseFloat(zRt[c1][RT_COL.EST_VALUE]) || 0);
        }
      }
      var costHistory = Object.keys(costByDate).sort().map(function(dk) { return costByDate[dk]; });

      // D: Daily overdue NC/CAPA count (snapshot of today)
      var deliveryByDate = {};
      for (var d1 = 0; d1 < zNc.length; d1++) {
        if (String(zNc[d1][NC_COL.STATUS]) !== STATUS.CLOSED) {
          var dTarget = zNc[d1][NC_COL.TARGET_DATE];
          if (dTarget instanceof Date && dTarget < now) {
            var dStr = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
            deliveryByDate[dStr] = (deliveryByDate[dStr] || 0) + 1;
          }
        }
      }
      var deliveryHistory = Object.keys(deliveryByDate).sort().map(function(dk) { return deliveryByDate[dk]; });

      // Attach SPC stats
      z.sqcdp.S.spc = v2SPCCalculator_(safetyHistory, 30);
      z.sqcdp.Q.spc = v2SPCCalculator_(qualityHistory, 30);
      z.sqcdp.C.spc = v2SPCCalculator_(costHistory, 30);
      z.sqcdp.D.spc = v2SPCCalculator_(deliveryHistory, 30);
      z.sqcdp.S.trend = v2TrendStatus_(safetyHistory);
      z.sqcdp.Q.trend = v2TrendStatus_(qualityHistory);
      z.sqcdp.C.trend = v2TrendStatus_(costHistory);
      z.sqcdp.D.trend = v2TrendStatus_(deliveryHistory);
      z.sqcdp.P.trend = "GRAY"; // Training history not time-series; insufficient data

      // Determine worst metric (lowest green score / highest raw issue count)
      var worstMetric = null;
      var worstScore = Infinity;
      var metricOrder = { S: 0, Q: 1, C: 2, D: 3, P: 4 };
      ["S","Q","C","D","P"].forEach(function(mKey) {
        var m = z.sqcdp[mKey];
        // Rank: RED=0, AMBER=1, GREEN=2, GRAY=3
        var statusRank = { RED: 0, AMBER: 1, GREEN: 2, GRAY: 3 }[m.status] !== undefined
          ? { RED: 0, AMBER: 1, GREEN: 2, GRAY: 3 }[m.status] : 2;
        if (statusRank < worstScore) {
          worstScore = statusRank;
          worstMetric = mKey;
        }
      });
      z.sqcdp.worstMetric = worstMetric;

      // Aggregate
      var dims = ["S","Q","C","D","P"];
      z.greenCount = 0;
      dims.forEach(function(d) {
        if (z.sqcdp[d].status === "GREEN") { z.greenCount++; plantTotals.green++; }
        plantTotals.total++;
      });
      z.overallStatus = z.greenCount === 5 ? "GREEN" : (z.greenCount >= 3 ? "AMBER" : "RED");

      zones.push(z);
    }

    var result = {
      zones: zones,
      plant: {
        greenPct: plantTotals.total ? Math.round(100 * plantTotals.green / plantTotals.total) : 0,
        greenCount: plantTotals.green,
        totalDimensions: plantTotals.total
      },
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm"),
      isPartial: isPartial,
      warnings: warnings
    };
    try { CacheService.getScriptCache().put("pm5s_sqcdp_" + (zoneId || "ALL"), JSON.stringify(result), 300); } catch(e) {}
    return result;
  }, "getSQCDPBoardData", { zones: [], plant: {}, generated: "" }, "high");
}


// ============================================================================
// IMP-02: AUTO-GENERATED ACTION LIST (DIGITAL ANDON)
// ============================================================================

/**
 * Generates a prioritized action list from all active issues.
 * Auto-assigns owners based on zone responsibility.
 * @param {string} [zoneId] — Optional filter
 * @returns {Object} { actions: [...], generated: string }
 */
function getAutoActionList(zoneId) {
  return v2SafeExecute_(function() {
    V2_PROFILER.start("getAutoActionList");
    var cacheKey = "pm5s_actions_" + (zoneId || "ALL");
    try { var cached = CacheService.getScriptCache().get(cacheKey); if (cached) return JSON.parse(cached); } catch(e) {}
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var now = new Date();
    var actions = [];
    var warnings = [];
    var isPartial = false;

    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var taskData = v2LoadSheet_(ss, "TaskBoard");
    var rtData = v2LoadSheet_(ss, "RedTagRegister");

    // ── Overdue NCs → CRITICAL actions ──
    for (var i = 1; i < ncData.length; i++) {
      if (V2_PROFILER.isNearLimit()) {
        isPartial = true;
        warnings.push("⏱️ Timeout: Showing " + actions.length + " critical/high priority actions. Refresh to see more.");
        break;
      }
      var row = ncData[i];
      if (zoneId && String(row[NC_COL.ZONE_ID]) !== zoneId) continue;
      if (String(row[NC_COL.STATUS]) === STATUS.CLOSED) continue;
      var targetDate = row[NC_COL.TARGET_DATE];
      var isOverdue = targetDate instanceof Date && targetDate < now;
      var daysOpen = Math.floor((now - new Date(row[NC_COL.CREATED])) / 86400000);

      if (isOverdue || daysOpen > 7) {
        actions.push({
          priority: isOverdue ? 1 : 2,
          type: "NC/CAPA",
          id: String(row[NC_COL.NC_ID]),
          zone: String(row[NC_COL.ZONE_NAME]),
          zoneId: String(row[NC_COL.ZONE_ID]),
          title: "Fix " + String(row[NC_COL.CRITERION_ID]) + " — " + String(row[NC_COL.CRITERION_LABEL]),
          detail: isOverdue ? (function(){var d=Math.abs(Math.floor((now-targetDate)/86400000));return"OVERDUE by "+d+(d===1?" day":" days");}()) : "Open "+daysOpen+(daysOpen===1?" day":" days"),
          assigned: String(row[NC_COL.RESPONSIBLE]) || "Unassigned",
          status: String(row[NC_COL.STATUS]),
          dueDate: v2FormatDate_(targetDate),
          urgency: isOverdue ? "CRITICAL" : "HIGH"
        });
      }
    }

    // ── Overdue Tasks → HIGH actions ──
    for (var j = 1; j < taskData.length; j++) {
      if (V2_PROFILER.isNearLimit()) {
        isPartial = true;
        if (warnings.length === 0) warnings.push("⏱️ Timeout: Showing " + actions.length + " critical/high priority actions. Refresh to see more.");
        break;
      }
      var tr = taskData[j];
      if (zoneId && String(tr[TASK_COL.ZONE_ID]) !== zoneId) continue;
      var tStatus = String(tr[TASK_COL.STATUS]);
      if (tStatus === STATUS.DONE || tStatus === STATUS.CLOSED) continue;
      var tDue = tr[TASK_COL.DUE_DATE];
      if (tDue instanceof Date && tDue < now) {
        actions.push({
          priority: 3,
          type: "TASK",
          id: String(tr[TASK_COL.TASK_ID]),
          zone: String(tr[TASK_COL.ZONE_NAME]),
          zoneId: String(tr[TASK_COL.ZONE_ID]),
          title: String(tr[TASK_COL.TITLE]),
          detail: (function(){var d=Math.floor((now-tDue)/86400000);return"Overdue by "+d+(d===1?" day":" days");}()),
          assigned: String(tr[TASK_COL.ASSIGNED_TO]) || "Unassigned",
          status: tStatus,
          dueDate: v2FormatDate_(tDue),
          urgency: "HIGH"
        });
      }
    }

    // ── Red Tags pending > 7 days → MEDIUM actions ──
    for (var k = 1; k < rtData.length; k++) {
      if (V2_PROFILER.isNearLimit()) {
        isPartial = true;
        if (warnings.length === 0) warnings.push("⏱️ Timeout: Showing " + actions.length + " critical/high priority actions. Refresh to see more.");
        break;
      }
      var rt = rtData[k];
      if (zoneId && String(rt[RT_COL.ZONE_ID]) !== zoneId) continue;
      if (String(rt[RT_COL.STATUS]) === STATUS.CLOSED) continue;
      var rtAge = Math.floor((now - new Date(rt[RT_COL.CREATED])) / 86400000);
      if (rtAge > 7) {
        actions.push({
          priority: 4,
          type: "RED_TAG",
          id: String(rt[RT_COL.TAG_ID]),
          zone: String(rt[RT_COL.ZONE_NAME]),
          zoneId: String(rt[RT_COL.ZONE_ID]),
          title: "Dispose Red Tag: " + String(rt[RT_COL.ITEM_DESC]),
          detail: "Pending " + rtAge + (rtAge===1?" day":" days") + ", ₹" + (parseFloat(rt[RT_COL.EST_VALUE]) || 0).toLocaleString(),
          assigned: String(rt[RT_COL.OWNER]) || "Unassigned",
          status: String(rt[RT_COL.STATUS]),
          dueDate: v2FormatDate_(rt[RT_COL.DEADLINE]),
          urgency: rtAge > 14 ? "HIGH" : "MEDIUM"
        });
      }
    }

    // Sort by priority (1=most urgent)
    actions.sort(function(a, b) { return a.priority - b.priority; });

    var result = {
      actions: actions,
      summary: {
        critical: actions.filter(function(a) { return a.urgency === "CRITICAL"; }).length,
        high: actions.filter(function(a) { return a.urgency === "HIGH"; }).length,
        medium: actions.filter(function(a) { return a.urgency === "MEDIUM"; }).length,
        total: actions.length
      },
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm"),
      isPartial: isPartial,
      warnings: warnings
    };
    try { CacheService.getScriptCache().put("pm5s_actions_" + (zoneId || "ALL"), JSON.stringify(result), 300); } catch(e) {}
    return result;
  }, "getAutoActionList", { actions: [], summary: {}, generated: "" }, "medium");
}


// ============================================================================
// IMP-03: ONE-TAP QUICK AUDIT
// ============================================================================

/**
 * Returns quick audit configuration for a zone.
 * Pre-fills zone, date, auditor. Returns only active criteria.
 * @param {string} zoneId
 * @returns {Object} { zone, auditor, date, criteria: [...] }
 */
function getQuickAuditConfig(zoneId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var zone = config[zoneId] || {};
    var user = v2GetCurrentUser_();
    var now = new Date();

    // Load zone-specific criteria from ScriptProperties (set by initScriptProperties)
    var PILLAR_NAMES_ = {S1:'Sort',S2:'Set in Order',S3:'Shine',S4:'Standardize',S5:'Sustain'};
    var rawCriteria = getZoneCriteria(zoneId);
    var criteria = rawCriteria.map(function(c) {
      var arr = c.sqdcp || [];
      var sqcdp = Array.isArray(arr)
        ? {S: arr.indexOf('S')>=0, Q: arr.indexOf('Q')>=0, C: arr.indexOf('C')>=0, D: arr.indexOf('D')>=0, P: arr.indexOf('P')>=0}
        : arr;
      return {
        criterionId: c.id || c.criterionId || '',
        pillar:      c.pillar || '',
        pillarName:  PILLAR_NAMES_[c.pillar] || c.pillar || '',
        label:       c.labelEn || c.label || '',
        labelHi:     c.labelHi || '',
        task:        c.helperEn || '',
        taskHi:      c.helperHi || '',
        trigger:     c.trigger || '',
        sqcdp:       sqcdp,
        maxScore:    c.maxScore || 4
      };
    });

    // Load WDGLL photos for each criterion (IMP-10 integration)
    var wdData = v2LoadSheet_(ss, "WDGLL_Library");
    var wdgllMap = {};
    for (var w = 1; w < wdData.length; w++) {
      var cid = String(wdData[w][WD_COL.CRITERION_ID]);
      var wZone = String(wdData[w][WD_COL.ZONE_ID]);
      var isWdActive = String(wdData[w][WD_COL.IS_ACTIVE]).toUpperCase() !== "FALSE";
      if (isWdActive && (wZone === zoneId || wZone === "ALL" || wZone === "")) {
        if (!wdgllMap[cid]) wdgllMap[cid] = [];
        wdgllMap[cid].push({
          photoUrl: String(wdData[w][WD_COL.PHOTO_URL]),
          description: String(wdData[w][WD_COL.DESCRIPTION])
        });
      }
    }

    // Attach WDGLL to criteria
    criteria.forEach(function(c) {
      c.wdgllPhotos = wdgllMap[c.criterionId] || [];
    });

    // Check if audit already done today for this zone
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var todayStr = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
    var alreadyAudited = false;
    for (var d = 1; d < dailyData.length; d++) {
      if (String(dailyData[d][DS_COL.ZONE_ID]).trim() === zoneId) {
        var auditDate = dailyData[d][DS_COL.SUBMISSION_DATE];
        if (auditDate instanceof Date && Utilities.formatDate(auditDate, TZ, "yyyy-MM-dd") === todayStr) {
          alreadyAudited = true;
          break;
        }
      }
    }

    return {
      zoneId: zoneId,
      zoneName: zone.name || zoneId,
      auditor: user,
      date: Utilities.formatDate(now, TZ, "yyyy-MM-dd"),
      dateDisplay: Utilities.formatDate(now, TZ, "dd-MMM-yyyy"),
      criteria: criteria,
      alreadyAudited: alreadyAudited,
      pillarCount: criteria.reduce(function(acc, c) { acc[c.pillar] = (acc[c.pillar] || 0) + 1; return acc; }, {})
    };
  }, "getQuickAuditConfig", null, "high");
}

/**
 * Submits a quick audit (same backend as full audit, streamlined input).
 * @param {Object} auditData — { zoneId, scores: { criterionId: score, ... }, remarks }
 * @returns {Object} { success, message, actionsGenerated }
 */
function submitQuickAudit(auditData) {
  return v2SafeExecute_(function() {
    var validation = v2ValidateInput_(auditData, {
      zoneId: { type: "zoneId", required: true },
      remarks: { type: "string", maxLen: 1000 }
    });
    if (!validation.valid) return { success: false, message: validation.errors.join("; ") };

    var ss = v2GetSpreadsheet_();
    var user = v2GetCurrentUser_();
    var now = new Date();
    var zoneId = validation.data.zoneId;
    var scores = auditData.scores || {};

    // Per-criterion line items (score + optional remark + optional photo) — authoritative store
    var submissionId = Utilities.getUuid();
    try {
      writeAuditLineItems_(ss, submissionId, zoneId, now, user, auditData.lineItems || [], scores, auditData.remarks || {},
        auditData.fillSeconds, auditData.clientSubmittedAt);
    } catch (e) { Logger.log("AuditLineItems write skipped: " + e.message); }

    // Write to DailySubmissions (delegate to V1 if available)
    if (typeof submitDailyAudit === "function") {
      var res = submitDailyAudit({
        zoneId: zoneId,
        auditor: user,
        date: now,
        scores: scores,
        remarks: validation.data.remarks || ""
      });
      if (res && res.success !== false && typeof tg5sBroadcast_ === "function") {
        var pct = (res && res.percentage != null) ? res.percentage : null;
        tg5sBroadcast_(_tg5sCard_({
          icon: "✅", kind: "Daily Audit", link: _tg5sDeep_('?v2=1&action=zonematrix&zone=' + zoneId),
          zoneId: zoneId, zoneName: v2GetZoneName_(zoneId),
          facts: [ (pct != null ? "📊 Score " + pct + "%" : "📊 Submitted") ],
          action: "review low-score items",
          by: user
        }), [{ text: "📊 Zone Records", url: _tg5sDeep_('?v2=1&action=zonematrix&zone=' + zoneId) }]);
      }
      return res;
    }

    // Fallback: write directly
    var sheet = ss.getSheetByName("DailySubmissions");
    if (!sheet) return { success: false, message: "DailySubmissions sheet not found" };

    // Build row matching schema
    var schemaData = v2LoadSheet_(ss, "ChecklistSchema");
    var row = [zoneId, v2GetZoneName_(zoneId), now, user];
    for (var i = 1; i < schemaData.length; i++) {
      var cid = String(schemaData[i][0]);
      row.push(scores[cid] !== undefined ? parseInt(scores[cid]) : "");
    }
    // Total & percentage
    var total = 0, maxTotal = 0;
    Object.keys(scores).forEach(function(k) {
      var s = parseInt(scores[k]);
      if (!isNaN(s)) { total += s; maxTotal += 4; }
    });
    row.push(total);
    row.push(maxTotal > 0 ? Math.round(100 * total / maxTotal) : 0);

    // Upload watermarked photo if provided
    var photoUrl = "";
    if (auditData.photo_b64) {
      try {
        var result = uploadPhotoToDrive(auditData.photo_b64,
          "audit_" + zoneId + "_" + Utilities.formatDate(now, TZ, "yyyyMMdd_HHmmss") + ".jpg",
          zoneId);
        if (result && result.thumbnailUrl) photoUrl = result.thumbnailUrl;
      } catch (e) { Logger.log("Photo upload skipped: " + e.message); }
    }
    row.push(photoUrl);

    sheet.appendRow(row);

    // Auto-generate actions for low scores (IMP-02 integration)
    var actionsGenerated = 0;
    Object.keys(scores).forEach(function(cid) {
      var score = parseInt(scores[cid]);
      if (score <= 1) {
        // Auto-create NC for scores 0-1
        try {
          var ncSheet = ss.getSheetByName("NC_CAPA");
          if (ncSheet) {
            var ncId = (typeof generateNCId_ === 'function')
              ? generateNCId_()
              : "NC-" + Utilities.formatDate(now, TZ, "yyyyMMddHHmmss") + "-" + Utilities.getUuid().substring(0, 8);
            var ncRow = [];
            ncRow[NC_COL.NC_ID] = ncId;
            ncRow[NC_COL.CREATED] = now;
            ncRow[NC_COL.ZONE_ID] = zoneId;
            ncRow[NC_COL.ZONE_NAME] = v2GetZoneName_(zoneId);
            ncRow[NC_COL.AUDIT_DATE] = now;
            ncRow[NC_COL.CRITERION_ID] = cid;
            ncRow[NC_COL.CRITERION_LABEL] = "";
            ncRow[NC_COL.SCORE] = score;
            ncRow[NC_COL.AUDITOR] = user;
            ncRow[NC_COL.STATUS] = STATUS.OPEN;
            ncRow[NC_COL.TARGET_DATE] = new Date(now.getTime() + 7 * 86400000);
            // Fill remaining with ""
            while (ncRow.length < 20) ncRow.push("");
            ncSheet.appendRow(ncRow);
            actionsGenerated++;
            if (typeof DWM !== "undefined") {
              DWM.syncTaskSafe({ title: "CAPA: low score " + cid + " (" + score + ")", ref: ncId,
                status: "open",
                assignee: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(user) : (user || ""),
                creator: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(user) : "",
                desc: "Auto-raised from audit · zone " + zoneId + " · " + cid,
                due: Utilities.formatDate(new Date(now.getTime() + 7 * 86400000), TZ, "yyyy-MM-dd"), photo: true });
            }
          }
        } catch (e) { /* Non-blocking */ }
      }
    });

    if (typeof invalidateZoneMapCache_ === "function") invalidateZoneMapCache_();
    return {
      success: true,
      submissionId: submissionId,
      message: "Audit submitted! Score: " + (maxTotal > 0 ? Math.round(100 * total / maxTotal) : 0) + "%",
      actionsGenerated: actionsGenerated,
      totalScore: total,
      maxScore: maxTotal,
      percentage: maxTotal > 0 ? Math.round(100 * total / maxTotal) : 0
    };
  }, "submitQuickAudit", { success: false, message: "Error submitting audit" }, "critical");
}

var AUDIT_LINEITEMS_HEADERS = ["SUBMISSION_ID","ZONE_ID","ZONE_NAME","TIMESTAMP","AUDITOR",
  "CRITERION_ID","PILLAR","SCORE","REMARK","PHOTO_URL","PHOTO_FILE_ID",
  "FILL_SECONDS","CLIENT_SUBMITTED_AT"];

/** Ensure the AuditLineItems sheet exists with the full header (migrates old sheets). */
function ensureAuditLineItemsSheet_(ss) {
  var sheet = ss.getSheetByName("AuditLineItems");
  if (!sheet) {
    sheet = ss.insertSheet("AuditLineItems");
    sheet.getRange(1, 1, 1, AUDIT_LINEITEMS_HEADERS.length).setValues([AUDIT_LINEITEMS_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Migration: extend the header row if new columns were added.
  if (sheet.getLastColumn() < AUDIT_LINEITEMS_HEADERS.length) {
    sheet.getRange(1, 1, 1, AUDIT_LINEITEMS_HEADERS.length).setValues([AUDIT_LINEITEMS_HEADERS]);
  }
  return sheet;
}

/**
 * Persist one row per scored criterion. Uploads optional per-criterion photo with a
 * canonical name: <zoneId>_<yyyyMMdd-HHmmss>_<criterionId>_<auditorSlug>.jpg
 */
function writeAuditLineItems_(ss, submissionId, zoneId, now, user, lineItems, scores, remarks, fillSeconds, clientAt) {
  var sheet = ensureAuditLineItemsSheet_(ss);
  var zoneName = v2GetZoneName_(zoneId);
  var tz = (typeof TZ !== "undefined" && TZ) ? TZ : (Session.getScriptTimeZone() || "Asia/Kolkata");
  var stamp = Utilities.formatDate(now, tz, "yyyyMMdd-HHmmss");
  var slug = String(user || "auditor").replace(/[^A-Za-z0-9]/g, "").toLowerCase().substring(0, 16) || "auditor";
  var fillS = (fillSeconds != null && fillSeconds !== "" && !isNaN(fillSeconds)) ? parseInt(fillSeconds, 10) : "";
  var cAt = "";
  if (clientAt) { var cd = new Date(clientAt); if (!isNaN(cd.getTime())) cAt = cd; }

  // Normalize to a list keyed by criterionId (prefer explicit lineItems, fall back to scores map)
  var items = (lineItems && lineItems.length)
    ? lineItems
    : Object.keys(scores || {}).map(function (cid) { return { criterionId: cid, score: scores[cid], remark: (remarks || {})[cid] || "" }; });

  var rows = items.map(function (li) {
    var cid = String(li.criterionId);
    var pillar = cid.indexOf("-") >= 0 ? cid.split("-")[0] : cid;
    // photos_b64 (array, up to 3) supersedes the legacy single photo_b64.
    var photoInputs = Array.isArray(li.photos_b64) ? li.photos_b64 : (li.photo_b64 ? [li.photo_b64] : []);
    var photoUrls = [], photoFileIds = [];
    photoInputs.forEach(function (b64, pIdx) {
      if (!b64) return;
      try {
        var name = zoneId + "_" + stamp + "_" + cid + "_" + slug + (pIdx ? "_" + (pIdx + 1) : "") + ".jpg";
        var res = uploadPhotoToDrive(b64, name, zoneId);
        if (res && res.thumbnailUrl) { photoUrls.push(res.thumbnailUrl); photoFileIds.push(res.fileId || ""); }
      } catch (e) { Logger.log("line photo skipped (" + cid + " #" + pIdx + "): " + e.message); }
    });
    return [submissionId, zoneId, zoneName, now, user, cid, pillar,
            (li.score !== undefined && li.score !== "") ? parseInt(li.score, 10) : "",
            li.remark || "", photoUrls.join(","), photoFileIds.join(","), fillS, cAt];
  });

  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, AUDIT_LINEITEMS_HEADERS.length).setValues(rows);
  return { ok: true, submissionId: submissionId, count: rows.length };
}


// ============================================================================
// IMP-04: SHIFT HANDOVER DIGITAL LOG
// ============================================================================

/**
 * Generates a shift summary for handover.
 * @param {string} [shiftBoundary] — "morning"|"evening" or auto-detect
 * @returns {Object} Shift summary data
 */
function getShiftHandoverData(shiftBoundary) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var now = new Date();
    var hour = parseInt(Utilities.formatDate(now, TZ, "HH"));

    // Auto-detect shift: morning shift ends ~14:00, evening ends ~22:00
    if (!shiftBoundary) {
      shiftBoundary = hour >= 14 ? "evening" : "morning";
    }

    // Shift window: last 8 hours
    var shiftStart = new Date(now.getTime() - 8 * 3600000);
    var todayStr = Utilities.formatDate(now, TZ, "yyyy-MM-dd");

    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var rtData = v2LoadSheet_(ss, "RedTagRegister");
    var taskData = v2LoadSheet_(ss, "TaskBoard");
    var kzData = v2LoadSheet_(ss, "KaizenSuggestions");
    var zoneIds = Object.keys(config);

    // Audits completed this shift
    var auditsCompleted = [];
    var zonesAudited = {};
    for (var i = 1; i < dailyData.length; i++) {
      var auditDate = dailyData[i][DS_COL.TIMESTAMP];
      if (auditDate instanceof Date && auditDate >= shiftStart && auditDate <= now) {
        var zid = String(dailyData[i][DS_COL.ZONE_ID]).trim();
        zonesAudited[zid] = true;
        auditsCompleted.push({
          zone: zid,
          zoneName: String(dailyData[i][DS_COL.ZONE_NAME]),
          auditor: String(dailyData[i][DS_COL.ZONE_LEADER]),
          score: parseFloat(dailyData[i][DS_COL.PCT_SCORE]) || 0
        });
      }
    }
    var zonesMissing = zoneIds.filter(function(z) { return !zonesAudited[z]; });

    // NCs raised this shift
    var ncsRaised = [];
    for (var j = 1; j < ncData.length; j++) {
      var ncDate = ncData[j][NC_COL.CREATED];
      if (ncDate instanceof Date && ncDate >= shiftStart && ncDate <= now) {
        ncsRaised.push({
          ncId: String(ncData[j][NC_COL.NC_ID]),
          zone: String(ncData[j][NC_COL.ZONE_NAME]),
          criterion: String(ncData[j][NC_COL.CRITERION_ID]),
          status: String(ncData[j][NC_COL.STATUS])
        });
      }
    }

    // Red Tags created this shift
    var redTags = [];
    for (var k = 1; k < rtData.length; k++) {
      var rtDate = rtData[k][RT_COL.CREATED];
      if (rtDate instanceof Date && rtDate >= shiftStart && rtDate <= now) {
        redTags.push({
          tagId: String(rtData[k][RT_COL.TAG_ID]),
          zone: String(rtData[k][RT_COL.ZONE_NAME]),
          item: String(rtData[k][RT_COL.ITEM_DESC]),
          value: parseFloat(rtData[k][RT_COL.EST_VALUE]) || 0
        });
      }
    }

    // Tasks created this shift
    var tasksCreated = [];
    for (var m = 1; m < taskData.length; m++) {
      var taskDate = taskData[m][TASK_COL.CREATED];
      if (taskDate instanceof Date && taskDate >= shiftStart && taskDate <= now) {
        tasksCreated.push({
          taskId: String(taskData[m][TASK_COL.TASK_ID]),
          zone: String(taskData[m][TASK_COL.ZONE_NAME]),
          title: String(taskData[m][TASK_COL.TITLE]),
          status: String(taskData[m][TASK_COL.STATUS])
        });
      }
    }

    // Kaizen suggestions this shift
    var kaizens = [];
    for (var n = 1; n < kzData.length; n++) {
      var kzDate = kzData[n][KZ_COL.CREATED];
      if (kzDate instanceof Date && kzDate >= shiftStart && kzDate <= now) {
        kaizens.push({
          id: String(kzData[n][KZ_COL.KAIZEN_ID]),
          title: String(kzData[n][KZ_COL.TITLE]),
          zone: String(kzData[n][KZ_COL.ZONE_NAME])
        });
      }
    }

    // Carried-forward actions (open items overdue)
    var carriedForward = [];
    for (var p = 1; p < taskData.length; p++) {
      var ts = String(taskData[p][TASK_COL.STATUS]);
      if (ts !== STATUS.DONE && ts !== STATUS.CLOSED) {
        var tDue = taskData[p][TASK_COL.DUE_DATE];
        if (tDue instanceof Date && tDue < now) {
          carriedForward.push({
            taskId: String(taskData[p][TASK_COL.TASK_ID]),
            title: String(taskData[p][TASK_COL.TITLE]),
            zone: String(taskData[p][TASK_COL.ZONE_NAME]),
            dueDate: v2FormatDate_(tDue)
          });
        }
      }
    }

    return {
      shift: shiftBoundary,
      period: {
        from: Utilities.formatDate(shiftStart, TZ, "HH:mm"),
        to: Utilities.formatDate(now, TZ, "HH:mm"),
        date: Utilities.formatDate(now, TZ, "dd-MMM-yyyy")
      },
      audits: {
        completed: auditsCompleted,
        totalZones: zoneIds.length,
        completedCount: Object.keys(zonesAudited).length,
        missingZones: zonesMissing
      },
      ncsRaised: ncsRaised,
      redTags: redTags,
      tasksCreated: tasksCreated,
      kaizens: kaizens,
      carriedForward: carriedForward,
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm")
    };
  }, "getShiftHandoverData", null, "high");
}


// ============================================================================
// IMP-05: AUTO-GENERATED MRM REPORT PACK
// ============================================================================

/**
 * Generates the complete MRM (Management Review Meeting) report pack.
 * Covers ISO 9001/14001/45001 Clause 9.3 requirements.
 * @param {number} [months=1] — Number of months to cover
 * @returns {Object} Full MRM report data
 */
function getMRMReportData(months) {
  return v2SafeExecute_(function() {
    months = months || 1;
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var now = new Date();
    var periodStart = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    var zoneIds = Object.keys(config);

    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var rtData = v2LoadSheet_(ss, "RedTagRegister");
    var taskData = v2LoadSheet_(ss, "TaskBoard");
    var kzData = v2LoadSheet_(ss, "KaizenSuggestions");
    var trData = v2LoadSheet_(ss, "TrainingLog");

    // ── Section 1: Audit Performance ──
    var auditPerformance = {};
    zoneIds.forEach(function(z) { auditPerformance[z] = { scores: [], avg: 0, trend: "" }; });
    for (var i = 1; i < dailyData.length; i++) {
      var aDate = dailyData[i][DS_COL.TIMESTAMP];
      if (!(aDate instanceof Date) || aDate < periodStart) continue;
      var zid = String(dailyData[i][DS_COL.ZONE_ID]).trim();
      var score = parseFloat(dailyData[i][DS_COL.PCT_SCORE]);
      if (!isNaN(score) && auditPerformance[zid]) {
        auditPerformance[zid].scores.push({ date: aDate, score: score });
      }
    }
    Object.keys(auditPerformance).forEach(function(z) {
      var arr = auditPerformance[z].scores;
      if (arr.length > 0) {
        auditPerformance[z].avg = Math.round(arr.reduce(function(s, x) { return s + x.score; }, 0) / arr.length);
        if (arr.length >= 3) {
          var half = Math.floor(arr.length / 2);
          var first = arr.slice(0, half).reduce(function(s, x) { return s + x.score; }, 0) / half;
          var second = arr.slice(half).reduce(function(s, x) { return s + x.score; }, 0) / (arr.length - half);
          auditPerformance[z].trend = second > first + 2 ? "IMPROVING" : (second < first - 2 ? "DECLINING" : "STABLE");
        }
      }
    });

    // ── Section 2: NC/CAPA Register ──
    var ncStats = { total: 0, open: 0, closed: 0, overdue: 0, avgAge: 0, byPillar: {}, repeatRate: 0 };
    var ncAges = [], repeatCount = 0;
    for (var j = 1; j < ncData.length; j++) {
      var ncDate = ncData[j][NC_COL.CREATED];
      if (!(ncDate instanceof Date) || ncDate < periodStart) continue;
      ncStats.total++;
      var st = String(ncData[j][NC_COL.STATUS]);
      if (st === STATUS.CLOSED) { ncStats.closed++; }
      else {
        ncStats.open++;
        var tgt = ncData[j][NC_COL.TARGET_DATE];
        if (tgt instanceof Date && tgt < now) ncStats.overdue++;
        ncAges.push(Math.floor((now - ncDate) / 86400000));
      }
      var pillar = v2ExtractPillar_(String(ncData[j][NC_COL.CRITERION_ID]));
      ncStats.byPillar[pillar] = (ncStats.byPillar[pillar] || 0) + 1;
      if (String(ncData[j][NC_COL.IS_REPEAT]) === "TRUE") repeatCount++;
    }
    ncStats.avgAge = ncAges.length ? Math.round(ncAges.reduce(function(a, b) { return a + b; }, 0) / ncAges.length) : 0;
    ncStats.repeatRate = ncStats.total ? Math.round(100 * repeatCount / ncStats.total) : 0;

    // ── Section 3: Red Tag Disposition ──
    var rtStats = { total: 0, disposed: 0, pending: 0, pendingValue: 0 };
    for (var k = 1; k < rtData.length; k++) {
      var rtDate = rtData[k][RT_COL.CREATED];
      if (!(rtDate instanceof Date) || rtDate < periodStart) continue;
      rtStats.total++;
      if (String(rtData[k][RT_COL.STATUS]) === STATUS.CLOSED) rtStats.disposed++;
      else { rtStats.pending++; rtStats.pendingValue += parseFloat(rtData[k][RT_COL.EST_VALUE]) || 0; }
    }

    // ── Section 4: Kaizen & Improvement ──
    var kzStats = { submitted: 0, implemented: 0, verified: 0, totalSavings: 0, topCategories: {} };
    for (var m = 1; m < kzData.length; m++) {
      var kDate = kzData[m][KZ_COL.CREATED];
      if (!(kDate instanceof Date) || kDate < periodStart) continue;
      kzStats.submitted++;
      var ks = String(kzData[m][KZ_COL.STATUS]);
      if (ks === STATUS.COMPLETED || ks === STATUS.BENEFIT_VERIFIED) kzStats.implemented++;
      if (ks === STATUS.BENEFIT_VERIFIED) {
        kzStats.verified++;
        kzStats.totalSavings += parseFloat(kzData[m][KZ_COL.ACTUAL_SAVINGS]) || 0;
      }
      var cat = String(kzData[m][KZ_COL.CATEGORY]) || "General";
      kzStats.topCategories[cat] = (kzStats.topCategories[cat] || 0) + 1;
    }

    // ── Section 5: Training Status ──
    var trStats = { totalRecords: 0, certified: 0, expiringSoon: 0, expired: 0, gapsByZone: {} };
    var thirtyDays = new Date(now.getTime() + 30 * 86400000);
    for (var n = 1; n < trData.length; n++) {
      trStats.totalRecords++;
      var trSt = String(trData[n][TR_COL.STATUS]);
      if (trSt === "CERTIFIED") trStats.certified++;
      var exp = trData[n][TR_COL.EXPIRY_DATE];
      if (exp instanceof Date) {
        if (exp < now) trStats.expired++;
        else if (exp < thirtyDays) trStats.expiringSoon++;
      }
    }

    // ── Section 6: Task Completion ──
    var taskStats = { total: 0, completed: 0, overdue: 0, completionRate: 0 };
    for (var p = 1; p < taskData.length; p++) {
      var tDate = taskData[p][TASK_COL.CREATED];
      if (!(tDate instanceof Date) || tDate < periodStart) continue;
      taskStats.total++;
      var tSt = String(taskData[p][TASK_COL.STATUS]);
      if (tSt === STATUS.DONE || tSt === STATUS.CLOSED) taskStats.completed++;
      else {
        var due = taskData[p][TASK_COL.DUE_DATE];
        if (due instanceof Date && due < now) taskStats.overdue++;
      }
    }
    taskStats.completionRate = taskStats.total ? Math.round(100 * taskStats.completed / taskStats.total) : 0;

    return {
      reportTitle: "Management Review Meeting — Report Pack",
      period: {
        from: Utilities.formatDate(periodStart, TZ, "dd-MMM-yyyy"),
        to: Utilities.formatDate(now, TZ, "dd-MMM-yyyy"),
        months: months
      },
      auditPerformance: auditPerformance,
      ncStats: ncStats,
      rtStats: rtStats,
      kzStats: kzStats,
      trStats: trStats,
      taskStats: taskStats,
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm"),
      isoReferences: [
        "ISO 9001:2015 Clause 9.3 — Management Review",
        "ISO 14001:2015 Clause 9.3 — Management Review",
        "ISO 45001:2018 Clause 9.3 — Management Review"
      ]
    };
  }, "getMRMReportData", null, "high");
}


// ============================================================================
// IMP-06: RISK REGISTER WITH AUTO-CLASSIFICATION
// ============================================================================

/**
 * Auto-generates a risk register from operational data.
 * Uses ISO 31000 likelihood × impact matrix.
 * @returns {Object} { risks: [...], matrix: {...}, generated: string }
 */
function getRiskRegisterData() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var now = new Date();
    var risks = [];

    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var zoneIds = Object.keys(config);

    // ── Rule 1: Zones with score <60% for 3+ consecutive weeks → HIGH RISK ──
    zoneIds.forEach(function(zid) {
      var weeklyScores = {};
      for (var i = 1; i < dailyData.length; i++) {
        var dZone = String(dailyData[i][DS_COL.ZONE_ID]).trim();
        if (dZone !== zid) continue;
        var dDate = dailyData[i][DS_COL.TIMESTAMP];
        if (!(dDate instanceof Date)) continue;
        var weekKey = Utilities.formatDate(dDate, TZ, "yyyy-ww");
        var score = parseFloat(dailyData[i][DS_COL.PCT_SCORE]);
        if (!isNaN(score)) {
          if (!weeklyScores[weekKey]) weeklyScores[weekKey] = [];
          weeklyScores[weekKey].push(score);
        }
      }
      var weeks = Object.keys(weeklyScores).sort().reverse();
      var lowWeeks = 0;
      for (var w = 0; w < Math.min(weeks.length, 4); w++) {
        var avg = weeklyScores[weeks[w]].reduce(function(a, b) { return a + b; }, 0) / weeklyScores[weeks[w]].length;
        if (avg < 60) lowWeeks++;
        else break;
      }
      if (lowWeeks >= 3) {
        risks.push({
          id: "R-ZONE-" + zid,
          category: "Quality",
          description: "Zone " + (config[zid].name || zid) + " scoring below 60% for " + lowWeeks + " consecutive weeks",
          likelihood: 5, impact: 4, riskScore: 20,
          level: "EXTREME",
          zone: zid,
          controls: "NC/CAPA raised, audits ongoing",
          action: "Targeted training + root cause analysis",
          owner: config[zid].leader || "Zone Leader",
          isoRef: "ISO 9001 Cl.6.1"
        });
      }
    });

    // ── Rule 2: NCs open >14 days → UNCONTROLLED RISK ──
    for (var j = 1; j < ncData.length; j++) {
      var ncSt = String(ncData[j][NC_COL.STATUS]);
      if (ncSt === STATUS.CLOSED) continue;
      var ncAge = Math.floor((now - new Date(ncData[j][NC_COL.CREATED])) / 86400000);
      if (ncAge > 14) {
        risks.push({
          id: "R-NC-" + String(ncData[j][NC_COL.NC_ID]),
          category: "Compliance",
          description: "NC " + String(ncData[j][NC_COL.NC_ID]) + " open " + ncAge + " days (criterion: " + String(ncData[j][NC_COL.CRITERION_ID]) + ")",
          likelihood: 4, impact: 3, riskScore: 12,
          level: ncAge > 30 ? "HIGH" : "SIGNIFICANT",
          zone: String(ncData[j][NC_COL.ZONE_ID]),
          controls: "CAPA: " + String(ncData[j][NC_COL.CORRECTIVE_ACTION] || "None planned"),
          action: "Escalate to MC for immediate resolution",
          owner: String(ncData[j][NC_COL.RESPONSIBLE]) || "Unassigned",
          isoRef: "ISO 9001 Cl.10.2"
        });
      }
    }

    // ── Rule 3: Pillar with >3 NCs across zones → SYSTEMIC RISK ──
    var pillarNCs = {};
    for (var k = 1; k < ncData.length; k++) {
      if (String(ncData[k][NC_COL.STATUS]) === STATUS.CLOSED) continue;
      var pillar = v2ExtractPillar_(String(ncData[k][NC_COL.CRITERION_ID]));
      if (!pillarNCs[pillar]) pillarNCs[pillar] = new Set();
      pillarNCs[pillar].add(String(ncData[k][NC_COL.ZONE_ID]));
    }
    // Convert Set to count (GAS compatible)
    Object.keys(pillarNCs).forEach(function(p) {
      var zoneCount = 0;
      var seen = {};
      // Re-count since Set may not be available in GAS
      for (var m = 1; m < ncData.length; m++) {
        if (String(ncData[m][NC_COL.STATUS]) === STATUS.CLOSED) continue;
        if (v2ExtractPillar_(String(ncData[m][NC_COL.CRITERION_ID])) === p) {
          var z = String(ncData[m][NC_COL.ZONE_ID]);
          if (!seen[z]) { seen[z] = true; zoneCount++; }
        }
      }
      if (zoneCount >= 3) {
        risks.push({
          id: "R-SYS-" + p,
          category: "Systemic",
          description: "Pillar " + p + " has open NCs across " + zoneCount + " zones — indicates systemic issue",
          likelihood: 4, impact: 4, riskScore: 16,
          level: "HIGH",
          zone: "Plant-wide",
          controls: "Individual zone CAPAs",
          action: "Plant-level root cause analysis, update SOP, deploy training across all zones",
          owner: "Management Committee",
          isoRef: "ISO 9001 Cl.6.1, ISO 45001 Cl.6.1.2"
        });
      }
    });

    // Sort by risk score descending
    risks.sort(function(a, b) { return b.riskScore - a.riskScore; });

    // Build 5×5 matrix summary
    var matrix = {};
    risks.forEach(function(r) {
      var key = r.likelihood + "x" + r.impact;
      if (!matrix[key]) matrix[key] = [];
      matrix[key].push(r.id);
    });

    return {
      risks: risks,
      matrix: matrix,
      summary: {
        extreme: risks.filter(function(r) { return r.level === "EXTREME"; }).length,
        high: risks.filter(function(r) { return r.level === "HIGH"; }).length,
        significant: risks.filter(function(r) { return r.level === "SIGNIFICANT"; }).length,
        total: risks.length
      },
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm"),
      isoRef: "ISO 31000:2018 Risk Management"
    };
  }, "getRiskRegisterData", { risks: [], matrix: {}, summary: {} }, "high");
}


// ============================================================================
// IMP-07: INTEGRATED IMS AUDIT (Environment Criteria)
// ============================================================================

/**
 * Returns the environment (E) criteria for IMS audit extension.
 * These are config-only additions to ChecklistSchema.
 * @returns {Array} Environment criteria definitions
 */
function getIMSEnvironmentCriteria() {
  return [
    { criterionId: "E1-C1", pillar: "E1", pillarName: "Waste Management", label: "Waste bins properly segregated (hazardous/non-hazardous/recyclable)", maxScore: 4 },
    { criterionId: "E1-C2", pillar: "E1", pillarName: "Waste Management", label: "Waste disposal records up to date", maxScore: 4 },
    { criterionId: "E2-C1", pillar: "E2", pillarName: "Energy Conservation", label: "Lights/equipment OFF when area not in use", maxScore: 4 },
    { criterionId: "E2-C2", pillar: "E2", pillarName: "Energy Conservation", label: "Energy-saving signage visible and followed", maxScore: 4 },
    { criterionId: "E3-C1", pillar: "E3", pillarName: "Spill & Chemical Control", label: "Spill containment kits accessible and stocked", maxScore: 4 },
    { criterionId: "E3-C2", pillar: "E3", pillarName: "Spill & Chemical Control", label: "All chemicals labeled with SDS available", maxScore: 4 },
    { criterionId: "E4-C1", pillar: "E4", pillarName: "Water & Emissions", label: "No visible leaks or water wastage", maxScore: 4 },
    { criterionId: "E4-C2", pillar: "E4", pillarName: "Water & Emissions", label: "Dust/fume extraction operational where required", maxScore: 4 }
  ];
}

/**
 * Adds IMS environment criteria to ChecklistSchema.
 * Safe to call multiple times (checks for existing).
 * @returns {Object} { added: number, alreadyExist: number }
 */
function addIMSEnvironmentCriteria() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var schema = ss.getSheetByName("ChecklistSchema");
    if (!schema) return { added: 0, message: "ChecklistSchema not found" };

    var existing = v2LoadSheet_(ss, "ChecklistSchema");
    var existingIds = {};
    for (var i = 1; i < existing.length; i++) {
      existingIds[String(existing[i][0])] = true;
    }

    var criteria = getIMSEnvironmentCriteria();
    var added = 0, alreadyExist = 0;
    criteria.forEach(function(c) {
      if (existingIds[c.criterionId]) { alreadyExist++; return; }
      schema.appendRow([c.criterionId, c.pillar, c.pillarName, c.label, "TRUE", c.maxScore]);
      added++;
    });

    return { added: added, alreadyExist: alreadyExist, message: added + " criteria added, " + alreadyExist + " already existed" };
  }, "addIMSEnvironmentCriteria", { added: 0 }, "medium");
}


// ============================================================================
// IMP-08: KAIZEN IMPACT TRACKER WITH ROI
// ============================================================================

/**
 * Returns Kaizen ROI summary data.
 * @param {number} [months=3] — Period to cover
 * @returns {Object} Kaizen ROI data
 */
function getKaizenROIData(months) {
  return v2SafeExecute_(function() {
    months = months || 3;
    var ss = v2GetSpreadsheet_();
    var now = new Date();
    var periodStart = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    var kzData = v2LoadSheet_(ss, "KaizenSuggestions");

    var summary = {
      submitted: 0, implemented: 0, verified: 0,
      totalEstSavings: 0, totalActualSavings: 0,
      avgImplementDays: 0, topContributors: {}, byCategory: {}, byZone: {},
      items: []
    };

    var implDays = [];

    for (var i = 1; i < kzData.length; i++) {
      var row = kzData[i];
      var kDate = row[KZ_COL.CREATED];
      if (!(kDate instanceof Date) || kDate < periodStart) continue;

      summary.submitted++;
      var ks = String(row[KZ_COL.STATUS]);
      var est = parseFloat(row[KZ_COL.EST_SAVINGS]) || 0;
      var actual = parseFloat(row[KZ_COL.ACTUAL_SAVINGS]) || 0;
      var submitter = String(row[KZ_COL.SUBMITTER]) || "Unknown";
      var category = String(row[KZ_COL.CATEGORY]) || "General";
      var zone = String(row[KZ_COL.ZONE_NAME]) || "Unknown";

      summary.totalEstSavings += est;
      summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
      summary.byZone[zone] = (summary.byZone[zone] || 0) + 1;
      summary.topContributors[submitter] = (summary.topContributors[submitter] || 0) + 1;

      if (ks === STATUS.COMPLETED || ks === STATUS.BENEFIT_VERIFIED) {
        summary.implemented++;
        var compDate = row[KZ_COL.COMPLETED_DATE];
        if (compDate instanceof Date) {
          implDays.push(Math.floor((compDate - kDate) / 86400000));
        }
      }
      if (ks === STATUS.BENEFIT_VERIFIED) {
        summary.verified++;
        summary.totalActualSavings += actual;
      }

      summary.items.push({
        id: String(row[KZ_COL.KAIZEN_ID]),
        title: String(row[KZ_COL.TITLE]),
        category: category,
        zone: zone,
        submitter: submitter,
        status: ks,
        estSavings: est,
        actualSavings: actual,
        roi: est > 0 ? Math.round(100 * actual / est) : 0
      });
    }

    summary.avgImplementDays = implDays.length ? Math.round(implDays.reduce(function(a, b) { return a + b; }, 0) / implDays.length) : 0;
    summary.implementationRate = summary.submitted ? Math.round(100 * summary.implemented / summary.submitted) : 0;
    summary.roiAccuracy = summary.totalEstSavings > 0 ? Math.round(100 * summary.totalActualSavings / summary.totalEstSavings) : 0;

    // Sort top contributors
    var contribArr = Object.keys(summary.topContributors).map(function(k) {
      return { name: k, count: summary.topContributors[k] };
    }).sort(function(a, b) { return b.count - a.count; });
    summary.topContributorsList = contribArr.slice(0, 5);

    return {
      period: { months: months, from: Utilities.formatDate(periodStart, TZ, "dd-MMM-yyyy"), to: Utilities.formatDate(now, TZ, "dd-MMM-yyyy") },
      summary: summary,
      generated: Utilities.formatDate(now, TZ, "dd-MMM-yyyy HH:mm")
    };
  }, "getKaizenROIData", null, "medium");
}


// ============================================================================
// IMP-09: PREDICTIVE TREND ALERTS (Leading Indicators)
// ============================================================================

/**
 * Detects early warning trends before thresholds are breached.
 * @returns {Array} Trend alerts
 */
function getPredictiveTrendAlerts() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var config = v2GetZoneConfig_();
    var now = new Date();
    var zoneIds = Object.keys(config);
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var alerts = [];

    zoneIds.forEach(function(zid) {
      // Collect weekly averages (last 6 weeks)
      var weeklyAvg = {};
      for (var i = 1; i < dailyData.length; i++) {
        var dZone = String(dailyData[i][DS_COL.ZONE_ID]).trim();
        if (dZone !== zid) continue;
        var dDate = dailyData[i][DS_COL.TIMESTAMP];
        if (!(dDate instanceof Date)) continue;
        var weekKey = Utilities.formatDate(dDate, TZ, "yyyy-ww");
        var score = parseFloat(dailyData[i][DS_COL.PCT_SCORE]);
        if (isNaN(score)) continue;
        if (!weeklyAvg[weekKey]) weeklyAvg[weekKey] = { sum: 0, count: 0 };
        weeklyAvg[weekKey].sum += score;
        weeklyAvg[weekKey].count++;
      }

      var weeks = Object.keys(weeklyAvg).sort().reverse().slice(0, 6);
      if (weeks.length < 3) return;

      var avgs = weeks.map(function(w) { return Math.round(weeklyAvg[w].sum / weeklyAvg[w].count); }).reverse();

      // ── Declining trajectory (3+ consecutive drops) ──
      var declining = true;
      for (var d = 1; d < Math.min(avgs.length, 4); d++) {
        if (avgs[avgs.length - d] >= avgs[avgs.length - d - 1]) { declining = false; break; }
      }
      if (declining && avgs.length >= 3) {
        var recentScores = avgs.slice(-3);
        var dropRate = recentScores[0] - recentScores[2];
        var projected = recentScores[2] - dropRate;
        alerts.push({
          type: "DECLINING_TREND",
          severity: projected < 60 ? "HIGH" : "MEDIUM",
          zone: zid,
          zoneName: config[zid].name || zid,
          message: "Scores declining: " + recentScores.join("% → ") + "% over 3 weeks",
          detail: "Projected next week: " + Math.max(0, projected) + "%. " + (projected < 60 ? "Will breach 60% target." : ""),
          scores: recentScores,
          action: "Schedule targeted improvement for " + (config[zid].name || zid)
        });
      }

      // ── High variance (swinging >15 points between weeks) ──
      if (avgs.length >= 4) {
        var diffs = [];
        for (var v = 1; v < avgs.length; v++) {
          diffs.push(Math.abs(avgs[v] - avgs[v - 1]));
        }
        var avgDiff = diffs.reduce(function(a, b) { return a + b; }, 0) / diffs.length;
        if (avgDiff > 15) {
          alerts.push({
            type: "HIGH_VARIANCE",
            severity: "MEDIUM",
            zone: zid,
            zoneName: config[zid].name || zid,
            message: "Inconsistent scores (avg swing: " + Math.round(avgDiff) + " points/week)",
            detail: "Scores: " + avgs.join("%, ") + "%. Suggests inconsistent practices between shifts.",
            action: "Standardize audit practices, consider shift-specific training"
          });
        }
      }
    });

    // ── Systemic pillar decline (same pillar dropping across multiple zones) ──
    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var recentNcByPillar = {};
    var fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
    for (var n = 1; n < ncData.length; n++) {
      var ncDate = ncData[n][NC_COL.CREATED];
      if (!(ncDate instanceof Date) || ncDate < fourWeeksAgo) continue;
      var pillar = v2ExtractPillar_(String(ncData[n][NC_COL.CRITERION_ID]));
      if (!recentNcByPillar[pillar]) recentNcByPillar[pillar] = {};
      var ncZone = String(ncData[n][NC_COL.ZONE_ID]);
      recentNcByPillar[pillar][ncZone] = (recentNcByPillar[pillar][ncZone] || 0) + 1;
    }
    Object.keys(recentNcByPillar).forEach(function(p) {
      var affectedZones = Object.keys(recentNcByPillar[p]).length;
      if (affectedZones >= 3) {
        alerts.push({
          type: "SYSTEMIC_PILLAR",
          severity: "HIGH",
          zone: "Plant-wide",
          zoneName: "All Zones",
          message: "Pillar " + p + " has NCs in " + affectedZones + " zones (last 4 weeks)",
          detail: "Zones affected: " + Object.keys(recentNcByPillar[p]).join(", "),
          action: "Plant-level " + p + " training, update standardized work instructions"
        });
      }
    });

    alerts.sort(function(a, b) {
      var sev = { HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    });

    return alerts;
  }, "getPredictiveTrendAlerts", [], "medium");
}


// ============================================================================
// IMP-10: WDGLL COMPARISON VIEW
// ============================================================================

/**
 * Returns WDGLL reference photos for a specific criterion and zone.
 * Used during audits to show "What Does Good Look Like" comparison.
 * @param {string} criterionId
 * @param {string} zoneId
 * @returns {Array} Photos with descriptions
 */
function getWDGLLComparison(criterionId, zoneId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var wdData = v2LoadSheet_(ss, "WDGLL_Library");
    var photos = [];

    for (var i = 1; i < wdData.length; i++) {
      var wZone = String(wdData[i][WD_COL.ZONE_ID]);
      var wCrit = String(wdData[i][WD_COL.CRITERION_ID]);
      var isActive = String(wdData[i][WD_COL.IS_ACTIVE]).toUpperCase() !== "FALSE";

      if (isActive && wCrit === criterionId && (wZone === zoneId || wZone === "ALL" || wZone === "")) {
        photos.push({
          photoUrl: String(wdData[i][WD_COL.PHOTO_URL]),
          description: String(wdData[i][WD_COL.DESCRIPTION]),
          uploadedBy: String(wdData[i][WD_COL.UPLOADED_BY]),
          uploadedDate: v2FormatDate_(wdData[i][WD_COL.UPLOADED_DATE])
        });
      }
    }
    return photos;
  }, "getWDGLLComparison", [], "low");
}


// ============================================================================
// IMP-11: TIERED MEETING DASHBOARD
// ============================================================================

/**
 * Returns filtered dashboard data based on tier level.
 * Tier 1: Zone-specific, today only, action focus
 * Tier 2: Cross-zone, this week, escalated items
 * Tier 3: Plant-wide, monthly trends, strategic
 * @param {number} tier — 1, 2, or 3
 * @param {string} [zoneId] — Required for Tier 1
 * @returns {Object} Tier-appropriate data
 */
function getTieredDashboardData(tier, zoneId) {
  return v2SafeExecute_(function() {
    tier = parseInt(tier) || 1;
    var result = {};

    if (tier === 1) {
      // Zone leader view: SQCDP + today's actions
      result.sqcdp = getSQCDPBoardData(zoneId);
      result.actions = getAutoActionList(zoneId);
      result.level = "TIER 1 — Zone Daily";
      result.focus = "Today's items for " + (zoneId || "your zone");
      result.meetingDuration = "5 minutes";

    } else if (tier === 2) {
      // Department leader view: cross-zone + escalated
      result.sqcdp = getSQCDPBoardData();
      result.actions = getAutoActionList();
      // Filter to only HIGH/CRITICAL
      result.actions.actions = result.actions.actions.filter(function(a) {
        return a.urgency === "CRITICAL" || a.urgency === "HIGH";
      });
      result.trendAlerts = getPredictiveTrendAlerts();
      result.level = "TIER 2 — Department Weekly";
      result.focus = "Cross-zone issues & trends";
      result.meetingDuration = "15 minutes";

    } else {
      // Plant management view: KPIs + risks + MRM inputs
      result.sqcdp = getSQCDPBoardData();
      result.riskRegister = getRiskRegisterData();
      result.kaizenROI = getKaizenROIData(3);
      result.mrm = getMRMReportData(1);
      result.trendAlerts = getPredictiveTrendAlerts();
      result.level = "TIER 3 — Plant Management Monthly";
      result.focus = "Strategic KPIs, risks, and improvement ROI";
      result.meetingDuration = "30 minutes";
    }

    result.tier = tier;
    result.generated = Utilities.formatDate(new Date(), TZ, "dd-MMM-yyyy HH:mm");
    return result;
  }, "getTieredDashboardData", null, "high");
}


// ============================================================================
// IMP-12: ONE-POINT LESSON (OPL) GENERATOR
// ============================================================================

/**
 * Generates a One-Point Lesson from a closed NC.
 * @param {string} ncId — The NC ID to generate OPL from
 * @returns {Object} OPL data
 */
function generateOPL(ncId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var wdData = v2LoadSheet_(ss, "WDGLL_Library");

    // Find the NC
    var nc = null;
    for (var i = 1; i < ncData.length; i++) {
      if (String(ncData[i][NC_COL.NC_ID]) === ncId) {
        nc = ncData[i]; break;
      }
    }
    if (!nc) return { success: false, message: "NC not found: " + ncId };

    var criterionId = String(nc[NC_COL.CRITERION_ID]);
    var zoneId = String(nc[NC_COL.ZONE_ID]);

    // Get WDGLL reference for this criterion
    var goodPhotos = getWDGLLComparison(criterionId, zoneId);

    var opl = {
      oplId: "OPL-" + ncId,
      title: "One-Point Lesson: " + criterionId + " — " + String(nc[NC_COL.CRITERION_LABEL]),
      zone: String(nc[NC_COL.ZONE_NAME]),
      criterion: criterionId,
      criterionLabel: String(nc[NC_COL.CRITERION_LABEL]),
      pillar: v2ExtractPillar_(criterionId),

      problem: {
        description: "Non-conformance detected — score: " + String(nc[NC_COL.SCORE]) + "/4",
        rootCause: String(nc[NC_COL.ROOT_CAUSE]) || "Root cause analysis pending",
        auditDate: v2FormatDate_(nc[NC_COL.AUDIT_DATE])
      },

      correctiveAction: {
        action: String(nc[NC_COL.CORRECTIVE_ACTION]) || "See CAPA record",
        preventiveAction: String(nc[NC_COL.PREVENTIVE_ACTION]) || "",
        verifiedBy: String(nc[NC_COL.VERIFIED_BY]) || "",
        remarks: String(nc[NC_COL.VERIFICATION_REMARKS]) || ""
      },

      correctMethod: {
        description: goodPhotos.length > 0 ? goodPhotos[0].description : "Refer to zone SOP",
        referencePhotos: goodPhotos
      },

      keyPoints: [
        String(nc[NC_COL.CORRECTIVE_ACTION]) || "Follow corrective action",
        String(nc[NC_COL.PREVENTIVE_ACTION]) || "Follow preventive measures",
        "Refer to WDGLL library for visual standard"
      ].filter(function(p) { return p && p !== "Follow corrective action" || String(nc[NC_COL.CORRECTIVE_ACTION]); }),

      generatedDate: Utilities.formatDate(new Date(), TZ, "dd-MMM-yyyy"),
      ncRef: ncId,
      success: true
    };

    return opl;
  }, "generateOPL", { success: false, message: "Error generating OPL" }, "medium");
}

/**
 * Returns list of closed NCs that can generate OPLs.
 * @returns {Array} NC summaries
 */
function getOPLCandidates() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_();
    var ncData = v2LoadSheet_(ss, "NC_CAPA");
    var candidates = [];

    for (var i = 1; i < ncData.length; i++) {
      if (String(ncData[i][NC_COL.STATUS]) === STATUS.CLOSED &&
          String(ncData[i][NC_COL.CORRECTIVE_ACTION])) {
        candidates.push({
          ncId: String(ncData[i][NC_COL.NC_ID]),
          criterion: String(ncData[i][NC_COL.CRITERION_ID]),
          label: String(ncData[i][NC_COL.CRITERION_LABEL]),
          zone: String(ncData[i][NC_COL.ZONE_NAME]),
          closedDate: v2FormatDate_(ncData[i][NC_COL.CLOSURE_DATE])
        });
      }
    }
    return candidates;
  }, "getOPLCandidates", [], "low");
}

// ============================================================================
// PARETO ANALYSIS — Plan D (Analytics & SPC)
// ============================================================================

/**
 * Returns Pareto analysis: root causes ranked by frequency for a pillar.
 * Implements the 80/20 rule — identify top causes driving most NCs.
 * Falls back to criterion ID when no RootCauseAnalysis sheet exists.
 * @param {string} pillar — "S" | "Q" | "C" | "D" | "P"
 * @param {string} [zoneId] — Optional zone filter
 * @param {number} [monthsBack] — Historical months to analyse (default 6)
 * @returns {Object} { causes: [{cause, count, percentage, cumulative}], total, pillarLabel }
 */
function getParetoByCause(pillar, zoneId, monthsBack) {
  return v2SafeExecute_(function() {
    monthsBack = monthsBack || 6;
    var cacheKey = "pm5s_pareto_" + pillar + "_" + (zoneId || "ALL") + "_" + monthsBack;
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch(e_) {}

    var ss = v2GetSpreadsheet_();
    var ncData = v2LoadSheet_(ss, "NC_CAPA");

    // Attempt to load optional RootCauseAnalysis sheet (columns: NC_ID, description, root_cause)
    var rcaData = null;
    try { rcaData = v2LoadSheet_(ss, "RootCauseAnalysis"); } catch(e_) {}

    var pillarLabel = { S: "Safety", Q: "Quality", C: "Cost", D: "Delivery", P: "People" };
    var causeCounts = {};
    var totalNCs = 0;

    var cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);

    for (var i = 1; i < ncData.length; i++) {
      var ncZone     = String(ncData[i][NC_COL.ZONE_ID]);
      var criterionId = String(ncData[i][NC_COL.CRITERION_ID] || "");
      var ncPillar   = v2ExtractPillar_(criterionId);
      var createdDate = ncData[i][NC_COL.CREATED];
      var status     = String(ncData[i][NC_COL.STATUS]);

      // Pillar match
      var pillarMatch = (pillar === "S" && ncPillar === "S6") ||
                        (pillar !== "S" && ncPillar.indexOf(pillar) === 0);
      if (!pillarMatch) continue;
      if (zoneId && ncZone !== zoneId) continue;
      if (!(createdDate instanceof Date) || createdDate < cutoffDate) continue;

      totalNCs++;

      // Look up root cause in RCA sheet, fallback to criterion ID
      var ncId = String(ncData[i][NC_COL.NC_ID] || "");
      var rootCause = null;
      if (rcaData && rcaData.length > 1) {
        for (var r = 1; r < rcaData.length; r++) {
          if (String(rcaData[r][0]) === ncId) {
            rootCause = String(rcaData[r][2] || "").trim() || null;
            break;
          }
        }
      }
      if (!rootCause) rootCause = criterionId || "Unknown";

      causeCounts[rootCause] = (causeCounts[rootCause] || 0) + 1;
    }

    // Sort descending, compute cumulative %
    var causes = Object.keys(causeCounts).map(function(cause) {
      return { cause: cause, count: causeCounts[cause] };
    }).sort(function(a, b) { return b.count - a.count; });

    var cumulative = 0;
    causes.forEach(function(item) {
      item.percentage = totalNCs > 0 ? Math.round((item.count / totalNCs) * 10000) / 100 : 0;
      cumulative += item.percentage;
      item.cumulative = Math.round(cumulative * 100) / 100;
    });

    var result = {
      causes: causes,
      total: totalNCs,
      pillarLabel: pillarLabel[pillar] || "Unknown",
      generatedAt: new Date().toISOString()
    };

    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 3600); } catch(e_) {}
    return result;
  }, "getParetoByCause", { causes: [], total: 0, pillarLabel: "" }, "medium");
}
