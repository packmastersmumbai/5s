/**
 * ============================================================================
 * 26_BackupService.js — PackMasters 5S v2.0
 * Backup & Recovery System for Data Protection
 * ============================================================================
 *
 * Provides automated sheet backups to Google Drive with point-in-time recovery.
 * Scheduled to run weekly; supports manual backups and recovery.
 *
 * Key Functions:
 *   runWeeklyBackup() — Automated backup (called from trigger)
 *   createManualBackup(label) — User-initiated backup with custom label
 *   listBackups() — List all available backups with metadata
 *   recoverFromBackup(backupId, targetSheet) — Restore sheet from backup
 *   deleteOldBackups(daysToKeep) — Cleanup old backups (RTO: 30 days)
 */

// ============================================================================
// BACKUP CONFIGURATION
// ============================================================================

var BACKUP_CONFIG = {
  FOLDER_NAME: "PackMasters 5S — Backups",
  RETENTION_DAYS: 30,  // Keep backups for 30 days (RTO requirement)
  BACKUP_SCHEDULE: "Weekly",
  SHEETS_TO_BACKUP: [
    "Zones", "Summary", "DailySubmissions", "WeeklyAudit",
    "NC_CAPA", "TaskBoard", "RedTagRegister", "KaizenSuggestions",
    "TrainingLog", "GembaWalks", "ShiftHandover", "WDGLL_Library"
  ]
};

// ============================================================================
// BACKUP FOLDER MANAGEMENT
// ============================================================================

/**
 * Gets or creates the backup folder in Drive.
 * @returns {Folder} Google Drive Folder object
 * @private
 */
function getBackupFolder_() {
  try {
    var folders = DriveApp.getFoldersByName(BACKUP_CONFIG.FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    // Create if doesn't exist
    var newFolder = DriveApp.createFolder(BACKUP_CONFIG.FOLDER_NAME);
    Logger.log("✅ Backup folder created: " + BACKUP_CONFIG.FOLDER_NAME);
    return newFolder;
  } catch (e) {
    Logger.log("❌ Error getting backup folder: " + e.message);
    return null;
  }
}

// ============================================================================
// BACKUP EXECUTION
// ============================================================================

/**
 * Creates a weekly backup of all critical sheets.
 * Called via time-based trigger (Sundays at 2 AM IST).
 * @returns {Object} { success: bool, backupId: string, sheetsBackedUp: int, message: string }
 */
function runWeeklyBackup() {
  var startTime = new Date().getTime();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var backupFolder = getBackupFolder_();
    if (!backupFolder) {
      return { success: false, message: "Could not access backup folder" };
    }

    var now = new Date();
    var timestamp = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd_HH-mm-ss");
    var backupId = "backup_" + Utilities.getUuid().substring(0, 8);
    var backupLabel = timestamp + " (Weekly)";

    // Create backup metadata sheet
    var backupMetadata = {
      backupId: backupId,
      label: backupLabel,
      timestamp: now.toISOString(),
      type: "WEEKLY",
      source: ss.getId(),
      sourceName: ss.getName(),
      sheetsBackedUp: [],
      status: "IN_PROGRESS",
      elapsedSeconds: 0
    };

    var sheetsBackedUp = 0;
    var backupFolder_id = backupFolder.getId();

    // Backup each critical sheet
    for (var i = 0; i < BACKUP_CONFIG.SHEETS_TO_BACKUP.length; i++) {
      var sheetName = BACKUP_CONFIG.SHEETS_TO_BACKUP[i];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      try {
        // Export sheet as CSV to Drive
        var blob = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
          .getValues();
        var csv = convertArrayToCSV_(blob);

        var fileName = backupId + "_" + sheetName + ".csv";
        var file = backupFolder.createFile(fileName, csv, MimeType.PLAIN_TEXT);

        backupMetadata.sheetsBackedUp.push({
          name: sheetName,
          rows: sheet.getLastRow(),
          fileId: file.getId(),
          fileName: fileName
        });
        sheetsBackedUp++;
      } catch (e) {
        Logger.log("  ⚠️ Could not backup sheet " + sheetName + ": " + e.message);
      }
    }

    backupMetadata.status = "COMPLETED";
    backupMetadata.elapsedSeconds = Math.round((new Date().getTime() - startTime) / 1000);

    // Store metadata in ScriptProperties
    var props = PropertiesService.getScriptProperties();
    var backups = JSON.parse(props.getProperty("BACKUPS") || "{}");
    backups[backupId] = backupMetadata;
    props.setProperty("BACKUPS", JSON.stringify(backups));

    // Log event
    logSecurityEvent_("BACKUP_CREATED", "runWeeklyBackup", Session.getActiveUser().getEmail(), {
      backupId: backupId,
      sheetsBackedUp: sheetsBackedUp,
      elapsedSeconds: backupMetadata.elapsedSeconds
    });

    Logger.log("✅ Weekly backup completed: " + backupId);
    Logger.log("  📄 Sheets backed up: " + sheetsBackedUp);
    Logger.log("  ⏱️ Time: " + backupMetadata.elapsedSeconds + " seconds");

    return {
      success: true,
      backupId: backupId,
      label: backupLabel,
      sheetsBackedUp: sheetsBackedUp,
      message: "Backup completed: " + sheetsBackedUp + " sheets"
    };
  } catch (e) {
    Logger.log("❌ Backup failed: " + e.message);
    logSecurityEvent_("BACKUP_FAILED", "runWeeklyBackup", Session.getActiveUser().getEmail(), {
      error: e.message
    });
    return { success: false, message: "Backup failed: " + e.message };
  }
}

/**
 * Manual backup with custom label (callable from admin UI).
 * @param {string} [customLabel] — Custom label for the backup
 * @returns {Object} Backup result
 */
function createManualBackup(customLabel) {
  customLabel = customLabel || "";
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var backupFolder = getBackupFolder_();
    if (!backupFolder) {
      return { success: false, message: "Could not access backup folder" };
    }

    var now = new Date();
    var timestamp = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd_HH-mm-ss");
    var backupId = "manual_" + Utilities.getUuid().substring(0, 8);
    var backupLabel = timestamp + (customLabel ? " (" + customLabel + ")" : " (Manual)");

    var backupMetadata = {
      backupId: backupId,
      label: backupLabel,
      timestamp: now.toISOString(),
      type: "MANUAL",
      source: ss.getId(),
      sourceName: ss.getName(),
      initiatedBy: Session.getActiveUser().getEmail(),
      sheetsBackedUp: [],
      status: "COMPLETED"
    };

    var sheetsBackedUp = 0;

    // Backup each sheet
    for (var i = 0; i < BACKUP_CONFIG.SHEETS_TO_BACKUP.length; i++) {
      var sheetName = BACKUP_CONFIG.SHEETS_TO_BACKUP[i];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      try {
        var blob = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
        var csv = convertArrayToCSV_(blob);
        var fileName = backupId + "_" + sheetName + ".csv";
        var file = backupFolder.createFile(fileName, csv, MimeType.PLAIN_TEXT);

        backupMetadata.sheetsBackedUp.push({
          name: sheetName,
          rows: sheet.getLastRow(),
          fileId: file.getId()
        });
        sheetsBackedUp++;
      } catch (e) {
        Logger.log("  ⚠️ Could not backup " + sheetName + ": " + e.message);
      }
    }

    // Store metadata
    var props = PropertiesService.getScriptProperties();
    var backups = JSON.parse(props.getProperty("BACKUPS") || "{}");
    backups[backupId] = backupMetadata;
    props.setProperty("BACKUPS", JSON.stringify(backups));

    logSecurityEvent_("BACKUP_MANUAL", "createManualBackup", Session.getActiveUser().getEmail(), {
      backupId: backupId,
      customLabel: customLabel,
      sheetsBackedUp: sheetsBackedUp
    });

    return {
      success: true,
      backupId: backupId,
      label: backupLabel,
      sheetsBackedUp: sheetsBackedUp,
      message: customLabel ? "Manual backup created: " + customLabel : "Manual backup created"
    };
  } catch (e) {
    Logger.log("❌ Manual backup failed: " + e.message);
    return { success: false, message: "Backup failed: " + e.message };
  }
}

// ============================================================================
// BACKUP LISTING & RECOVERY
// ============================================================================

/**
 * Lists all available backups with metadata.
 * @returns {Array} Array of backup metadata objects
 */
function listBackups() {
  try {
    var props = PropertiesService.getScriptProperties();
    var backups = JSON.parse(props.getProperty("BACKUPS") || "{}");
    var list = [];

    Object.keys(backups).forEach(function(backupId) {
      var b = backups[backupId];
      list.push({
        backupId: backupId,
        label: b.label,
        timestamp: b.timestamp,
        type: b.type,
        sheetsCount: b.sheetsBackedUp.length,
        createdBy: b.initiatedBy || "System"
      });
    });

    // Sort by timestamp descending (newest first)
    list.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return list;
  } catch (e) {
    Logger.log("Error listing backups: " + e.message);
    return [];
  }
}

/**
 * Recovers a specific sheet from a backup.
 * NOTE: This is a manual process — user must review and confirm in admin UI.
 *
 * @param {string} backupId — Backup ID to recover from
 * @param {string} sheetName — Sheet name to recover
 * @returns {Object} { success: bool, message: string }
 */
function recoverFromBackup(backupId, sheetName) {
  if (!v2CheckPermission_('RESTORE_DATA', Session.getActiveUser().getEmail())) {
    throw new Error('Permission denied: backup restore requires ADMIN role');
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var backups = JSON.parse(props.getProperty("BACKUPS") || "{}");
    var backup = backups[backupId];

    if (!backup) {
      return { success: false, message: "Backup not found" };
    }

    var backupFolder = getBackupFolder_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, message: "Sheet not found: " + sheetName };
    }

    // Find the CSV file for this sheet in the backup
    var csvFileName = backupId + "_" + sheetName + ".csv";
    var files = backupFolder.getFilesByName(csvFileName);

    if (!files.hasNext()) {
      return { success: false, message: "Backup file not found for " + sheetName };
    }

    var file = files.next();
    var csvContent = file.getBlob().getDataAsString();
    var rows = csvContent.split("\n").map(function(row) {
      return row.split(",").map(function(cell) { return cell.trim(); });
    });

    // Clear and restore sheet
    sheet.clearContents();
    if (rows.length > 0) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    }

    logSecurityEvent_("BACKUP_RESTORED", "recoverFromBackup", Session.getActiveUser().getEmail(), {
      backupId: backupId,
      sheetName: sheetName
    });

    return {
      success: true,
      message: "Sheet restored from backup: " + sheetName
    };
  } catch (e) {
    Logger.log("Recovery failed: " + e.message);
    return { success: false, message: "Recovery failed: " + e.message };
  }
}

// ============================================================================
// BACKUP CLEANUP
// ============================================================================

/**
 * Deletes backups older than retention period.
 * Run this weekly to maintain backup folder size.
 *
 * @param {number} [daysToKeep] — Days to retain (default: 30)
 * @returns {Object} { success: bool, deletedCount: int }
 */
function deleteOldBackups(daysToKeep) {
  if (!v2CheckPermission_('RESTORE_DATA', Session.getActiveUser().getEmail())) {
    throw new Error('Permission denied: backup restore requires ADMIN role');
  }
  daysToKeep = daysToKeep || BACKUP_CONFIG.RETENTION_DAYS;
  try {
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    var props = PropertiesService.getScriptProperties();
    var backups = JSON.parse(props.getProperty("BACKUPS") || "{}");
    var backupFolder = getBackupFolder_();

    var deletedCount = 0;
    var toDelete = [];

    Object.keys(backups).forEach(function(backupId) {
      var backup = backups[backupId];
      var backupTime = new Date(backup.timestamp);

      if (backupTime < cutoffDate) {
        toDelete.push(backupId);
        // Delete backup files from Drive
        if (backup.sheetsBackedUp) {
          backup.sheetsBackedUp.forEach(function(sheet) {
            try {
              var file = DriveApp.getFileById(sheet.fileId);
              backupFolder.removeFile(file);
              deletedCount++;
            } catch (e) {
              Logger.log("  ⚠️ Could not delete file: " + e.message);
            }
          });
        }
      }
    });

    // Remove from metadata
    toDelete.forEach(function(id) {
      delete backups[id];
    });
    props.setProperty("BACKUPS", JSON.stringify(backups));

    Logger.log("✅ Old backups deleted: " + toDelete.length + " backups");
    return { success: true, deletedCount: toDelete.length };
  } catch (e) {
    Logger.log("Cleanup failed: " + e.message);
    return { success: false, message: e.message };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts 2D array to CSV format.
 * @private
 */
function convertArrayToCSV_(array) {
  return array.map(function(row) {
    return row.map(function(cell) {
      if (cell === null || cell === undefined) return "";
      var val = String(cell);
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  }).join("\n");
}

/**
 * Gets backup status summary for admin dashboard.
 * @returns {Object} { totalBackups: int, latestBackup: Object, oldestBackup: Object, totalSize: MB }
 */
function getBackupStatus() {
  try {
    var backups = listBackups();
    var backupFolder = getBackupFolder_();
    var totalSize = 0;

    if (backupFolder) {
      var files = backupFolder.getFiles();
      while (files.hasNext()) {
        totalSize += files.next().getSize();
      }
    }

    return {
      totalBackups: backups.length,
      latestBackup: backups[0] || null,
      oldestBackup: backups[backups.length - 1] || null,
      totalSizeMB: Math.round(totalSize / (1024 * 1024)),
      retentionDays: BACKUP_CONFIG.RETENTION_DAYS
    };
  } catch (e) {
    return { totalBackups: 0, error: e.message };
  }
}
