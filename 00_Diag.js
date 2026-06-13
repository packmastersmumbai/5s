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
  ['NC_CAPA','Summary','RedTags'].forEach(function(name) {
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

