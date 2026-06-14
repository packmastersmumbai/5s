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
    var keys = Object.keys(params).filter(function (k) { return k !== 'sig' && k !== 'fmt'; }).sort();
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
      return r;
    } catch (e) {
      Logger.log('DWM sync skipped (' + (fields && fields.ref) + '): ' + e.message);
      return null;
    }
  }

  return { upsertTask: upsertTask, syncTaskSafe: syncTaskSafe, EXEC_URL: EXEC_URL };
})();


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
 *  EXAMPLE WIRING — copy the relevant one into your real save handler.
 *  These are illustrative; map fields from YOUR record object.
 * ========================================================================= */

/** 5S — CAPA / corrective action saved. Call from your CAPA save/update function. */
function example_onCapaSaved(capa) {
  // capa.state should be one of: 'open' | 'in-progress' | 'completed'
  DWM.syncTaskSafe({
    title:    'CAPA: ' + (capa.problem || capa.title || 'corrective action'),
    ref:      capa.id,                              // STABLE id — links record <-> DWM task forever
    status:   capa.state || 'open',
    creator:  capa.raisedBy || '',                  // DWM username/email of who raised it
    client:   capa.client || '',                    // DWM client name (optional)
    assignee: capa.responsible || '',               // DWM user name/email (optional)
    due:      capa.targetDate || '',                // 'YYYY-MM-DD'
    priority: (capa.severity === 'High') ? 'high' : 'medium',
    desc:     capa.rootCause || '',
    photo:    true                                  // require photo proof of completion
  });
}

/** QMS — IQC/OQC inspection submitted with a FAIL that needs follow-up. */
function example_onInspectionFail(insp) {
  DWM.syncTaskSafe({
    title:    'QC follow-up: ' + (insp.partName || insp.item) + ' (' + insp.type + ')',
    ref:      insp.id,                              // e.g. 'IQC-2026-0042'
    status:   insp.dispositionDone ? 'completed' : (insp.inProgress ? 'in-progress' : 'open'),
    client:   insp.client || '',
    assignee: insp.assignedTo || '',
    priority: 'high',
    desc:     'Defect: ' + (insp.defect || '') + '. ' + (insp.notes || ''),
    photo:    true
  });
  // Only call for FAILs that need action — skip routine passes.
}

/** Improvement / SQDCP action — assigned or closed. */
function example_onImprovementAction(act) {
  DWM.syncTaskSafe({
    title:    'Improvement: ' + act.title,
    ref:      act.id,
    status:   act.closed ? 'completed' : (act.assigned ? 'in-progress' : 'open'),
    assignee: act.owner || '',
    due:      act.dueDate || '',
    priority: 'medium',
    desc:     act.description || ''
  });
}
