/**
 * ============================================================================
 *  DwmIntegration.gs — TaskFlow DWM auto-task connector
 *  Drop this whole file into the SOURCE app (5S / QMS / any GAS project).
 * ============================================================================
 *
 *  INTENT & GOAL
 *  -------------
 *  People already DO the work and already RECORD it in this app (a 5S audit, a
 *  CAPA, a QC inspection, an improvement action). Asking them to ALSO open
 *  TaskFlow and re-type a task is duplicate effort, so it doesn't happen and
 *  accountability is lost.
 *
 *  This connector makes a TaskFlow DWM task a *byproduct of saving the record*.
 *  When a record is saved/submitted, we send its already-captured details to
 *  DWM in ONE call. DWM creates the task the first time, and on every later
 *  save with the same `ref` it UPDATES that same task (open -> in-progress ->
 *  done). No duplicates, no manual task entry. A "perpetual" system where the
 *  task tracks itself as the source record progresses.
 *
 *  HOW IT WORKS (one line)
 *  -----------------------
 *  HMAC-signed HTTPS GET to the DWM web app: ?act=create&...&ts=...&sig=...
 *  No login. Auth = a shared secret. Replay-protected by a timestamp.
 *
 *  ONE-TIME SETUP
 *  --------------
 *  1) In the DWM Apps Script project: Project Settings -> Script Properties,
 *     copy the value of `taskflow_hmac_secret`.
 *  2) In THIS project: Project Settings -> Script Properties, add
 *     `dwm_hmac_secret` = (that same value).
 *     (Or run Dwm_setSecret('<value>') once, then delete the call.)
 *  Never commit the secret or log it. To rotate, change it in both projects.
 *
 *  USAGE — call from your existing save/submit handler:
 *     DWM.upsertTask({
 *       title:   'CAPA: floor marking faded — Aisle 3',
 *       ref:     record.id,           // STABLE unique id (enables create-once)
 *       status:  record.state,        // 'open' | 'in-progress' | 'completed'
 *       creator: record.raisedBy,     // DWM username/email who raised it (created_by)
 *       client:  record.client,       // DWM client NAME (optional)
 *       assignee:record.responsible,  // DWM user name or email (optional)
 *       due:     record.targetDate,   // 'YYYY-MM-DD' (optional)
 *       priority:record.severity,     // urgent|high|medium|low (optional)
 *       desc:    record.rootCause,    // notes (optional)
 *       photo:   true                 // require completion photo (optional)
 *     });
 *
 *  IDENTIFYING USERS (creator / assignee) — your app's usernames may differ from DWM's:
 *   DWM resolves in this order: (1) EMAIL  (2) exact name  (3) alias table.
 *   PREFER EMAIL — it survives DWM renames and is the same person across apps.
 *   If names differ and you can't send email, a DWM admin registers an alias once:
 *       addUserAlias("<your label>", "<DWM name or email>", adminToken)
 *   Current DWM users (changes over time — don't hardcode): Admin, Khushi, Anuj, Santosh,
 *   Rajesh, TBM, BBM, Shikha. Unknown creator => Integration bot; unknown assignee => unset.
 *   The response's `unresolved` array lists names DWM couldn't map — log it and add an alias.
 *
 *  Returns { ok:true, taskId, status, updated? } or { ok:false, error }.
 *  ALWAYS wrap your call in try/catch — DWM must never block the user's save.
 * ============================================================================
 */

var DWM = (function () {

  // The DWM published web-app /exec URL (one production deploy, reused on every bump).
  var EXEC_URL = 'https://script.google.com/macros/s/AKfycbxG3yKj-XzyU2ydckTNCe0Poc-en3sjDkHJzr-SQFLsEQXF3l4X8Zg49MF_7ZTU_bRHkw/exec';

  var SECRET_PROP = 'dwm_hmac_secret';

  function _secret() {
    var s = PropertiesService.getScriptProperties().getProperty(SECRET_PROP);
    if (!s) throw new Error('DWM: ScriptProperty "' + SECRET_PROP + '" is not set. See ONE-TIME SETUP.');
    return s;
  }

  // Build the canonical string DWM expects: sorted key=value (excl. sig/fmt), RAW values.
  function _canonical(params) {
    var keys = Object.keys(params).filter(function (k) { return k !== 'sig' && k !== 'fmt' && k !== 'act'; }).sort();
    return keys.map(function (k) { return k + '=' + params[k]; }).join('&');
  }

  function _sign(params) {
    var bytes = Utilities.computeHmacSha256Signature(_canonical(params), _secret(), Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(bytes).replace(/=/g, '');
  }

  /**
   * Create or update a DWM task (idempotent on `ref`).
   * fields: { title (required), ref, status, client, assignee, creator, due, priority, time, desc, photo }
   *   creator  = DWM username or email to attribute the task to (created_by). If omitted or
   *              unknown to DWM, the task is attributed to the "Integration" bot user.
   *   assignee = DWM username or email the task is assigned TO.
   */
  function upsertTask(fields) {
    if (!fields || !fields.title) throw new Error('DWM.upsertTask: title is required');

    var params = { act: 'create', ts: String(Math.floor(Date.now() / 1000)) };

    // Pass through known string params if present.
    ['title', 'ref', 'client', 'assignee', 'creator', 'due', 'time', 'desc'].forEach(function (k) {
      if (fields[k] != null && String(fields[k]) !== '') params[k] = String(fields[k]);
    });

    // Normalize priority.
    if (fields.priority) {
      var p = String(fields.priority).toLowerCase();
      var pmap = { urgent: 'urgent', high: 'high', medium: 'medium', med: 'medium', low: 'low' };
      params.priority = pmap[p] || 'medium';
    }

    // Normalize status — accept the source app's vocabulary, DWM maps the rest.
    if (fields.status) {
      var st = String(fields.status).toLowerCase();
      // DWM accepts: todo/open/new, in-progress/in_progress/wip/started, done/completed/complete/closed
      params.status = st;
    }

    if (fields.photo === true || fields.photo === '1' || fields.photo === 1) params.photo = '1';

    params.sig = _sign(params);

    var qs = Object.keys(params).map(function (k) {
      return k + '=' + encodeURIComponent(params[k]);
    }).join('&');

    var resp = UrlFetchApp.fetch(EXEC_URL + '?' + qs, {
      method: 'get', muteHttpExceptions: true, followRedirects: true
    });
    var body = resp.getContentText();
    try { return JSON.parse(body); }
    catch (e) { return { ok: false, error: 'DWM: non-JSON response: ' + body.slice(0, 200) }; }
  }

  /**
   * Safe wrapper — call this from save handlers. Never throws; logs and returns null on error,
   * so a DWM outage can never block the user saving their own record.
   */
  function syncTaskSafe(fields) {
    try {
      var r = upsertTask(fields);
      if (!r.ok) Logger.log('DWM sync not ok: ' + (r.error || JSON.stringify(r)));
      _logSync(fields, r, null);
      return r;
    } catch (e) {
      Logger.log('DWM sync skipped (' + (fields && fields.ref) + '): ' + e.message);
      _logSync(fields, null, e.message);
      return null;
    }
  }

  /** Record each sync outcome to a DwmSyncLog sheet (diagnostic — makes silent failures visible). */
  function _logSync(fields, result, errMsg) {
    try {
      var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) return;
      var sheet = ss.getSheetByName('DwmSyncLog');
      if (!sheet) {
        sheet = ss.insertSheet('DwmSyncLog');
        sheet.getRange(1, 1, 1, 8).setValues([['timestamp', 'ref', 'title', 'ok', 'taskId/updated', 'creator', 'assigned/unresolved', 'error']]);
        sheet.setFrozenRows(1);
      }
      var unres = (result && result.unresolved && result.unresolved.length)
        ? ('unresolved:' + result.unresolved.map(function (u) { return u.field + '=' + u.value; }).join(',')) : '';
      sheet.appendRow([new Date(), (fields && fields.ref) || '', (fields && fields.title) || '',
        result ? !!result.ok : false,
        result ? ((result.taskId || '') + (result.updated ? ' (updated)' : '')) : '',
        (fields && fields.creator) || '',
        (result && result.assigned ? 'assigned' : '') + (unres ? ' ' + unres : ''),
        errMsg || (result && !result.ok ? result.error : '') || '']);
    } catch (e) { /* never block */ }
  }

  /**
   * Verify an INBOUND signed callback from DWM (same HMAC + canonical scheme as
   * our outbound calls). DWM must sign the canonical string of all params except
   * sig/fmt/act (sorted key=value, RAW values) with the shared secret, and send a
   * fresh `ts` (unix seconds). Returns { ok:true } or { ok:false, error }.
   */
  function verifySig(params, maxSkewSec) {
    if (!params || !params.sig) return { ok: false, error: 'missing sig' };
    var ts = Number(params.ts || 0);
    var skew = maxSkewSec || 300;
    var nowSec = Math.floor(Date.now() / 1000);
    if (!ts || Math.abs(nowSec - ts) > skew) return { ok: false, error: 'stale or missing ts' };
    var expect;
    try { expect = _sign(params); } catch (e) { return { ok: false, error: e.message }; }
    if (String(params.sig) !== expect) return { ok: false, error: 'bad sig' };
    return { ok: true };
  }

  return { upsertTask: upsertTask, syncTaskSafe: syncTaskSafe, verifySig: verifySig, EXEC_URL: EXEC_URL };
})();


/**
 * DWM → QMS reverse sync. Call from doPost when a DWM task is completed:
 *   POST JSON { act:'dwm-done', ref:'<TK|NC|RT id>', ts:<unixSec>, sig:'<hmac>', by:'<user>', status:'completed' }
 * The `ref` is the same stable id we sent on create, so completing in DWM closes
 * the source QMS record. HMAC-verified + timestamp-replay-protected. Idempotent.
 */
function handleDwmDone_(data) {
  var v = DWM.verifySig(data);
  if (!v.ok) return jsonResponse_(403, { ok: false, error: 'DWM callback rejected: ' + v.error });
  var ref = String((data && data.ref) || '').trim();
  if (!ref) return jsonResponse_(400, { ok: false, error: 'missing ref' });
  var by = String((data && data.by) || 'DWM').split('@')[0];
  var note = 'Completed in DWM by ' + by;
  var pre = ref.substring(0, 3).toUpperCase(), r;
  if (pre === 'TK-')      r = updateTaskStatus(ref, STATUS.DONE, note);
  else if (pre === 'NC-') r = updateNCStatus(ref, 'Closed');
  else if (pre === 'RT-') r = updateRedTagStatus(ref, STATUS.CLOSED, note, note);
  else return jsonResponse_(400, { ok: false, error: 'unknown ref type: ' + ref });
  var ok = !!(r && (r.ok || r.success));
  return jsonResponse_(ok ? 200 : 404, { ok: ok, ref: ref, result: r });
}


/**
 * Resolve a 5S identity (username, full name, or email) to the best value for DWM
 * attribution: prefer EMAIL (survives renames), else the display name. Reads the Users sheet.
 * Returns "" if nothing usable, so the caller omits the field (DWM falls back to Integration bot).
 */
function dwmResolveUser_(idOrName) {
  var s = String(idOrName || "").trim();
  if (!s || s.toLowerCase() === "worker" || s.toLowerCase() === "system") return "";
  if (s.indexOf("@") > -1) return s;  // already an email
  try {
    var ss = (typeof v2GetSpreadsheet_ === "function") ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss && ss.getSheetByName("Users");
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      var low = s.toLowerCase();
      for (var i = 1; i < data.length; i++) {
        var uname = String(data[i][0] || "").trim().toLowerCase();   // username
        var fname = String(data[i][3] || "").trim();                 // full_name
        var email = String(data[i][5] || "").trim();                 // email
        if (uname === low || fname.toLowerCase() === low) {
          return email || fname || s;   // prefer email, else display name
        }
      }
    }
  } catch (e) {}
  return s;  // pass through — DWM tries name/alias match
}

/**
 * Whether a red tag warrants its own tracked DWM task.
 * ponytail: a red tag whose only action is disposal, with nobody assigned, IS
 * its own record — spawning a DWM task for it just adds noise. Anything with an
 * owner, or any non-disposal action (repair/return/relocate), pushes.
 * Override: ScriptProperty DWM_REDTAG_PUSH_ALL="true" pushes every red tag.
 */
function dwmShouldPushRedTag_(proposedAction, owner) {
  try {
    if (PropertiesService.getScriptProperties().getProperty('DWM_REDTAG_PUSH_ALL') === 'true') return true;
  } catch (e) {}
  if (owner && String(owner).trim()) return true;
  var a = String(proposedAction || '').toLowerCase();
  return !/^(discard|scrap|dispose|disposed|trash|reject)/.test(a);
}

/** One-time helper: set the shared secret, then DELETE the call (don't commit the value). */
function Dwm_setSecret(value) {
  PropertiesService.getScriptProperties().setProperty('dwm_hmac_secret', value);
  return 'dwm_hmac_secret set.';
}

/** Connectivity self-test — creates a throwaway task, then you can delete it in DWM. */
function Dwm_selfTest() {
  var r = DWM.syncTaskSafe({
    title: 'DWM connectivity test — ' + new Date().toISOString(),
    ref: 'CONNECTIVITY-TEST',
    status: 'todo',
    priority: 'low',
    desc: 'Sent from ' + (ScriptApp.getScriptId ? ScriptApp.getScriptId() : 'source app') + '. Safe to delete.'
  });
  Logger.log(JSON.stringify(r));
  return r;
}


/* ============================================================================
 *  WIRING REFERENCE — DWM.syncTaskSafe() field map.
 *
 *    title     string   human label, e.g. 'CAPA: ' + problem
 *    ref       string   STABLE record id — links record <-> DWM task forever
 *    status    string   'open' | 'in-progress' | 'completed'
 *    creator   string   DWM username/email of who raised it
 *    client    string   DWM client name                      (optional)
 *    assignee  string   DWM user name/email                  (optional)
 *    due       string   'YYYY-MM-DD'                         (optional)
 *    priority  string   'high' | 'medium' | 'low'
 *    desc      string   free text — root cause, defect, notes
 *    photo     boolean  true = require photo proof of completion
 *
 *  Call it from the record's own save/update handler, mapping the fields above
 *  from that record. For inspections, only sync FAILs that need follow-up —
 *  skip routine passes.
 * ========================================================================= */
