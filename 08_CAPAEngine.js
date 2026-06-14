/**
 * ============================================================================
 * 08_CAPAEngine.gs — PackMasters 5S Integrated System
 * Phase 3: CAPA Lifecycle Management
 * ============================================================================
 *
 * Manages Non-Conformance (NC) creation, CAPA tracking, status updates,
 * overdue detection, and repeat NC escalation.
 *
 * CAPA State Machine:
 *   OPEN → IN_PROGRESS → CLOSED
 *          ↓ (if overdue)
 *          OVERDUE → CLOSED
 *   Any state → REPEAT_NC (if same criterion flagged 2+ consecutive months)
 *
 * Functions:
 *   createCAPA(zoneId, criterionId, score, auditDate, auditorEmail)
 *   createCAPAFromAudit_(data, zone, auditorEmail, dateStr)
 *   updateCAPAStatus(ncId, newStatus, verifiedBy, remarks)
 *   checkNCOverdue(digestEvents)
 *   escalateRepeatNCs(digestEvents)
 *   detectRepeatNCs_()
 *   generateNCId_()
 *   getCAPAsByZone(zoneId)
 *   getOpenCAPAs()
 */

// ============================================================================
// NC ID GENERATION
// ============================================================================

/**
 * Generates a unique NC ID in format: NC-YYYY-MM-NNNN
 * Reads existing IDs to determine the next sequence number.
 *
 * @returns {string} NC ID like "NC-2025-04-0001"
 * @private
 */
function generateNCId_() {
  var now = new Date();
  var yearMonth = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM");
  var prefix = "NC-" + yearMonth + "-";

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");

  var maxSeq = 0;
  if (capaSheet && capaSheet.getLastRow() > 1) {
    var data = capaSheet.getDataRange().getValues(); // BATCH_READ
    for (var r = 1; r < data.length; r++) {
      var existingId = String(data[r][0]).trim();
      if (existingId.indexOf(prefix) === 0) {
        var seq = parseInt(existingId.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  }

  var nextSeq = maxSeq + 1;
  var seqStr = ("0000" + nextSeq).slice(-4);
  return prefix + seqStr;
}


// ============================================================================
// CAPA CREATION
// ============================================================================

/**
 * Creates a new NC/CAPA record in the NC_CAPA sheet.
 *
 * @param {string} zoneId — Zone identifier
 * @param {string} criterionId — Criterion ID (e.g. "S1-C1")
 * @param {number} score — Score given (0 or 1, triggering NC)
 * @param {string} auditDate — Audit date string (yyyy-MM-dd)
 * @param {string} auditorEmail — Auditor email
 * @returns {string} The generated NC ID
 */
function createCAPA(zoneId, description, type, pillar, sqcdpDim, responsiblePerson) {
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet) {
    throw new Error("NC_CAPA sheet not found. Run createAllSheets() first.");
  }

  var ncId = generateNCId_();
  var now = new Date();
  var targetDate = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
  var targetDateStr = Utilities.formatDate(targetDate, "Asia/Kolkata", "yyyy-MM-dd");
  var auditDateStr = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");

  // NC_CAPA column schema (20 columns) — matches actual sheet:
  // nc_id(0),created_date(1),zone_id(2),zone_name(3),audit_date(4),
  // criterion_id(5),criterion_label(6),score_given(7),
  // auditor_email(8),root_cause(9),corrective_action(10),preventive_action(11),
  // responsible_person(12),target_date(13),status(14),closure_date(15),
  // verified_by(16),verification_remarks(17),is_repeat_nc(18),repeat_count(19)
  var zoneConfig = getZoneConfig()[zoneId] || {};
  capaSheet.appendRow([
    ncId,                       // 0: nc_id
    auditDateStr,               // 1: created_date
    zoneId,                     // 2: zone_id
    zoneConfig.name || "",      // 3: zone_name
    auditDateStr,               // 4: audit_date
    pillar || "",               // 5: criterion_id (e.g. S1-C1)
    description || "",          // 6: criterion_label
    "",                         // 7: score_given
    responsiblePerson || "",    // 8: auditor_email
    "",                         // 9: root_cause
    "",                         // 10: corrective_action
    "",                         // 11: preventive_action
    responsiblePerson || "",    // 12: responsible_person
    targetDateStr,              // 13: target_date
    "Open",                     // 14: status
    "",                         // 15: closure_date
    "",                         // 16: verified_by
    "",                         // 17: verification_remarks
    "false",                    // 18: is_repeat_nc
    0                           // 19: repeat_count
  ]);

  Logger.log("  📌 CAPA created: " + ncId + " | Zone: " + zoneId + " | Pillar: " + pillar);
  return ncId;
}

/**
 * Auto-creates CAPAs from a weekly audit submission.
 * Called by doPost after a weekly audit is written.
 * Creates one CAPA per criterion scored ≤ ncThreshold.
 *
 * @param {Object} data — Audit form data with scores object
 * @param {Object} zone — Zone config object
 * @param {string} auditorEmail — Auditor email
 * @param {string} dateStr — Audit date yyyy-MM-dd
 * @private
 */
function createCAPAFromAudit_(data, zone, auditorEmail, dateStr) {
  var schema = getChecklistSchema();
  var ncThreshold = schema.ncThreshold || 1;
  var scores = data.scores || {};
  var ncIds = [];

  schema.criteria.forEach(function(criterion) {
    var score = parseInt(scores[criterion.id], 10);
    if (isNaN(score)) return;

    if (score <= ncThreshold) {
      try {
        // Derive SQCDP dimension from criterion — use first true key
        var sqcdpDim = '';
        var dims = ['S', 'Q', 'C', 'D', 'P'];
        var sqdcp = criterion.sqdcp || {};
        for (var di = 0; di < dims.length; di++) {
          if (sqdcp[dims[di]]) { sqcdpDim = dims[di]; break; }
        }
        var description = (criterion.labelEn || criterion.id) + ' (score: ' + score + ')';
        var ncId = createCAPA(zone.id, description, 'NC', criterion.pillar || '', sqcdpDim, zone.leader || '');
        ncIds.push(ncId);
      } catch (e) {
        Logger.log("  ⚠️ Could not create CAPA for " + criterion.id + ": " + e.message);
      }
    }
  });

  if (ncIds.length > 0) {
    Logger.log("  📋 Created " + ncIds.length + " CAPAs from audit: " + ncIds.join(", "));
  }
}


// ============================================================================
// CAPA STATUS UPDATES
// ============================================================================

/**
 * Updates the status of an existing CAPA record.
 * Finds the row by NC ID and updates status and related fields.
 *
 * @param {string} ncId — NC identifier (e.g. "NC-2025-04-0001")
 * @param {string} newStatus — New status: "IN_PROGRESS", "CLOSED", or "REPEAT_NC"
 * @param {string} verifiedBy — Email of person verifying/updating
 * @param {string} remarks — Update remarks
 * @param {Object} [additionalFields] — Optional: { root_cause, corrective_action, preventive_action }
 * @returns {boolean} true if updated successfully
 */
function updateCAPAStatus(ncId, newStatus, verifiedBy, remarks, additionalFields) {
  // Permission check — v2CheckPermission_ throws on denial
  try {
    v2CheckPermission_('UPDATE_CAPA', Session.getActiveUser().getEmail());
  } catch (e) {
    return { success: false, message: 'Permission denied: requires ZONE_LEAD role or above' };
  }

  var validStatuses = ["OPEN", "IN_PROGRESS", "OVERDUE", "CLOSED", "REPEAT_NC"];
  if (validStatuses.indexOf(newStatus) === -1) {
    return { success: false, message: "Invalid status: " + newStatus + ". Must be one of: " + validStatuses.join(", ") };
  }

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) {
    return { success: false, message: "NC_CAPA sheet is empty or missing." };
  }

  // BATCH_READ
  var data = capaSheet.getDataRange().getValues();
  var targetRow = -1;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === ncId) {
      targetRow = r + 1; // 1-based sheet row
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, message: "NC ID not found: " + ncId };
  }

  var rowData = data[targetRow - 1];
  var currentStatus = String(rowData[NC_COL.STATUS] || "").trim().toUpperCase();
  var createdBy     = String(rowData[NC_COL.RESPONSIBLE] || "").trim();
  var zoneId        = String(rowData[NC_COL.ZONE_ID]  || "").trim();
  var actorEmail    = v2GetCurrentUser_();

  // ── ISO Plan E: RCA Gate ─────────────────────────────────────────────────
  // Block OPEN → IN_PROGRESS if rootCause is missing or too short
  if (currentStatus === "OPEN" && newStatus === "IN_PROGRESS") {
    var rootCause = "";
    if (additionalFields && additionalFields.root_cause) {
      rootCause = String(additionalFields.root_cause).trim();
    } else {
      rootCause = String(rowData[NC_COL.ROOT_CAUSE] || "").trim();
    }
    var actionPlan = "";
    if (additionalFields && additionalFields.corrective_action) {
      actionPlan = String(additionalFields.corrective_action).trim();
    } else {
      actionPlan = String(rowData[NC_COL.CORRECTIVE_ACTION] || "").trim();
    }

    if (rootCause.length < 50) {
      return { success: false, message: "RCA required: provide root cause (min 50 chars) before moving to IN_PROGRESS. Current: " + rootCause.length + " chars." };
    }
    if (!actionPlan) {
      return { success: false, message: "RCA required: corrective action plan must be filled before moving to IN_PROGRESS." };
    }
  }

  // ── ISO Plan E: 4-Eyes Check ─────────────────────────────────────────────
  // The person who created the NC cannot close/verify it
  if (newStatus === "CLOSED" || newStatus === "VERIFICATION") {
    if (createdBy && actorEmail && createdBy === actorEmail) {
      return { success: false, message: "4-eyes: you cannot close a record you created. Ask a colleague to verify this NC." };
    }
  }

  // Column indices (0-based): status=11, closure_date=10, verified_by=13,
  // verification_date=14, root_cause=12, corrective_action=7
  var updates = {};
  updates[NC_COL.STATUS] = newStatus;
  updates[NC_COL.VERIFIED_BY] = verifiedBy || actorEmail;

  if (newStatus === "CLOSED") {
    updates[NC_COL.CLOSURE_DATE] = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  }

  if (additionalFields) {
    if (additionalFields.root_cause)        updates[NC_COL.ROOT_CAUSE] = additionalFields.root_cause;
    if (additionalFields.corrective_action) updates[NC_COL.CORRECTIVE_ACTION] = additionalFields.corrective_action;
  }

  v2BatchUpdateRow_(capaSheet, targetRow, updates, rowData);

  // ── ISO Plan E: Audit Trail ───────────────────────────────────────────────
  if (typeof v2LogAuditTrail_ === "function") {
    v2LogAuditTrail_(
      "STATUS_CHANGE",
      ncId,
      currentStatus,
      newStatus,
      remarks || "",
      "NC_CAPA",
      zoneId
    );
  }

  Logger.log("CAPA " + ncId + " updated to " + newStatus + " by " + actorEmail);
  if (typeof logAdminAction_ === "function") {
    logAdminAction_("updateCAPAStatus", ncId + " → " + newStatus + " by " + actorEmail);
  }

  return { success: true, message: ncId + " updated to " + newStatus };
}


/**
 * Public wrapper: creates a new NC/CAPA and logs the creation to AuditTrail.
 * Called from CAPATracker HTML page.
 *
 * @param {Object} params — { zoneId, criterionId, score, auditDate, auditorEmail }
 * @returns {Object} { success, ncId, message }
 */
function createCAPAWithAudit(params) {
  return v2SafeExecute_(function() {
    params = params || {};
    var description = (params.description || params.criterionLabel || params.criterionId || '') +
      (params.score !== undefined ? ' (score: ' + params.score + ')' : '');
    var ncId = createCAPA(
      params.zoneId, description,
      params.type || 'NC', params.pillar || '', params.sqcdpDim || '',
      params.responsiblePerson || ''
    );
    if (typeof v2LogAuditTrail_ === "function") {
      v2LogAuditTrail_("CAPA_CREATED", ncId, "", "OPEN", "Manual creation", "NC_CAPA", params.zoneId || "");
    }
    return { success: true, ncId: ncId, message: "NC created: " + ncId };
  }, "createCAPAWithAudit", { success: false, ncId: "", message: "Server error." });
}


// ============================================================================
// OVERDUE NC DETECTION
// ============================================================================

/**
 * Checks for NCs past their target date that are still OPEN or IN_PROGRESS.
 * Updates their status to OVERDUE.
 * Adds events to digest accumulator.
 *
 * @param {Object} digestEvents — Accumulator from masterOrchestrator
 */
function checkNCOverdue(digestEvents) {
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) {
    Logger.log("  ⏭️ No CAPAs to check.");
    return;
  }

  var data = capaSheet.getDataRange().getValues(); // BATCH_READ
  var now = new Date();
  var todayStr = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");
  var overdueCount = 0;
  var severeOverdue = 0; // > 14 days
  var overdueUpdates = []; // Collect rows to batch-update

  for (var r = 1; r < data.length; r++) {
    var ncId = String(data[r][0]).trim();
    var zoneId = String(data[r][2]).trim();
    var zoneName = String(data[r][3]).trim();
    var criterionId = String(data[r][5]).trim();
    var criterionLabel = String(data[r][6]).trim();
    var responsible = String(data[r][12]).trim();
    var targetDateStr = String(data[r][13]).trim();
    var status = String(data[r][14]).trim().toUpperCase();

    // Only check OPEN or IN_PROGRESS statuses
    if (status !== "OPEN" && status !== "IN_PROGRESS" && status !== "OVERDUE") continue;

    // Parse target date
    var targetDate;
    if (data[r][13] instanceof Date) {
      targetDate = data[r][13];
    } else {
      targetDate = new Date(targetDateStr);
    }
    if (isNaN(targetDate.getTime())) continue;

    // Check if overdue
    if (now > targetDate) {
      var daysOverdue = Math.floor((now.getTime() - targetDate.getTime()) / (24 * 60 * 60 * 1000));

      // Collect status update for batch write
      if (status !== "OVERDUE") {
        overdueUpdates.push(r + 1); // 1-based row index
      }

      overdueCount++;

      var event = {
        type: "NC_OVERDUE",
        ncId: ncId,
        zoneId: zoneId,
        zoneName: zoneName,
        criterionId: criterionId,
        criterionLabel: criterionLabel,
        responsible: responsible,
        targetDate: targetDateStr,
        daysOverdue: daysOverdue,
        message: ncId + ": " + criterionLabel + " — " + daysOverdue + " days overdue"
      };

      // Add to MC events
      digestEvents.mcEvents.push(event);

      // Add to zone events
      if (!digestEvents.zoneEvents[zoneId]) {
        digestEvents.zoneEvents[zoneId] = [];
      }
      digestEvents.zoneEvents[zoneId].push(event);

      // Severe overdue (>14 days) → escalate to Top Management
      if (daysOverdue > 14) {
        severeOverdue++;
        digestEvents.topMgtEvents.push(event);
      }
    }
  }

  // Batch-write all OVERDUE status updates
  overdueUpdates.forEach(function(rowNum) {
    capaSheet.getRange(rowNum, 15).setValue("OVERDUE");
  });

  Logger.log("  📊 Overdue NCs: " + overdueCount + " total, " + severeOverdue + " severe (>14 days)");
}


// ============================================================================
// REPEAT NC DETECTION
// ============================================================================

/**
 * Identifies NCs raised for the same criterion + zone in 2+ consecutive months.
 * Marks them as REPEAT_NC and escalates to Top Management.
 *
 * Called by masterOrchestrator() on the 1st of each month.
 *
 * @param {Object} digestEvents — Accumulator from masterOrchestrator
 */
function escalateRepeatNCs(digestEvents) {
  var repeats = detectRepeatNCs_();

  if (repeats.length === 0) {
    Logger.log("  ✅ No repeat NCs detected.");
    return;
  }

  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");

  repeats.forEach(function(repeat) {
    // Update the most recent NC as REPEAT_NC
    if (capaSheet && repeat.latestRowIndex > 0) {
      capaSheet.getRange(repeat.latestRowIndex, 15).setValue("REPEAT_NC");
      capaSheet.getRange(repeat.latestRowIndex, 19, 1, 2).setValues([[true, repeat.consecutiveMonths]]);
    }

    var event = {
      type: "REPEAT_NC",
      zoneId: repeat.zoneId,
      zoneName: repeat.zoneName,
      criterionId: repeat.criterionId,
      criterionLabel: repeat.criterionLabel,
      consecutiveMonths: repeat.consecutiveMonths,
      months: repeat.months,
      message: "REPEAT NC: " + repeat.criterionId + " in " + repeat.zoneName +
        " — raised " + repeat.consecutiveMonths + " consecutive months (" + repeat.months.join(", ") + ")"
    };

    digestEvents.topMgtEvents.push(event);
    digestEvents.mcEvents.push(event);

    Logger.log("  🔴 " + event.message);
  });

  Logger.log("  📊 Repeat NCs found: " + repeats.length);
}

/**
 * Detects NCs for the same criterion + zone across consecutive months.
 * Returns an array of repeat NC objects.
 *
 * @returns {Object[]} Array of { zoneId, zoneName, criterionId, criterionLabel, consecutiveMonths, months, latestRowIndex }
 * @private
 */
function detectRepeatNCs_() {
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) return [];

  var data = capaSheet.getDataRange().getValues(); // BATCH_READ

  // Build a map: { "Z-01|S1-C1": [{ month: "2025-03", rowIndex: 5 }, ...] }
  var ncMap = {};

  for (var r = 1; r < data.length; r++) {
    var zoneId = String(data[r][2]).trim();
    var criterionId = String(data[r][5]).trim();
    var zoneName = String(data[r][3]).trim();
    var criterionLabel = String(data[r][6]).trim();

    var createdDate;
    if (data[r][1] instanceof Date) {
      createdDate = data[r][1];
    } else {
      createdDate = new Date(String(data[r][1]));
    }
    if (isNaN(createdDate.getTime())) continue;

    var monthStr = Utilities.formatDate(createdDate, "Asia/Kolkata", "yyyy-MM");
    var key = zoneId + "|" + criterionId;

    if (!ncMap[key]) {
      ncMap[key] = {
        zoneId: zoneId,
        zoneName: zoneName,
        criterionId: criterionId,
        criterionLabel: criterionLabel,
        entries: []
      };
    }

    ncMap[key].entries.push({
      month: monthStr,
      rowIndex: r + 1 // 1-based
    });
  }

  // Check for consecutive months
  var repeats = [];

  Object.keys(ncMap).forEach(function(key) {
    var item = ncMap[key];
    // Get unique months sorted
    var uniqueMonths = [];
    var monthRowMap = {};
    item.entries.forEach(function(e) {
      if (uniqueMonths.indexOf(e.month) === -1) {
        uniqueMonths.push(e.month);
      }
      monthRowMap[e.month] = e.rowIndex;
    });
    uniqueMonths.sort();

    // Find consecutive month sequences
    if (uniqueMonths.length < 2) return;

    var consecutiveCount = 1;
    var consecutiveMonths = [uniqueMonths[uniqueMonths.length - 1]];

    for (var i = uniqueMonths.length - 2; i >= 0; i--) {
      if (areConsecutiveMonths_(uniqueMonths[i], uniqueMonths[i + 1])) {
        consecutiveCount++;
        consecutiveMonths.unshift(uniqueMonths[i]);
      } else {
        break;
      }
    }

    if (consecutiveCount >= 2) {
      var latestMonth = uniqueMonths[uniqueMonths.length - 1];
      repeats.push({
        zoneId: item.zoneId,
        zoneName: item.zoneName,
        criterionId: item.criterionId,
        criterionLabel: item.criterionLabel,
        consecutiveMonths: consecutiveCount,
        months: consecutiveMonths,
        latestRowIndex: monthRowMap[latestMonth]
      });
    }
  });

  return repeats;
}

/**
 * Checks if two month strings are consecutive (e.g. "2025-03" and "2025-04").
 * @private
 */
function areConsecutiveMonths_(month1, month2) {
  var parts1 = month1.split("-");
  var parts2 = month2.split("-");
  var d1 = new Date(parseInt(parts1[0]), parseInt(parts1[1]) - 1, 1);
  var d2 = new Date(parseInt(parts2[0]), parseInt(parts2[1]) - 1, 1);
  var nextMonth = new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
  return nextMonth.getTime() === d2.getTime();
}


// ============================================================================
// CAPA QUERY FUNCTIONS
// ============================================================================

/**
 * Returns all CAPAs for a specific zone.
 * Used by Phase 4 dashboards.
 *
 * @param {string} zoneId — Zone ID
 * @returns {Object[]} Array of CAPA objects
 */
function getCAPAsByZone(zoneId) {
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) return [];

  var data = capaSheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var results = [];

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][2]).trim() === zoneId) {
      var obj = {};
      headers.forEach(function(h, i) {
        obj[String(h).trim()] = data[r][i];
      });
      results.push(obj);
    }
  }
  return results;
}

/**
 * Returns all open/overdue CAPAs across all zones.
 * Used by Phase 4 CAPA tracker.
 *
 * @returns {Object[]} Array of CAPA objects
 */
/**
 * Soft-invalidates a submitted audit row (daily or weekly).
 * Sets IS_DUPLICATE=TRUE and appends an entry to AdminLog.
 * Admin-only: caller should verify admin rights before invoking.
 *
 * @param {string} submissionId  — The submission ID to invalidate
 * @param {string} reason        — Reason for invalidation
 * @param {string} sheetType     — "daily" | "weekly" (default: "daily")
 * @returns {Object} { success, message }
 */
function invalidateSubmission(submissionId, reason, sheetType) {
  return v2SafeExecute_(function() {
    if (!v2CheckPermission_('RESET_SYSTEM', Session.getActiveUser().getEmail())) {
      throw new Error('Permission denied: requires ADMIN role');
    }
    if (!submissionId) return { success: false, message: "submissionId required." };
    reason = reason || "Admin invalidation";
    var sheetName = (String(sheetType || "daily").toLowerCase() === "weekly") ? "WeeklyAudit" : "DailySubmissions";
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, message: sheetName + " sheet not found." };
    var data = sheet.getDataRange().getValues();
    // Find IS_DUPLICATE column from header row
    var headers = data[0];
    var dupColIdx = DS_COL.IS_DUPLICATE; // default from constants
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().replace(/_/g,"") === "isduplicate") { dupColIdx = h; break; }
    }
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === submissionId) {
        sheet.getRange(r + 1, dupColIdx + 1).setValue(true);
        // Append to AdminLog
        var logSheet = ss.getSheetByName("AdminLog");
        if (logSheet) {
          logSheet.appendRow([
            new Date(),
            v2GetCurrentUser_(),
            "INVALIDATE_SUBMISSION",
            sheetName + ":" + submissionId + " — " + reason
          ]);
        }
        return { success: true, message: submissionId + " marked as duplicate/invalid." };
      }
    }
    return { success: false, message: "Submission not found: " + submissionId };
  }, "invalidateSubmission:" + submissionId, { success: false, message: "Server error." });
}

function getOpenCAPAs() {
  var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
  var capaSheet = ss.getSheetByName("NC_CAPA");
  if (!capaSheet || capaSheet.getLastRow() <= 1) return [];

  var data = capaSheet.getDataRange().getValues(); // BATCH_READ
  var headers = data[0];
  var results = [];

  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][14]).trim().toUpperCase();
    if (status === "DELETED" || status === "DELETED ") continue;
    if (status === "OPEN" || status === "IN_PROGRESS" || status === "OVERDUE" || status === "REPEAT_NC") {
      var obj = {};
      headers.forEach(function(h, i) {
        obj[String(h).trim()] = data[r][i];
      });

      // Add computed days overdue/remaining
      var targetDate;
      if (data[r][13] instanceof Date) {
        targetDate = data[r][13];
      } else {
        targetDate = new Date(String(data[r][13]));
      }
      if (!isNaN(targetDate.getTime())) {
        var diff = Math.floor((targetDate.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
        obj._daysRemaining = diff;
        obj._isOverdue = diff < 0;
      }
      results.push(obj);
    }
  }

  return results;
}
