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
