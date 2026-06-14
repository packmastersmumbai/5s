/**
 * Provision a Drive photo folder per zone and write its id into Zones col 9 (driveFolderId).
 * Idempotent: reuses the root folder (id in ScriptProperty PHOTO_ROOT_FOLDER_ID) and skips
 * zones that already have a folder id. Run once after deploy to fix image upload.
 */
function provisionZonePhotoFolders() {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("Zones");
  if (!sheet) return { error: "No Zones sheet" };

  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty("PHOTO_ROOT_FOLDER_ID");
  var root;
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; }
  }
  if (!root) {
    var existing = DriveApp.getFoldersByName("5S Audit Photos");
    root = existing.hasNext() ? existing.next() : DriveApp.createFolder("5S Audit Photos");
    props.setProperty("PHOTO_ROOT_FOLDER_ID", root.getId());
  }

  var data = sheet.getDataRange().getValues();
  var created = 0, skipped = 0, results = [];
  for (var r = 1; r < data.length; r++) {
    var zoneId = String(data[r][0] || "").trim();
    if (!zoneId) continue;
    var existingId = String(data[r][8] || "").trim();
    if (existingId) {
      try { DriveApp.getFolderById(existingId); skipped++; continue; } catch (e) { /* stale → recreate */ }
    }
    var zoneName = String(data[r][1] || zoneId).trim();
    var folderName = zoneId + " " + zoneName;
    var found = root.getFoldersByName(folderName);
    var folder = found.hasNext() ? found.next() : root.createFolder(folderName);
    sheet.getRange(r + 1, 9).setValue(folder.getId());
    created++;
    results.push(zoneId + " → " + folder.getId());
  }
  if (typeof refreshConfig === "function") { try { refreshConfig(); } catch (e) {} }
  return { ok: true, rootFolderId: root.getId(), created: created, skipped: skipped, sample: results.slice(0, 3) };
}

/** Last N rows of DwmSyncLog (diagnostic for DWM task sync). */
function dumpDwmSyncLog(n) {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("DwmSyncLog");
  if (!sheet || sheet.getLastRow() < 2) return "DwmSyncLog empty or missing";
  n = n || 10;
  var last = sheet.getLastRow();
  var start = Math.max(2, last - n + 1);
  var rows = sheet.getRange(start, 1, last - start + 1, 8).getValues();
  return rows.map(function(r) {
    return [String(r[0]), r[1], "ok=" + r[3], r[4], "by:" + (r[5] || "?"), r[6] || "", r[7] ? ("ERR:" + r[7]) : ""].join(" | ");
  });
}

function getNcRow2() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) return 'no id';
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('NC_CAPA');
  if (!sh) return 'no NC_CAPA sheet';
  var raw = sh.getRange(1, 1, 3, sh.getLastColumn()).getValues();
  return raw.map(function(row) { return row.map(function(v) { return String(v); }); });
}

function getSheetHeaders() {
  var ss = v2GetSpreadsheet_();
  if (!ss) return 'no spreadsheet';
  var out = [];
  ['NC_CAPA','Summary','RedTagRegister'].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { out.push(name + ': NOT FOUND'); return; }
    var cols = sh.getLastColumn();
    var rows = sh.getLastRow();
    if (cols < 1 || rows < 1) { out.push(name + ': EMPTY cols=' + cols + ' rows=' + rows); return; }
    var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
    out.push(name + ' (' + rows + 'r): ' + headers.join('|'));
  });
  return out.length ? out : 'all empty';
}

function clearAnalyticsCache() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['ANALYTICS_KPIS', 'PILLAR_TREND', 'KANBAN_DATA']);
  return 'cleared';
}

function listAllProperties() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var result = {};
  Object.keys(props).forEach(function(k) {
    result[k] = props[k].length + ' chars';
  });
  return JSON.stringify(result);
}

function deleteStaleProperties() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = [];
  Object.keys(all).forEach(function(k) {
    if (k.indexOf('SESSION_') === 0 || k.indexOf('ZONE_CONFIG_BACKUP_') === 0) {
      props.deleteProperty(k);
      deleted.push(k);
    }
  });
  return JSON.stringify({ deleted: deleted.length, keys: deleted });
}

function deleteBackupProperties() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = [];
  Object.keys(all).forEach(function(k) {
    if (k.indexOf('ZONE_CONFIG_BACKUP_') === 0) {
      props.deleteProperty(k);
      deleted.push(k);
    }
  });
  return JSON.stringify({ deleted: deleted, count: deleted.length });
}

function persistSpreadsheetId() {
  var parents = DriveApp.getFileById(ScriptApp.getScriptId()).getParents();
  while (parents.hasNext()) {
    var p = parents.next();
    if (p.getMimeType() === MimeType.GOOGLE_SHEETS) {
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', p.getId());
      return 'Persisted: ' + p.getId() + ' (' + p.getName() + ')';
    }
  }
  return 'No GOOGLE_SHEETS parent found';
}

