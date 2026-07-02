/**
 * ============================================================================
 * 06_Triggers.gs — PackMasters 5S Integrated System
 * Phase 3: Trigger Management & Master Orchestrator
 * ============================================================================
 *
 * Exactly ONE time-based trigger exists for the entire project:
 * masterOrchestrator() fires daily at 07:30 IST.
 * It conditionally calls sub-tasks based on current date.
 *
 * CONSTRAINT: Never create more than one time-based trigger.
 *
 * Functions:
 *   masterOrchestrator()       — Single daily entry point
 *   setupTrigger()             — Creates the one daily trigger
 *   deleteTrigger()            — Removes all project triggers
 *   registerTrigger()          — Admin menu wrapper
 *   getTriggerStatus()         — Returns trigger info for status display
 */

// ============================================================================
// MASTER ORCHESTRATOR
// ============================================================================

/**
 * Single daily entry point. Runs at 07:30 IST via time-based trigger.
 * Decides what sub-tasks to run based on the current date.
 *
 * Execution budget: must complete within 60 seconds on an empty dataset,
 * and within 6 minutes (Apps Script limit) on a full dataset.
 */
function masterOrchestrator() {
  var startTime = new Date();
  var istNow = new Date(startTime.getTime() + (5.5 * 60 * 60 * 1000)); // Approximate IST
  var dayOfWeek = startTime.getDay(); // 0=Sun, 1=Mon, ...
  var dayOfMonth = startTime.getDate();

  Logger.log("═══════════════════════════════════════════════");
  Logger.log("  masterOrchestrator() started: " + startTime.toISOString());
  Logger.log("  Day of week: " + dayOfWeek + " | Day of month: " + dayOfMonth);
  Logger.log("═══════════════════════════════════════════════");

  // Accumulator for all digest events across sub-tasks
  var digestEvents = {
    zoneEvents: {},    // { "Z-01": [event1, event2], ... }
    mcEvents: [],      // Plant-wide events for MC
    topMgtEvents: [],  // Escalations for Top Management
    errors: []         // Any sub-task errors
  };

  try {
    // ── DAILY TASKS (every day) ──

    // 1. Check for missed daily submissions from yesterday
    Logger.log("\n▸ Checking missed submissions...");
    try {
      checkMissedSubmissions(digestEvents);
    } catch (e) {
      Logger.log("  ⚠️ checkMissedSubmissions error: " + e.message);
      digestEvents.errors.push("checkMissedSubmissions: " + e.message);
    }

    // 2. Check overdue NCs/CAPAs
    Logger.log("\n▸ Checking overdue NCs...");
    try {
      checkNCOverdue(digestEvents);
    } catch (e) {
      Logger.log("  ⚠️ checkNCOverdue error: " + e.message);
      digestEvents.errors.push("checkNCOverdue: " + e.message);
    }

    // 3. Telegram DM reminders to enrolled zone leaders (pending audit / overdue NC / overdue task)
    Logger.log("\n▸ Sending Telegram leader reminders...");
    try {
      if (typeof remindZoneLeaders === "function") remindZoneLeaders();
    } catch (e) {
      Logger.log("  ⚠️ remindZoneLeaders error: " + e.message);
      digestEvents.errors.push("remindZoneLeaders: " + e.message);
    }

    // ── WEEKLY TASKS (Monday) ──
    if (dayOfWeek === 1) {
      Logger.log("\n▸ Running weekly rollup (Monday)...");
      try {
        weeklyRollup();
      } catch (e) {
        Logger.log("  ⚠️ weeklyRollup error: " + e.message);
        digestEvents.errors.push("weeklyRollup: " + e.message);
      }
    }

    // ── SUNDAY TASKS (Backup + Health Check) ──
    if (dayOfWeek === 0) {
      Logger.log("\n▸ Running weekly backup (Sunday)...");
      try {
        if (typeof runWeeklyBackup === "function") {
          var backupResult = runWeeklyBackup();
          Logger.log("  ✅ Backup: " + (backupResult.success ? "OK (" + backupResult.sheetsBackedUp + " sheets)" : "FAILED"));
        }
      } catch (e) {
        Logger.log("  ⚠️ runWeeklyBackup error: " + e.message);
        digestEvents.errors.push("runWeeklyBackup: " + e.message);
      }

      Logger.log("\n▸ Cleaning up old backups (Sunday)...");
      try {
        if (typeof deleteOldBackups === "function") {
          var cleanupResult = deleteOldBackups(30);
          Logger.log("  ✅ Cleanup: " + (cleanupResult.success ? "OK (" + cleanupResult.deletedCount + " old backups removed)" : "No old backups"));
        }
      } catch (e) {
        Logger.log("  ⚠️ deleteOldBackups error: " + e.message);
        digestEvents.errors.push("deleteOldBackups: " + e.message);
      }

      Logger.log("\n▸ Running system health check (Sunday)...");
      try {
        if (typeof systemHealthCheck === "function") {
          systemHealthCheck();
        }
      } catch (e) {
        Logger.log("  ⚠️ systemHealthCheck error: " + e.message);
        digestEvents.errors.push("systemHealthCheck: " + e.message);
      }
    }

    // ── MONTHLY TASKS (1st of month) ──
    if (dayOfMonth === 1) {
      Logger.log("\n▸ Running monthly rollup (1st of month)...");
      try {
        monthlyRollup();
      } catch (e) {
        Logger.log("  ⚠️ monthlyRollup error: " + e.message);
        digestEvents.errors.push("monthlyRollup: " + e.message);
      }

      Logger.log("\n▸ Running data archival (1st of month)...");
      try {
        archiveOldData(90);
      } catch (e) {
        Logger.log("  ⚠️ archiveOldData error: " + e.message);
        digestEvents.errors.push("archiveOldData: " + e.message);
      }

      Logger.log("\n▸ Checking repeat NCs (1st of month)...");
      try {
        escalateRepeatNCs(digestEvents);
      } catch (e) {
        Logger.log("  ⚠️ escalateRepeatNCs error: " + e.message);
        digestEvents.errors.push("escalateRepeatNCs: " + e.message);
      }
    }

    // ── ERROR REPORT (every day) ──
    Logger.log("\n▸ Generating error report...");
    try {
      if (typeof getDailyErrorReport === "function") {
        var errorReport = getDailyErrorReport();
        if (errorReport.criticalCount > 0 || errorReport.errorCount > 10) {
          Logger.log("  ⚠️ Error Report: " + errorReport.errorCount + " errors, " + errorReport.criticalCount + " critical");
          digestEvents.errors.push(errorReport.summary);
        } else if (errorReport.errorCount > 0) {
          Logger.log("  ℹ️ " + errorReport.errorCount + " non-critical errors");
        }
      }
    } catch (e) {
      Logger.log("  ⚠️ getDailyErrorReport error: " + e.message);
    }

    // ── SEND DIGEST EMAILS (every day, at end) ──
    Logger.log("\n▸ Sending digest emails...");
    try {
      sendDigestEmails(digestEvents);
    } catch (e) {
      Logger.log("  ⚠️ sendDigestEmails error: " + e.message);
      digestEvents.errors.push("sendDigestEmails: " + e.message);
    }

  } catch (fatalError) {
    Logger.log("❌ FATAL ERROR in masterOrchestrator: " + fatalError.message);
    Logger.log(fatalError.stack);

    // Attempt emergency error email to MC
    try {
      var mcEmail = PropertiesService.getScriptProperties().getProperty("MC_EMAIL");
      if (mcEmail) {
        MailApp.sendEmail({
          to: mcEmail,
          subject: "❌ PackMasters 5S — Orchestrator Fatal Error",
          htmlBody: "<h2>Fatal Error in masterOrchestrator()</h2>" +
            "<p><strong>Time:</strong> " + now.toISOString() + "</p>" +
            "<p><strong>Error:</strong> " + fatalError.message + "</p>" +
            "<pre>" + fatalError.stack + "</pre>"
        });
      }
    } catch (emailErr) {
      Logger.log("Could not send error email: " + emailErr.message);
    }
  }

  var elapsed = ((new Date().getTime()) - startTime.getTime()) / 1000;
  Logger.log("\n═══════════════════════════════════════════════");
  Logger.log("  masterOrchestrator() completed in " + elapsed.toFixed(1) + "s");
  Logger.log("═══════════════════════════════════════════════");

  // Log to AdminLog
  logAdminAction_("masterOrchestrator",
    "Completed in " + elapsed.toFixed(1) + "s. Errors: " + digestEvents.errors.length);
}


// ============================================================================
// TRIGGER MANAGEMENT
// ============================================================================

/**
 * Creates the single daily time-based trigger for masterOrchestrator().
 * Deletes all existing project triggers first to ensure exactly one exists.
 * Fires daily between 07:00-08:00 IST.
 */
function setupTrigger() {
  // Delete all existing triggers
  deleteTrigger();

  // Create new daily trigger
  ScriptApp.newTrigger("masterOrchestrator")
    .timeBased()
    .everyDays(1)
    .atHour(7)           // 7 AM UTC+5:30 ≈ 07:00-08:00 IST
    .nearMinute(30)
    .inTimezone("Asia/Kolkata")
    .create();

  Logger.log("✅ Daily trigger created: masterOrchestrator @ 07:30 IST");
  logAdminAction_("setupTrigger", "Daily trigger created for masterOrchestrator at 07:30 IST");

  // Verify
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log("  Total triggers: " + triggers.length);
}

/**
 * Deletes ALL project triggers.
 * Called by setupTrigger() to enforce the single-trigger constraint.
 */
function deleteTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log("🗑️ Deleted " + triggers.length + " existing trigger(s).");
}

/**
 * Admin menu wrapper — confirms before creating trigger.
 */
function registerTrigger() {
  var ui = SpreadsheetApp.getUi();
  var triggers = ScriptApp.getProjectTriggers();

  var msg = "Current triggers: " + triggers.length + "\n\n";
  if (triggers.length > 0) {
    triggers.forEach(function(t) {
      msg += "  • " + t.getHandlerFunction() + " (" + t.getEventType() + ")\n";
    });
    msg += "\nThis will DELETE all existing triggers and create ONE new daily trigger.\n";
  }
  msg += "\nCreate daily trigger for masterOrchestrator at 07:30 IST?";

  var response = ui.alert("Setup Trigger", msg, ui.ButtonSet.YES_NO);
  if (response === ui.Button.YES) {
    setupTrigger();
    ui.alert("✅ Trigger created successfully.\n\nTotal triggers: " +
      ScriptApp.getProjectTriggers().length);
  }
}

/**
 * Returns current trigger status information.
 * @returns {Object} Trigger status
 */
function getTriggerStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  return {
    count: triggers.length,
    triggers: triggers.map(function(t) {
      return {
        handler: t.getHandlerFunction(),
        type: String(t.getEventType()),
        source: String(t.getTriggerSource())
      };
    })
  };
}
