/**
 * ============================================================================
 * 09b_DeferredNotify.js — move slow side-effects off the user's request
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * Status buttons (Start / Done / Close / Advance) felt frozen. Measured on the
 * live deployment 2026-09-02, one press of "Start" cost 14.3s of server time:
 *
 *     updateTaskStatus       9,193 ms
 *       ├─ read TaskBoard    1,036 ms
 *       ├─ DWM.syncTaskSafe  5,524 ms   <-- external HTTP, blocking
 *       └─ tg5sBroadcast_      556 ms   <-- external HTTP, blocking
 *     getUnifiedActionList   5,089 ms   (the re-fetch that follows)
 *
 * The DWM sync and the Telegram card are NOTIFICATIONS. Nothing the operator
 * does next depends on them, yet the browser waited for both before the button
 * un-greyed. Queueing them and letting a one-off trigger drain the queue a few
 * seconds later removes ~6s from every status change without losing a message.
 *
 * The queue lives in ScriptProperties (not CacheService) because cache entries
 * can be evicted under memory pressure, and a dropped entry here means a
 * silently missing Telegram card. Note the project's ScriptProperties quota:
 * the queue is drained and deleted on every flush, and capped, so it cannot
 * grow without bound.
 */

/** Property key holding the pending-notification queue. @private */
var _DN_KEY = 'PM5S_NOTIFY_QUEUE';

/** Hard cap — a runaway queue must never exhaust the properties quota. @private */
var _DN_MAX = 200;

/**
 * Queues one notification and schedules a drain.
 *
 * Never throws: a queueing failure must not fail the write that triggered it.
 *
 * @param {Object} job  { kind: 'dwm'|'telegram', payload: Object }
 */
function deferNotify_(job) {
  try {
    var props = PropertiesService.getScriptProperties();
    var q = [];
    try { q = JSON.parse(props.getProperty(_DN_KEY) || '[]'); } catch (e) { q = []; }
    if (q.length >= _DN_MAX) {
      Logger.log('Notify queue full (' + q.length + '); dropping oldest.');
      q = q.slice(-(_DN_MAX - 1));
    }
    q.push(job);
    props.setProperty(_DN_KEY, JSON.stringify(q));
    _dnEnsureDrainScheduled_();
  } catch (e) {
    Logger.log('deferNotify_ failed (notification lost, write kept): ' + e.message);
  }
}

/**
 * Creates a one-off trigger to drain the queue shortly after the request ends.
 *
 * Only ever one pending drain: without this guard every button press would
 * create its own trigger and the project would hit the 20-trigger ceiling.
 * @private
 */
function _dnEnsureDrainScheduled_() {
  try {
    var existing = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'flushDeferredNotifications';
    });
    if (existing.length) return;
    ScriptApp.newTrigger('flushDeferredNotifications')
      .timeBased()
      .after(15 * 1000)
      .create();
  } catch (e) {
    Logger.log('Could not schedule notify drain: ' + e.message);
  }
}

/**
 * Drains the queue: performs the DWM syncs and Telegram broadcasts that were
 * deferred, then removes its own one-off trigger.
 *
 * Safe to run when the queue is empty, and safe to run concurrently with a
 * write: the queue is claimed (read + cleared under lock) before any slow work
 * starts, so a notification queued mid-flush is picked up by the next drain
 * rather than being lost or sent twice.
 *
 * @returns {Object} { processed, failed }
 */
function flushDeferredNotifications() {
  var props = PropertiesService.getScriptProperties();
  var jobs = [];

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10 * 1000); } catch (e) {
    Logger.log('Notify flush skipped: could not obtain lock.');
    return { processed: 0, failed: 0 };
  }
  try {
    try { jobs = JSON.parse(props.getProperty(_DN_KEY) || '[]'); } catch (e) { jobs = []; }
    props.deleteProperty(_DN_KEY);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  var processed = 0, failed = 0;
  jobs.forEach(function (job) {
    try {
      if (job.kind === 'dwm' && typeof DWM !== 'undefined') {
        DWM.syncTaskSafe(job.payload);
      } else if (job.kind === 'telegram' && typeof tg5sBroadcast_ === 'function') {
        tg5sBroadcast_(job.payload.text, job.payload.buttons, job.payload.photos);
      }
      processed++;
    } catch (e) {
      failed++;
      Logger.log('Deferred notification failed (' + job.kind + '): ' + e.message);
    }
  });

  _dnCleanupTriggers_();
  if (processed || failed) Logger.log('Notify flush: ' + processed + ' sent, ' + failed + ' failed.');
  return { processed: processed, failed: failed };
}

/** Removes the one-off drain triggers this module created. @private */
function _dnCleanupTriggers_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'flushDeferredNotifications') ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
}

/** Queue depth — for diagnostics. @returns {number} */
function deferredNotifyDepth() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(_DN_KEY) || '[]').length;
  } catch (e) { return -1; }
}
