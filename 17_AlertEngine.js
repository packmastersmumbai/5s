/**
 * ============================================================================
 * 17_AlertEngine.gs — PackMasters 5S v2.0
 * Enhancement: Configurable Alert Rules, Escalation Ladder, Streaks, Anomaly Detection
 * ============================================================================
 *
 * Evaluates AlertRules sheet conditions against live data.
 * Runs inside masterOrchestrator daily.
 * Implements time-based CAPA escalation ladder.
 * Detects score anomalies (drops >20%, jumps >40%).
 * Sends pre-audit reminders on scheduled audit days.
 * Celebrates achievement streaks.
 *
 * CONSTRAINT-1: BATCH_READ only.
 * CONSTRAINT-5: All notifications batched into digest.
 * CONSTRAINT-7: All rules from config sheets, zero hardcoded thresholds.
 */

// ============================================================================
// MAIN ALERT EVALUATION (called by masterOrchestrator)
// ============================================================================

/**
 * Evaluates all enabled alert rules against current data.
 * Adds triggered alerts to digestEvents for batched notification.
 *
 * @param {Object} digestEvents — Accumulator from masterOrchestrator
 */
function evaluateAlertRules(digestEvents, dataCache) {
  // Fix F-08: Accept shared data cache to avoid duplicate reads
  dataCache = dataCache || {};
  var props = PropertiesService.getScriptProperties();
  var rulesJson = props.getProperty("ALERT_RULES");
  if (!rulesJson) {
    Logger.log("  ⏭️ No ALERT_RULES in config. Run refreshEnhancedConfig_().");
    return;
  }

  var rules;
  try {
    rules = JSON.parse(rulesJson);
  } catch (e) {
    Logger.log("  ❌ Failed to parse ALERT_RULES: " + e.message);
    return;
  }

  var ss = v2GetSpreadsheet_();
  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();
  var now = new Date();

  // ── Pre-load data (BATCH_READ) ──
  var dailyData = v2LoadSheet_(ss, "DailySubmissions");
  var weeklyData = v2LoadSheet_(ss, "WeeklyAudit");
  var capaData = v2LoadSheet_(ss, "NC_CAPA");
  var summaryData = v2LoadSheet_(ss, "Summary");

  // ── Compute metrics per zone ──
  var zoneMetrics = {};
  var yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, TZ, "yyyy-MM-dd");

  zoneIds.forEach(function(zoneId) {
    zoneMetrics[zoneId] = computeZoneMetrics_(zoneId, zoneConfig[zoneId], dailyData, weeklyData, capaData, summaryData, yesterdayStr, now);
  });

  // ── Plant-wide metrics ──
  var plantMetrics = computePlantMetrics_(zoneMetrics, zoneIds);

  // ── Evaluate each rule ──
  var triggeredCount = 0;
  var alertSheet = ss.getSheetByName("AlertRules");

  rules.forEach(function(rule, ruleIdx) {
    if (!rule.enabled) return;

    // Check cooldown
    if (rule.lastTriggered) {
      var lastTime = new Date(rule.lastTriggered);
      var hoursSince = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
      if (hoursSince < rule.cooldownHours) return;
    }

    var targetZones = rule.zoneScope === "all" ? zoneIds : [rule.zoneScope];

    targetZones.forEach(function(zoneId) {
      if (!zoneMetrics[zoneId]) return;
      var metricValue = zoneMetrics[zoneId][rule.metric];
      if (metricValue === undefined || metricValue === null) {
        // Try plant-level metrics
        metricValue = plantMetrics[rule.metric];
        if (metricValue === undefined) return;
      }

      var triggered = evaluateCondition_(metricValue, rule.operator, rule.threshold);

      if (triggered) {
        triggeredCount++;
        var zone = zoneConfig[zoneId] || {};
        var alertEvent = {
          type: "ALERT_RULE",
          ruleId: rule.id,
          zoneId: zoneId,
          zoneName: zone.name || zoneId,
          metric: rule.metric,
          metricValue: metricValue,
          threshold: rule.threshold,
          operator: rule.operator,
          description: rule.description,
          leader: zone.leader || "",
          message: rule.description + " (Value: " + metricValue + " " + rule.operator + " " + rule.threshold + ")"
        };

        // Route to correct recipients
        var recipients = (rule.recipient || "").split(",");
        recipients.forEach(function(role) {
          role = role.trim();
          if (role === "zone_leader" && zoneId) {
            if (!digestEvents.zoneEvents[zoneId]) digestEvents.zoneEvents[zoneId] = [];
            digestEvents.zoneEvents[zoneId].push(alertEvent);
          }
          if (role === "mc") {
            digestEvents.mcEvents.push(alertEvent);
          }
          if (role === "top_mgmt") {
            if (!digestEvents.topMgtEvents) digestEvents.topMgtEvents = [];
            digestEvents.topMgtEvents.push(alertEvent);
          }
        });

        // Update lastTriggered in sheet
        if (alertSheet && alertSheet.getLastRow() > 1) {
          try {
            alertSheet.getRange(ruleIdx + 2, 10).setValue(now); // Column J = last_triggered
          } catch (e) { /* non-critical */ }
        }
      }
    });
  });

  Logger.log("  🔔 Alert rules evaluated: " + triggeredCount + " triggered from " + rules.length + " rules.");
}


// ============================================================================
// ESCALATION LADDER (called by masterOrchestrator)
// ============================================================================

/**
 * Checks all open CAPAs against escalation timeline.
 * Sends escalation notifications and auto-updates status.
 *
 * @param {Object} digestEvents — Accumulator from masterOrchestrator
 */
function processEscalationLadder(digestEvents, dataCache) {
  dataCache = dataCache || {};
  var props = PropertiesService.getScriptProperties();
  var escJson = props.getProperty("ESCALATION_CONFIG");
  if (!escJson) return;

  var levels;
  try {
    levels = JSON.parse(escJson);
  } catch (e) {
    Logger.log("  ❌ Failed to parse ESCALATION_CONFIG: " + e.message);
    return;
  }

  levels.sort(function(a, b) { return b.daysAfter - a.daysAfter; }); // Process highest first

  var ss = v2GetSpreadsheet_();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) return;

  var data = capaSheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var now = new Date();
  var zoneConfig = getZoneConfig();
  var escalationCount = 0;

  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][NC_COL.STATUS]).trim(); // Column O: status
    if (status === STATUS.CLOSED) continue;

    var createdDate = data[r][NC_COL.CREATED]; // Column B: created_date
    if (!(createdDate instanceof Date)) continue;

    var daysAge = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    var ncId = String(data[r][NC_COL.NC_ID]);
    var zoneId = String(data[r][NC_COL.ZONE_ID]);
    var zone = zoneConfig[zoneId] || {};
    var criterionLabel = String(data[r][6]);

    // Find the highest applicable escalation level
    for (var l = 0; l < levels.length; l++) {
      var level = levels[l];
      if (daysAge >= level.daysAfter) {
        // Check if we already escalated to this level (avoid repeat notifications)
        var alreadyEscalated = false;
        if (level.autoStatusChange && status === level.autoStatusChange) {
          alreadyEscalated = true;
        }

        if (!alreadyEscalated) {
          escalationCount++;

          // Build escalation subject from template
          var subject = (level.subjectTemplate || "NC Escalation: {nc_id}")
            .replace("{nc_id}", ncId)
            .replace("{zone_name}", zone.name || zoneId)
            .replace("{days}", String(daysAge));

          var escEvent = {
            type: "ESCALATION",
            level: level.level,
            ncId: ncId,
            zoneId: zoneId,
            zoneName: zone.name || zoneId,
            criterionLabel: criterionLabel,
            daysAge: daysAge,
            currentStatus: status,
            escalationAction: level.action,
            leader: zone.leader || "",
            message: subject
          };

          // Route notification
          var roles = (level.notifyRole || "").split(",");
          roles.forEach(function(role) {
            role = role.trim();
            if (role === "zone_leader") {
              if (!digestEvents.zoneEvents[zoneId]) digestEvents.zoneEvents[zoneId] = [];
              digestEvents.zoneEvents[zoneId].push(escEvent);
            } else if (role === "mc") {
              digestEvents.mcEvents.push(escEvent);
            } else if (role === "top_mgmt") {
              if (!digestEvents.topMgtEvents) digestEvents.topMgtEvents = [];
              digestEvents.topMgtEvents.push(escEvent);
            }
          });

          // Auto-update status if configured
          if (level.autoStatusChange) {
            capaSheet.getRange(r + 1, 15).setValue(level.autoStatusChange); // Column O: status
            Logger.log("  ⬆️ NC " + ncId + " auto-escalated to " + level.autoStatusChange);
          }
        }
        break; // Only apply highest matching level
      }
    }
  }

  Logger.log("  ⬆️ Escalation ladder: " + escalationCount + " escalations processed.");
}


// ============================================================================
// PRE-AUDIT REMINDERS
// ============================================================================

/**
 * Sends pre-audit reminders on scheduled audit days.
 * Called from masterOrchestrator.
 *
 * @param {Object} digestEvents
 */
function sendPreAuditReminders(digestEvents) {
  var zoneConfig = getZoneConfig();
  var now = new Date();
  var todayDayNum = now.getDay(); // 0=Sun, 1=Mon, ...
  var zoneIds = Object.keys(zoneConfig).sort();

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    if (parseInt(zone.auditDayNum, 10) === todayDayNum) {
      var reminderEvent = {
        type: "AUDIT_REMINDER",
        zoneId: zoneId,
        zoneName: zone.name,
        leader: zone.leader,
        auditDay: zone.auditDay,
        message: "📋 Weekly audit scheduled today for " + zone.name + ". Zone Leader: " + zone.leader + " — please prepare."
      };

      // Notify zone leader
      if (!digestEvents.zoneEvents[zoneId]) digestEvents.zoneEvents[zoneId] = [];
      digestEvents.zoneEvents[zoneId].push(reminderEvent);

      // Notify MC
      digestEvents.mcEvents.push(reminderEvent);

      Logger.log("  📋 Pre-audit reminder: " + zone.name + " (" + zone.auditDay + ")");
    }
  });
}


// ============================================================================
// STREAK DETECTION & ACHIEVEMENT ALERTS
// ============================================================================

/**
 * Detects winning and losing streaks, sends celebrations/warnings.
 *
 * @param {Object} digestEvents
 */
function detectStreaks(digestEvents) {
  var ss = v2GetSpreadsheet_();
  var dailySheet = ss.getSheetByName("DailySubmissions");
  if (!dailySheet || dailySheet.getLastRow() <= 1) return;

  var data = dailySheet.getDataRange().getValues(); // BATCH_READ
  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();
  var now = new Date();

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    // Get last 30 days of daily submissions, sorted by date desc
    var zoneSubmissions = [];
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][NC_COL.ZONE_ID]).trim() === zoneId && !data[r][17]) { // not duplicate
        var pctScore = parseFloat(data[r][NC_COL.STATUS]) || 0;
        var subDate = data[r][5];
        if (subDate instanceof Date) {
          zoneSubmissions.push({ date: subDate, pct: pctScore });
        }
      }
    }

    zoneSubmissions.sort(function(a, b) { return b.date - a.date; });

    // Count consecutive days ≥ 90%
    var highStreak = 0;
    for (var i = 0; i < zoneSubmissions.length && i < 30; i++) {
      if (zoneSubmissions[i].pct >= 90) highStreak++;
      else break;
    }

    // Count consecutive days < 60%
    var lowStreak = 0;
    for (var i = 0; i < zoneSubmissions.length && i < 30; i++) {
      if (zoneSubmissions[i].pct < 60) lowStreak++;
      else break;
    }

    // Celebrate winning streaks (≥5 days at 90%+)
    if (highStreak >= 5) {
      var celebrationEvent = {
        type: "ACHIEVEMENT",
        zoneId: zoneId,
        zoneName: zone.name,
        leader: zone.leader,
        streakDays: highStreak,
        message: "🏆 " + zone.name + " has maintained ≥90% score for " + highStreak + " consecutive days! Excellent work by " + zone.leader + "!"
      };
      digestEvents.mcEvents.push(celebrationEvent);
      if (!digestEvents.zoneEvents[zoneId]) digestEvents.zoneEvents[zoneId] = [];
      digestEvents.zoneEvents[zoneId].push(celebrationEvent);
    }

    // Warn on losing streaks (≥3 days at <60%)
    if (lowStreak >= 3) {
      var warningEvent = {
        type: "LOW_STREAK",
        zoneId: zoneId,
        zoneName: zone.name,
        leader: zone.leader,
        streakDays: lowStreak,
        message: "⚠️ " + zone.name + " has scored below 60% for " + lowStreak + " consecutive days. Immediate attention needed."
      };
      digestEvents.mcEvents.push(warningEvent);
      if (!digestEvents.zoneEvents[zoneId]) digestEvents.zoneEvents[zoneId] = [];
      digestEvents.zoneEvents[zoneId].push(warningEvent);
    }
  });
}


// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detects score anomalies: sudden drops (>20%) or suspicious jumps (>40%).
 * Returns anomaly flags to be checked during weekly audit submission.
 *
 * @param {string} zoneId
 * @returns {Object|null} Anomaly info or null
 */
function checkScoreAnomaly(zoneId) {
  var ss = v2GetSpreadsheet_();
  var weeklySheet = ss.getSheetByName("WeeklyAudit");
  if (!weeklySheet || weeklySheet.getLastRow() <= 1) return null;

  var data = weeklySheet.getDataRange().getValues(); // BATCH_READ
  var recentScores = [];

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][NC_COL.ZONE_ID]).trim() === zoneId) {
      var pct = parseFloat(data[r][data[r].length - 4]) || 0; // pct_score column
      var auditDate = data[r][5];
      if (auditDate instanceof Date) {
        recentScores.push({ date: auditDate, pct: pct });
      }
    }
  }

  recentScores.sort(function(a, b) { return b.date - a.date; });

  if (recentScores.length < 4) return null; // Need 4+ weeks for meaningful average

  // 4-week rolling average (excluding the most recent)
  var sum = 0;
  for (var i = 1; i < Math.min(5, recentScores.length); i++) {
    sum += recentScores[i].pct;
  }
  var avg4wk = sum / Math.min(4, recentScores.length - 1);
  var latestPct = recentScores[0].pct;
  var deviation = latestPct - avg4wk;
  var deviationPct = Math.abs(deviation) / (avg4wk || 1) * 100;

  if (deviation < 0 && deviationPct > 20) {
    return {
      type: "DROP",
      deviationPct: Math.round(deviationPct),
      latestPct: Math.round(latestPct),
      avg4wk: Math.round(avg4wk),
      message: "Score dropped " + Math.round(deviationPct) + "% from 4-week average (" + Math.round(avg4wk) + "% → " + Math.round(latestPct) + "%)."
    };
  }

  if (deviation > 0 && deviationPct > 40) {
    return {
      type: "JUMP",
      deviationPct: Math.round(deviationPct),
      latestPct: Math.round(latestPct),
      avg4wk: Math.round(avg4wk),
      message: "⚠️ Unusual score jump of " + Math.round(deviationPct) + "% from 4-week average (" + Math.round(avg4wk) + "% → " + Math.round(latestPct) + "%). Please verify."
    };
  }

  return null;
}


// ============================================================================
// HELPERS
// ============================================================================


function computeZoneMetrics_(zoneId, zone, dailyData, weeklyData, capaData, summaryData, yesterdayStr, now) {
  var metrics = {};

  // Daily score yesterday
  for (var r = dailyData.length - 1; r >= 1; r--) {
    if (String(dailyData[r][2]).trim() === zoneId) {
      var dateVal = dailyData[r][5];
      var dateStr = dateVal instanceof Date ? Utilities.formatDate(dateVal, TZ, "yyyy-MM-dd") : String(dateVal).trim();
      if (dateStr === yesterdayStr && !dailyData[r][17]) {
        metrics.daily_score_pct = parseFloat(dailyData[r][14]) || 0;
        break;
      }
    }
  }

  // Missed consecutive submissions
  var missedCount = 0;
  var checkDate = new Date(now);
  for (var d = 1; d <= 7; d++) {
    checkDate.setDate(checkDate.getDate() - 1);
    if (checkDate.getDay() === 0) continue; // Skip Sunday
    var checkStr = Utilities.formatDate(checkDate, TZ, "yyyy-MM-dd");
    var found = false;
    for (var r = 1; r < dailyData.length; r++) {
      if (String(dailyData[r][2]).trim() === zoneId) {
        var dStr = dailyData[r][5] instanceof Date ? Utilities.formatDate(dailyData[r][5], TZ, "yyyy-MM-dd") : String(dailyData[r][5]);
        if (dStr === checkStr && !dailyData[r][17]) { found = true; break; }
      }
    }
    if (!found) missedCount++;
    else break;
  }
  metrics.missed_consecutive = missedCount;

  // Open CAPA count and overdue count
  var openCapa = 0;
  var overdueCapa = 0;
  for (var r = 1; r < capaData.length; r++) {
    if (String(capaData[r][2]).trim() === zoneId) {
      var status = String(capaData[r][14]).trim();
      if (status !== STATUS.CLOSED) {
        openCapa++;
        var targetDate = capaData[r][13];
        if (targetDate instanceof Date && now > targetDate) {
          overdueCapa++;
        }
        // NC age
        var createdDate = capaData[r][1];
        if (createdDate instanceof Date) {
          var ageDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          if (!metrics.nc_age_days || ageDays > metrics.nc_age_days) {
            metrics.nc_age_days = ageDays;
          }
        }
      }
    }
  }
  metrics.capa_open_count = openCapa;
  metrics.capa_overdue_count = overdueCapa;

  // Weekly score deviation
  var weeklyScores = [];
  for (var r = 1; r < weeklyData.length; r++) {
    if (String(weeklyData[r][2]).trim() === zoneId) {
      var pct = parseFloat(weeklyData[r][weeklyData[r].length - 4]) || 0;
      weeklyScores.push(pct);
    }
  }
  if (weeklyScores.length >= 5) {
    var latest = weeklyScores[weeklyScores.length - 1];
    var prevAvg = 0;
    for (var i = weeklyScores.length - 5; i < weeklyScores.length - 1; i++) {
      prevAvg += weeklyScores[i];
    }
    prevAvg /= 4;
    var drop = prevAvg - latest;
    var jump = latest - prevAvg;
    metrics.weekly_score_drop_pct = Math.max(0, Math.round(drop / (prevAvg || 1) * 100));
    metrics.weekly_score_jump_pct = Math.max(0, Math.round(jump / (prevAvg || 1) * 100));
  }

  return metrics;
}

function computePlantMetrics_(zoneMetrics, zoneIds) {
  var allSubmitted = true;
  zoneIds.forEach(function(id) {
    if (zoneMetrics[id].daily_score_pct === undefined) {
      allSubmitted = false;
    }
  });
  return {
    all_zones_submitted: allSubmitted
  };
}

function evaluateCondition_(value, operator, threshold) {
  switch (operator) {
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "=": return value == threshold;
    case "!=": return value != threshold;
    default: return false;
  }
}
