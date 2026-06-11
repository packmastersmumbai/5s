/**
 * 30_FormHandler.js — Plan G: Offline Sync Endpoint
 *
 * Public function called by OfflineQueueService.syncToServer()
 * when the client comes back online.
 */

/**
 * syncOfflineSubmissions(submissionsJSON)
 *
 * Accepts a JSON-stringified array of queued submission objects from
 * IndexedDB and routes each one to the appropriate GAS function.
 *
 * @param {string} submissionsJSON  JSON array of { id, formType, data, ... }
 * @returns {{ synced: number, failed: number, errors: Array }}
 */
function syncOfflineSubmissions(submissionsJSON) {
  var result = { synced: 0, failed: 0, errors: [] };

  try {
    var submissions = JSON.parse(submissionsJSON || '[]');

    for (var i = 0; i < submissions.length; i++) {
      var sub = submissions[i];
      try {
        routeOfflineSubmission_(sub);
        result.synced++;
      } catch(e) {
        result.failed++;
        result.errors.push({ id: sub.id, formType: sub.formType, message: e.message });
        Logger.log('[FormHandler] Sync failed for id=' + sub.id + ' type=' + sub.formType + ': ' + e.message);
      }
    }

    Logger.log('[FormHandler] syncOfflineSubmissions complete: synced=' + result.synced + ' failed=' + result.failed);
  } catch(e) {
    Logger.log('[FormHandler] syncOfflineSubmissions parse error: ' + e.message);
    result.errors.push({ id: null, formType: null, message: 'Parse error: ' + e.message });
  }

  return result;
}

/**
 * Route a single queued submission to the appropriate handler.
 * @param {{ formType: string, data: Object }} sub
 */
function routeOfflineSubmission_(sub) {
  var formType = (sub.formType || '').toLowerCase();
  var data     = sub.data || {};

  switch (formType) {
    case 'redtag':
      var rt = createRedTag(data);
      if (!rt || !rt.success) throw new Error(rt ? rt.message : 'createRedTag returned null');
      break;

    case 'kaizen':
      var kz = createKaizenSuggestion(data);
      if (!kz || !kz.success) throw new Error(kz ? kz.message : 'createKaizenSuggestion returned null');
      break;

    case 'audit':
      var au = submitQuickAudit(data);
      if (!au || !au.success) throw new Error(au ? au.message : 'submitQuickAudit returned null');
      break;

    case 'gemba':
      var gw = submitGembaWalk(data);
      if (!gw || !gw.success) throw new Error(gw ? gw.message : 'submitGembaWalk returned null');
      break;

    case 'capa':
      /* CAPA offline sync: update status if ncId is present */
      if (data.ncId) {
        var extra = {};
        if (data.root_cause)       extra.root_cause       = data.root_cause;
        if (data.corrective_action) extra.corrective_action = data.corrective_action;
        updateCAPAStatus(data.ncId, data.status || 'OPEN', '', data.remarks || '', extra);
      } else {
        Logger.log('[FormHandler] CAPA offline record missing ncId — skipping');
      }
      break;

    default:
      Logger.log('[FormHandler] Unknown formType "' + formType + '" — skipping');
      break;
  }
}
