// ============================================================================
// 29c_TelegramReminders.js — PackMasters 5S: channel digest, per-action posts,
// and individual (DM) reminders to zone leaders.
// ----------------------------------------------------------------------------
// Transport lives in 29_TelegramLib.js; the command map + data grid live in
// 29b_TelegramCommands.js. This file adds the SCHEDULED + EVENT-DRIVEN sends and
// reuses _tg5sZoneGrid_() / _tg5sZoneLink_() so there is one data path, not two.
//
// Telegram rule: a bot can only DM a user who has messaged it first. Zone
// leaders enrol by sending "/register Z-07" to @PM5sBot; we store their chat.id
// in the ScriptProperty TG_ZONE_CHATS (JSON, zoneId -> chatId). No sheet change.
// ============================================================================

// ── Safe channel broadcast (event-driven "after each action") ───────────────
// Gated by ScriptProperty TELEGRAM_ACTIONS_ENABLED ("false" mutes without a
// redeploy; default ON). Never throws — a Telegram outage must never block a save.
function tg5sBroadcast_(text) {
  try {
    if (typeof TelegramLib === 'undefined') return;
    var flag = PropertiesService.getScriptProperties().getProperty('TELEGRAM_ACTIONS_ENABLED');
    if (flag === 'false') return;
    TelegramLib.send(text);
  } catch (e) { Logger.log('tg5sBroadcast_ skipped: ' + e.message); }
}

// ── Enrolment map (zoneId -> chatId) ────────────────────────────────────────
function _tg5sChatMap_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('TG_ZONE_CHATS') || '{}'); }
  catch (e) { return {}; }
}
function _tg5sChatMapSave_(map) {
  PropertiesService.getScriptProperties().setProperty('TG_ZONE_CHATS', JSON.stringify(map));
}

// Command: "/register Z-07" — binds the sender's chat to a zone for DM reminders.
// Called by the TelegramLib router (see 29b command map) with (arg, chatId).
function tg5sRegister_(arg, chatId) {
  var zoneId = String(arg || '').trim().toUpperCase();
  if (!zoneId) return 'Usage: /register <ZONE-ID>  e.g. /register Z-07';
  var cfg = (typeof v2GetZoneConfig_ === 'function') ? v2GetZoneConfig_() : {};
  if (!cfg[zoneId]) return 'Unknown zone "' + zoneId + '". Send /zones to see valid IDs.';
  var map = _tg5sChatMap_();
  map[zoneId] = chatId;
  _tg5sChatMapSave_(map);
  return '✅ Registered for ' + zoneId + ' (' + (cfg[zoneId].name || '') + ').\n' +
         'You will get DM reminders when this zone has a pending audit or overdue NCs.';
}

// Command: "/unregister" — removes every binding for this chat.
function tg5sUnregister_(arg, chatId) {
  var map = _tg5sChatMap_(), removed = [];
  Object.keys(map).forEach(function (z) { if (String(map[z]) === String(chatId)) { delete map[z]; removed.push(z); } });
  _tg5sChatMapSave_(map);
  return removed.length ? '🔕 Unsubscribed from: ' + removed.join(', ') : 'You had no active registrations.';
}

// ── Daily digest → channel ──────────────────────────────────────────────────
function _tg5sDigestText_() {
  var grid = _tg5sZoneGrid_();
  var submitted = grid.filter(function (z) { return z.submitted; });
  var pending   = grid.filter(function (z) { return !z.submitted; });
  var scored    = submitted.filter(function (z) { return z.pctScore !== null; });
  var avg = scored.length ? Math.round(scored.reduce(function (s, z) { return s + z.pctScore; }, 0) / scored.length) : 0;
  var openCapa = grid.reduce(function (s, z) { return s + z.openCAPAs; }, 0);
  var overdue  = grid.reduce(function (s, z) { return s + z.overdueCAPAs; }, 0);
  var today = Utilities.formatDate(new Date(), TZ, 'dd-MMM-yyyy (EEE)');

  var out = '📊 <b>5S Daily Digest — ' + today + '</b>\n' +
    '✅ Submitted: <b>' + submitted.length + '</b> / ' + grid.length +
    '   📈 Avg: <b>' + avg + '%</b>\n' +
    '📋 Open NCs: <b>' + openCapa + '</b>   ⚠️ Overdue: <b>' + overdue + '</b>';

  if (pending.length) {
    out += '\n\n🔴 <b>Not submitted (' + pending.length + '):</b>\n' +
      pending.map(function (z) { return '• ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name); }).join('\n');
  }
  var overdueZones = grid.filter(function (z) { return z.overdueCAPAs > 0; })
    .sort(function (a, b) { return b.overdueCAPAs - a.overdueCAPAs; });
  if (overdueZones.length) {
    out += '\n\n⚠️ <b>Overdue NCs:</b>\n' +
      overdueZones.map(function (z) { return '• ' + _tg5sZoneLink_(z.id) + ' — ' + z.overdueCAPAs + ' overdue'; }).join('\n');
  }
  return out;
}

// Top-level: called by the scheduled trigger + the admin menu.
function sendTelegramDailyDigest() {
  if (typeof TelegramLib === 'undefined') return false;
  return TelegramLib.send(_tg5sDigestText_());
}

// ── Individual (DM) reminders to registered zone leaders ────────────────────
// DMs only zones that (a) have a registered chat AND (b) are pending today or
// have overdue NCs. Zones with no registration are skipped (logged).
function remindZoneLeaders() {
  if (typeof TelegramLib === 'undefined') return { sent: 0, skipped: 0 };
  var map = _tg5sChatMap_();
  var grid = _tg5sZoneGrid_();
  var sent = 0, skipped = 0;
  grid.forEach(function (z) {
    var needsNudge = !z.submitted || z.overdueCAPAs > 0 || z.overdueTasks > 0;
    if (!needsNudge) return;
    var chatId = map[z.id];
    if (!chatId) { skipped++; return; }
    var parts = [];
    if (!z.submitted) parts.push('daily audit is <b>pending</b>');
    if (z.overdueCAPAs > 0) parts.push('<b>' + z.overdueCAPAs + '</b> overdue NC' + (z.overdueCAPAs > 1 ? 's' : ''));
    if (z.overdueTasks > 0) parts.push('<b>' + z.overdueTasks + '</b> overdue task' + (z.overdueTasks > 1 ? 's' : ''));
    var msg = '⏰ <b>' + z.id + ' ' + TelegramLib.esc(z.name) + '</b>\n' +
      'Your ' + parts.join(' and ') + '.\nTap to action → ' + _tg5sZoneLink_(z.id);
    if (TelegramLib.reply(chatId, msg)) sent++;
  });
  Logger.log('remindZoneLeaders: sent=' + sent + ' skipped(no-registration)=' + skipped);
  return { sent: sent, skipped: skipped };
}

// NOTE: no standalone triggers — the single-trigger architecture (health check
// asserts exactly one `masterOrchestrator` trigger) forbids extra ones.
// Instead: remindZoneLeaders() is called from masterOrchestrator (07:30 IST daily)
// and sendTelegramDailyDigest() rides the existing sendDailySummaryReport (evening
// email trigger). Both are also runnable on demand from the admin menu.
