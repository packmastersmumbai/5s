/**
 * ============================================================================
 * 10_Archive.gs — PackMasters 5S Integrated System
 * Phase 3: Data Archival
 * ============================================================================
 *
 * Moves rows older than a cutoff (default 90 days) from raw data sheets
 * to yearly archive sheets. Runs on the 1st of each month.
 *
 * CONSTRAINT-1: BATCH_READ — reads entire sheet once, processes in memory.
 *
 * Functions:
 *   archiveOldData(cutoffDays)        — Master archive function
 *   getOrCreateArchiveSheet_(ss, year) — Gets or creates Archive_YYYY sheet
 *   moveRowsToArchive_(ss, sourceSheetName, cutoffDate) — Moves old rows
 */

// ============================================================================
// MASTER ARCHIVE FUNCTION
// ============================================================================

/**
 * Archives rows older than cutoffDays from DailySubmissions and WeeklyAudit.
 * Moves rows to Archive_YYYY sheet (by fiscal year).
 *
 * @param {number} [cutoffDays=90] — Archive rows older than this many days
 */
function archiveOldData(cutoffDays) {
  cutoffDays = cutoffDays || 90;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

  Logger.log("  🗂️ Archiving data older than " + cutoffDays + " days (before " +
    Utilities.formatDate(cutoffDate, "Asia/Kolkata", "yyyy-MM-dd") + ")...");

  var totalArchived = 0;

  // Archive DailySubmissions
  var dailyCount = moveRowsToArchive_(ss, "DailySubmissions", cutoffDate, 1); // timestamp in col B (idx 1)
  totalArchived += dailyCount;
  Logger.log("    DailySubmissions: " + dailyCount + " rows archived");

  // Archive WeeklyAudit
  var weeklyCount = moveRowsToArchive_(ss, "WeeklyAudit", cutoffDate, 1); // timestamp in col B (idx 1)
  totalArchived += weeklyCount;
  Logger.log("    WeeklyAudit: " + weeklyCount + " rows archived");

  Logger.log("  ✅ Archive complete: " + totalArchived + " total rows moved.");

  logAdminAction_("archiveOldData",
    "Archived " + totalArchived + " rows older than " + cutoffDays + " days. " +
    "Daily: " + dailyCount + ", Weekly: " + weeklyCount);
}


// ============================================================================
// ARCHIVE SHEET MANAGEMENT
// ============================================================================

/**
 * Gets or creates the archive sheet for a given fiscal year.
 *
 * @param {Spreadsheet} ss — Active spreadsheet
 * @param {string} year — Fiscal year string (e.g. "2025-26")
 * @returns {Sheet} Archive sheet
 * @private
 */
function getOrCreateArchiveSheet_(ss, year) {
  var sheetName = "Archive_" + year;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, 3).setValues([["source_sheet", "archived_date", "original_row_data"]]);
    sheet.getRange(1, 1, 1, 3)
      .setFontWeight("bold")
      .setBackground("#4472C4")
      .setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    Logger.log("    📁 Created archive sheet: " + sheetName);
  }

  return sheet;
}

/**
 * Gets the fiscal year string for a given date.
 * Indian FY: April to March.
 *
 * @param {Date} date
 * @returns {string} Fiscal year like "2025-26"
 * @private
 */
function getFiscalYearForDate_(date) {
  var year = date.getFullYear();
  var month = date.getMonth(); // 0-indexed
  if (month < 3) { // Jan-Mar
    return (year - 1) + "-" + String(year).slice(2);
  }
  return year + "-" + String(year + 1).slice(2);
}


// ============================================================================
// ROW ARCHIVAL
// ============================================================================

/**
 * Moves rows older than cutoffDate from a source sheet to the archive.
 * Uses BATCH_READ, processes in memory, batch-writes to archive,
 * then batch-deletes from source (bottom-up to preserve indices).
 *
 * @param {Spreadsheet} ss — Active spreadsheet
 * @param {string} sourceSheetName — Name of source sheet
 * @param {Date} cutoffDate — Archive rows with timestamp before this
 * @param {number} dateColIndex — 0-based column index containing the timestamp
 * @returns {number} Number of rows archived
 * @private
 */
function moveRowsToArchive_(ss, sourceSheetName, cutoffDate, dateColIndex) {
  var sourceSheet = ss.getSheetByName(sourceSheetName);
  if (!sourceSheet || sourceSheet.getLastRow() <= 1) return 0;

  // BATCH_READ
  var allData = sourceSheet.getDataRange().getValues();
  var rowsToArchive = []; // { rowIndex: 1-based, data: [...], date: Date }

  for (var r = 1; r < allData.length; r++) {
    var rowDate;
    if (allData[r][dateColIndex] instanceof Date) {
      rowDate = allData[r][dateColIndex];
    } else {
      rowDate = new Date(String(allData[r][dateColIndex]));
    }

    if (isNaN(rowDate.getTime())) continue;

    if (rowDate < cutoffDate) {
      rowsToArchive.push({
        rowIndex: r + 1, // 1-based sheet row
        data: allData[r],
        date: rowDate
      });
    }
  }

  if (rowsToArchive.length === 0) return 0;

  // Group by fiscal year
  var byFY = {};
  var now = new Date();
  var archiveDateStr = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd HH:mm");

  rowsToArchive.forEach(function(item) {
    var fy = getFiscalYearForDate_(item.date);
    if (!byFY[fy]) byFY[fy] = [];
    byFY[fy].push([
      sourceSheetName,
      archiveDateStr,
      JSON.stringify(item.data)
    ]);
  });

  // Write to archive sheets
  Object.keys(byFY).forEach(function(fy) {
    var archiveSheet = getOrCreateArchiveSheet_(ss, fy);
    var rows = byFY[fy];
    var startRow = archiveSheet.getLastRow() + 1;
    archiveSheet.getRange(startRow, 1, rows.length, 3).setValues(rows);
  });

  // Delete from source (bottom-up to preserve indices)
  var rowIndicesToDelete = rowsToArchive.map(function(item) { return item.rowIndex; });
  rowIndicesToDelete.sort(function(a, b) { return b - a; }); // Descending

  rowIndicesToDelete.forEach(function(rowNum) {
    sourceSheet.deleteRow(rowNum);
  });

  return rowsToArchive.length;
}
