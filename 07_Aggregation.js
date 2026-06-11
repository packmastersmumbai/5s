/**
 * ============================================================================
 * 07_Aggregation.gs — PackMasters 5S Integrated System
 * Phase 3: Weekly & Monthly Data Aggregation
 * ============================================================================
 *
 * Computes pre-aggregated summaries and writes to the Summary sheet.
 * The Summary sheet is the ONLY sheet read by dashboards (Phase 4).
 *
 * CONSTRAINT-1: BATCH_READ — one getDataRange().getValues() per source read.
 * CONSTRAINT-3: Atomic writes — build complete row arrays before any write.
 *
 * Functions:
 *   weeklyRollup()                — 7-day summary per zone from DailySubmissions
 *   monthlyRollup()               — Full month aggregation from WeeklyAudit
 *   buildSummaryRow_(zoneId, ...)  — Constructs a Summary sheet row
 *   computePillarScores_(rows, schema) — Calculates per-pillar averages
 *   checkMissedSubmissions(digestEvents) — Identifies zones missing yesterday's daily
 */

// ============================================================================
// WEEKLY ROLLUP
// ============================================================================

/**
 * Computes 7-day rolling summary for each zone from DailySubmissions.
 * Writes/updates rows in the Summary sheet with period_type = "weekly".
 *
 * Called by masterOrchestrator() on Mondays.
 */
function weeklyRollup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var zoneConfig = getZoneConfig();
  var schema = getChecklistSchema();
  var zoneIds = Object.keys(zoneConfig).sort();

  // ── Read DailySubmissions (BATCH_READ) ──
  var dailySheet = ss.getSheetByName("DailySubmissions");
  if (!dailySheet || dailySheet.getLastRow() <= 1) {
    Logger.log("  ⏭️ No daily submissions to roll up.");
    return;
  }
  var dailyData = dailySheet.getDataRange().getValues(); // BATCH_READ
  var dailyHeaders = dailyData[0];

  // ── Determine 7-day window ──
  var now = new Date();
  var sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  var currentMonth = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM");
  var currentYear = Utilities.formatDate(now, "Asia/Kolkata", "yyyy");

  // ── Column indices (0-based) ──
  var COL = {
    zone_id: 2,
    submission_date: 5,
    s1: 7, s2: 8, s3: 9, s4: 10, s5: 11,
    total_pass: 12,
    total_criteria: 13,
    pct_score: 14,
    is_duplicate: 17
  };

  // ── Aggregate per zone ──
  var summaryRows = [];

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    var zoneRows = [];

    for (var r = 1; r < dailyData.length; r++) {
      var row = dailyData[r];
      if (String(row[COL.zone_id]).trim() !== zoneId) continue;
      if (row[COL.is_duplicate] === true) continue; // Skip duplicates

      var rowDate;
      if (row[COL.submission_date] instanceof Date) {
        rowDate = row[COL.submission_date];
      } else {
        rowDate = new Date(String(row[COL.submission_date]));
      }

      if (isNaN(rowDate.getTime())) continue;
      if (rowDate < sevenDaysAgo) continue;

      zoneRows.push({
        s1: Number(row[COL.s1]) || 0,
        s2: Number(row[COL.s2]) || 0,
        s3: Number(row[COL.s3]) || 0,
        s4: Number(row[COL.s4]) || 0,
        s5: Number(row[COL.s5]) || 0,
        total_pass: Number(row[COL.total_pass]) || 0,
        total_criteria: Number(row[COL.total_criteria]) || 0,
        pct_score: Number(row[COL.pct_score]) || 0,
        date: rowDate
      });
    }

    // Compute averages
    var count = zoneRows.length;
    if (count === 0) {
      summaryRows.push(buildSummaryRow_(zoneId, zone.name, currentMonth, currentYear,
        "weekly", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "", "", now));
      return;
    }

    var s1Avg = average_(zoneRows.map(function(r) { return r.s1; }));
    var s2Avg = average_(zoneRows.map(function(r) { return r.s2; }));
    var s3Avg = average_(zoneRows.map(function(r) { return r.s3; }));
    var s4Avg = average_(zoneRows.map(function(r) { return r.s4; }));
    var s5Avg = average_(zoneRows.map(function(r) { return r.s5; }));
    var totalAvg = average_(zoneRows.map(function(r) { return r.total_pass; }));
    var pctAvg = average_(zoneRows.map(function(r) { return r.pct_score; }));

    // Find last daily date
    var lastDate = zoneRows.reduce(function(max, r) {
      return r.date > max ? r.date : max;
    }, zoneRows[0].date);
    var lastDateStr = Utilities.formatDate(lastDate, "Asia/Kolkata", "yyyy-MM-dd");

    // Daily submission rate (out of 7 days, excluding Sunday)
    var workingDays = 6; // Mon-Sat
    var submissionRate = Math.min(Math.round((count / workingDays) * 100), 100);

    summaryRows.push(buildSummaryRow_(zoneId, zone.name, currentMonth, currentYear,
      "weekly", s1Avg, s2Avg, s3Avg, s4Avg, s5Avg, totalAvg, pctAvg,
      count, 0, 0, count, submissionRate, lastDateStr, "", now));
  });

  // ── Write to Summary sheet ──
  writeSummaryRows_(ss, summaryRows, "weekly", currentMonth);

  Logger.log("  ✅ Weekly rollup complete: " + summaryRows.length + " zone summaries written.");
}


// ============================================================================
// MONTHLY ROLLUP
// ============================================================================

/**
 * Aggregates all weekly audit scores for the prior month.
 * Computes per-pillar averages, NC counts, and closure rates per zone.
 * Writes to Summary sheet with period_type = "monthly".
 *
 * Called by masterOrchestrator() on the 1st of each month.
 * Also sends MRM digest to TOP_MGT via digestEvents.
 */
function monthlyRollup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var zoneConfig = getZoneConfig();
  var schema = getChecklistSchema();
  var zoneIds = Object.keys(zoneConfig).sort();

  // Prior month calculation
  var now = new Date();
  var priorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var priorMonthStr = Utilities.formatDate(priorMonth, "Asia/Kolkata", "yyyy-MM");
  var priorYear = Utilities.formatDate(priorMonth, "Asia/Kolkata", "yyyy");
  var priorMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prior month

  // ── Read WeeklyAudit (BATCH_READ) ──
  var weeklySheet = ss.getSheetByName("WeeklyAudit");
  var weeklyData = [];
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    weeklyData = weeklySheet.getDataRange().getValues(); // BATCH_READ
  }

  // ── Read NC_CAPA (BATCH_READ) ──
  var capaSheet = ss.getSheetByName("NC_CAPA");
  var capaData = [];
  if (capaSheet && capaSheet.getLastRow() > 1) {
    capaData = capaSheet.getDataRange().getValues(); // BATCH_READ
  }

  // ── Read DailySubmissions for submission rate (BATCH_READ) ──
  var dailySheet = ss.getSheetByName("DailySubmissions");
  var dailyData = [];
  if (dailySheet && dailySheet.getLastRow() > 1) {
    dailyData = dailySheet.getDataRange().getValues(); // BATCH_READ
  }

  // ── WeeklyAudit column indices ──
  var WK_COL = {
    zone_id: 2,
    audit_date: 5,
    total_score: -6,   // Relative from end; we'll compute dynamically
    max_score: -5,
    pct_score: -4,
    nc_count: -3
  };

  // Criterion columns start at index 6
  var criteriaStartCol = 6;
  var criteriaCount = schema.criteria.length;

  var summaryRows = [];
  var mrmData = []; // For MRM digest email

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];

    // ── Filter weekly audits for this zone in prior month ──
    var zoneAudits = [];
    for (var r = 1; r < weeklyData.length; r++) {
      var row = weeklyData[r];
      if (String(row[2]).trim() !== zoneId) continue;

      var auditDate;
      if (row[5] instanceof Date) {
        auditDate = row[5];
      } else {
        auditDate = new Date(String(row[5]));
      }
      if (isNaN(auditDate.getTime())) continue;

      var auditMonthStr = Utilities.formatDate(auditDate, "Asia/Kolkata", "yyyy-MM");
      if (auditMonthStr !== priorMonthStr) continue;

      // Extract per-criterion scores
      var criterionScores = {};
      schema.criteria.forEach(function(c, idx) {
        criterionScores[c.id] = Number(row[criteriaStartCol + idx]) || 0;
      });

      // Summary columns are after all criteria
      var summaryStartCol = criteriaStartCol + criteriaCount;

      zoneAudits.push({
        criterionScores: criterionScores,
        totalScore: Number(row[summaryStartCol]) || 0,
        maxScore: Number(row[summaryStartCol + 1]) || 0,
        pctScore: Number(row[summaryStartCol + 2]) || 0,
        ncCount: Number(row[summaryStartCol + 3]) || 0,
        date: auditDate
      });
    }

    // ── Compute per-pillar averages ──
    var pillarAvgs = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0 };
    if (zoneAudits.length > 0) {
      schema.pillars.forEach(function(pillar) {
        var pillarCriteria = schema.criteria.filter(function(c) { return c.pillar === pillar; });
        var pillarMaxPerAudit = pillarCriteria.reduce(function(s, c) { return s + c.maxScore; }, 0);

        var pillarScoreSum = 0;
        zoneAudits.forEach(function(audit) {
          pillarCriteria.forEach(function(c) {
            pillarScoreSum += audit.criterionScores[c.id] || 0;
          });
        });

        pillarAvgs[pillar] = pillarMaxPerAudit > 0 ?
          round2_(pillarScoreSum / (zoneAudits.length * pillarMaxPerAudit) * 100) : 0;
      });
    }

    // ── NC counts for this zone in prior month ──
    var ncCount = 0;
    var ncClosed = 0;
    for (var c = 1; c < capaData.length; c++) {
      var capaRow = capaData[c];
      if (String(capaRow[2]).trim() !== zoneId) continue; // zone_id col

      var capaDate;
      if (capaRow[1] instanceof Date) {
        capaDate = capaRow[1];
      } else {
        capaDate = new Date(String(capaRow[1]));
      }
      if (isNaN(capaDate.getTime())) continue;

      var capaMonthStr = Utilities.formatDate(capaDate, "Asia/Kolkata", "yyyy-MM");
      if (capaMonthStr !== priorMonthStr) continue;

      ncCount++;
      if (String(capaRow[14]).trim().toUpperCase() === "CLOSED") {
        ncClosed++;
      }
    }

    // ── Daily submission count for prior month ──
    var dailyCount = 0;
    var lastDailyDate = "";
    for (var d = 1; d < dailyData.length; d++) {
      var dRow = dailyData[d];
      if (String(dRow[2]).trim() !== zoneId) continue;
      if (dRow[17] === true) continue; // Skip duplicates

      var dDate;
      if (dRow[5] instanceof Date) {
        dDate = dRow[5];
      } else {
        dDate = new Date(String(dRow[5]));
      }
      if (isNaN(dDate.getTime())) continue;

      var dMonthStr = Utilities.formatDate(dDate, "Asia/Kolkata", "yyyy-MM");
      if (dMonthStr !== priorMonthStr) continue;

      dailyCount++;
      var dDateStr = Utilities.formatDate(dDate, "Asia/Kolkata", "yyyy-MM-dd");
      if (dDateStr > lastDailyDate) lastDailyDate = dDateStr;
    }

    // Working days in prior month (Mon-Sat)
    var workingDays = countWorkingDays_(priorMonth, priorMonthEnd);
    var dailyRate = workingDays > 0 ? Math.min(Math.round((dailyCount / workingDays) * 100), 100) : 0;

    // Total average score
    var totalAvg = zoneAudits.length > 0 ?
      round2_(average_(zoneAudits.map(function(a) { return a.totalScore; }))) : 0;
    var pctAvg = zoneAudits.length > 0 ?
      round2_(average_(zoneAudits.map(function(a) { return a.pctScore; }))) : 0;

    // Last audit date
    var lastAuditDate = "";
    if (zoneAudits.length > 0) {
      var maxAuditDate = zoneAudits.reduce(function(max, a) { return a.date > max ? a.date : max; }, zoneAudits[0].date);
      lastAuditDate = Utilities.formatDate(maxAuditDate, "Asia/Kolkata", "yyyy-MM-dd");
    }

    summaryRows.push(buildSummaryRow_(
      zoneId, zone.name, priorMonthStr, priorYear,
      "monthly",
      pillarAvgs.S1, pillarAvgs.S2, pillarAvgs.S3, pillarAvgs.S4, pillarAvgs.S5,
      totalAvg, pctAvg,
      zoneAudits.length, ncCount, ncClosed,
      dailyCount, dailyRate,
      lastDailyDate, lastAuditDate, now
    ));

    mrmData.push({
      zoneId: zoneId,
      zoneName: zone.name,
      leader: zone.leader,
      auditCount: zoneAudits.length,
      pillarAvgs: pillarAvgs,
      pctAvg: pctAvg,
      ncCount: ncCount,
      ncClosed: ncClosed,
      dailyRate: dailyRate
    });
  });

  // ── Write to Summary sheet ──
  writeSummaryRows_(ss, summaryRows, "monthly", priorMonthStr);

  // ── Send MRM digest to Top Management ──
  if (mrmData.length > 0) {
    try {
      sendMRMDigest_(priorMonthStr, mrmData);
    } catch (e) {
      Logger.log("  ⚠️ MRM digest email error: " + e.message);
    }
  }

  Logger.log("  ✅ Monthly rollup complete for " + priorMonthStr + ": " + summaryRows.length + " zone summaries.");
}


// ============================================================================
// MISSED SUBMISSION DETECTION
// ============================================================================

/**
 * Identifies zones that did not submit a daily checksheet yesterday.
 * Adds events to the digest accumulator for ZL notification.
 *
 * @param {Object} digestEvents — Accumulator object from masterOrchestrator
 */
function checkMissedSubmissions(digestEvents) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var zoneConfig = getZoneConfig();
  var zoneIds = Object.keys(zoneConfig).sort();

  // Yesterday's date
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, "Asia/Kolkata", "yyyy-MM-dd");
  var yesterdayDay = yesterday.getDay(); // 0=Sun

  // Skip Sunday check (no submissions expected on Sunday)
  if (yesterdayDay === 0) {
    Logger.log("  ⏭️ Yesterday was Sunday — no submissions expected.");
    return;
  }

  // ── Read DailySubmissions (BATCH_READ) ──
  var dailySheet = ss.getSheetByName("DailySubmissions");
  var submittedZones = {};

  if (dailySheet && dailySheet.getLastRow() > 1) {
    var data = dailySheet.getDataRange().getValues(); // BATCH_READ
    for (var r = 1; r < data.length; r++) {
      var rowZoneId = String(data[r][2]).trim();
      var rowDate;
      if (data[r][5] instanceof Date) {
        rowDate = Utilities.formatDate(data[r][5], "Asia/Kolkata", "yyyy-MM-dd");
      } else {
        rowDate = String(data[r][5]).trim();
      }
      var isDup = data[r][17];

      if (rowDate === yesterdayStr && !isDup) {
        submittedZones[rowZoneId] = true;
      }
    }
  }

  // ── Check each zone ──
  var missedCount = 0;
  zoneIds.forEach(function(zoneId) {
    if (!submittedZones[zoneId]) {
      missedCount++;
      var zone = zoneConfig[zoneId];
      var event = {
        type: "MISSED_DAILY",
        zoneId: zoneId,
        zoneName: zone.name,
        date: yesterdayStr,
        leader: zone.leader,
        message: "No daily checksheet submitted for " + yesterdayStr
      };

      // Add to zone-specific events
      if (!digestEvents.zoneEvents[zoneId]) {
        digestEvents.zoneEvents[zoneId] = [];
      }
      digestEvents.zoneEvents[zoneId].push(event);

      // Add to MC events
      digestEvents.mcEvents.push(event);
    }
  });

  Logger.log("  📊 Missed submissions for " + yesterdayStr + ": " + missedCount + "/" + zoneIds.length + " zones");
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Builds a complete Summary sheet row array.
 * @private
 */
function buildSummaryRow_(zoneId, zoneName, month, year, periodType,
  s1Avg, s2Avg, s3Avg, s4Avg, s5Avg, totalAvg, pctScore,
  auditCount, ncCount, ncClosed, dailyCount, dailyRate,
  lastDailyDate, lastAuditDate, computedAt) {

  return [
    zoneId,                          // A: zone_id
    zoneName,                        // B: zone_name
    month,                           // C: month (yyyy-MM)
    year,                            // D: year
    periodType,                      // E: period_type
    round2_(s1Avg),                  // F: s1_avg
    round2_(s2Avg),                  // G: s2_avg
    round2_(s3Avg),                  // H: s3_avg
    round2_(s4Avg),                  // I: s4_avg
    round2_(s5Avg),                  // J: s5_avg
    round2_(totalAvg),               // K: total_avg
    round2_(pctScore),               // L: pct_score
    auditCount,                      // M: audit_count
    ncCount,                         // N: nc_count
    ncClosed,                        // O: nc_closed
    dailyCount,                      // P: daily_submission_count
    dailyRate,                       // Q: daily_submission_rate
    lastDailyDate || "",             // R: last_daily_date
    lastAuditDate || "",             // S: last_audit_date
    computedAt                       // T: computed_at
  ];
}

/**
 * Writes summary rows to the Summary sheet.
 * Removes existing rows for the same period_type + month before writing.
 *
 * @param {Spreadsheet} ss
 * @param {Array[]} rows — Array of row arrays
 * @param {string} periodType — "weekly" or "monthly"
 * @param {string} month — yyyy-MM
 * @private
 */
function writeSummaryRows_(ss, rows, periodType, month) {
  var summarySheet = ss.getSheetByName("Summary");
  if (!summarySheet) {
    Logger.log("  ⚠️ Summary sheet not found.");
    return;
  }

  // Remove existing rows for same period+month (BATCH_READ then delete)
  if (summarySheet.getLastRow() > 1) {
    var existingData = summarySheet.getDataRange().getValues(); // BATCH_READ
    var rowsToDelete = [];

    for (var r = existingData.length - 1; r >= 1; r--) {
      if (String(existingData[r][4]).trim() === periodType &&
        String(existingData[r][2]).trim() === month) {
        rowsToDelete.push(r + 1); // 1-based row number
      }
    }

    // Delete from bottom up to avoid index shifting
    rowsToDelete.forEach(function(rowNum) {
      summarySheet.deleteRow(rowNum);
    });
  }

  // Write new rows
  if (rows.length > 0) {
    summarySheet.getRange(summarySheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  }
}

/**
 * Calculates average of a numeric array.
 * @private
 */
function average_(arr) {
  if (!arr || arr.length === 0) return 0;
  var sum = arr.reduce(function(s, v) { return s + (Number(v) || 0); }, 0);
  return sum / arr.length;
}

/**
 * Rounds to 2 decimal places.
 * @private
 */
function round2_(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

/**
 * Counts working days (Mon-Sat) between two dates inclusive.
 * @private
 */
function countWorkingDays_(startDate, endDate) {
  var count = 0;
  var current = new Date(startDate);
  while (current <= endDate) {
    var day = current.getDay();
    if (day !== 0) count++; // Exclude Sunday
    current.setDate(current.getDate() + 1);
  }
  return count;
}
