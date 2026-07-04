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
function tg5sBroadcast_(text, buttons) {
  try {
    if (typeof TelegramLib === 'undefined') return;
    var flag = PropertiesService.getScriptProperties().getProperty('TELEGRAM_ACTIONS_ENABLED');
    if (flag === 'false') return;
    TelegramLib.send(text, buttons);
  } catch (e) { Logger.log('tg5sBroadcast_ skipped: ' + e.message); }
}

// Compact 2-line broadcast card with a tappable record link:
//   <icon> <b>Kind</b> <a href=link><id></a> · <zone> <name>
//   <facts · joined> · → <action> · 👤 <by>
// (Telegram already stamps the send time, so no date footer.)
// opts: { icon, kind, id, link, zoneId, zoneName, facts:[str], action, by }
function _tg5sCard_(opts) {
  var esc = (typeof TelegramLib !== 'undefined' && TelegramLib.esc)
    ? TelegramLib.esc : function (s) { return String(s == null ? '' : s); };
  var id = opts.id ? esc(opts.id) : '';
  if (id && opts.link) id = '<a href="' + esc(opts.link) + '">' + id + '</a>';
  var head = (opts.icon || '🔔') + ' <b>' + esc(opts.kind || '') + '</b>' +
    (id ? ' ' + id : '') +
    ' · ' + esc(opts.zoneId || '') + (opts.zoneName ? ' ' + esc(opts.zoneName) : '');
  var line2 = (opts.facts || []).filter(Boolean).join(' · ');
  if (opts.action) line2 += (line2 ? ' · ' : '') + '→ ' + esc(opts.action);
  if (opts.by) line2 += (line2 ? ' · ' : '') + '👤 ' + esc(opts.by);
  return line2 ? head + '\n' + line2 : head;
}

// Raw deployed /exec URL + query — for inline button links (not an <a> tag).
function _tg5sDeep_(query) {
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!base) return '';
  return base + (query ? (query.charAt(0) === '?' ? query : '?' + query) : '');
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
  var openTask = grid.reduce(function (s, z) { return s + z.openTasks; }, 0);
  var overTask = grid.reduce(function (s, z) { return s + z.overdueTasks; }, 0);
  var redTags  = grid.reduce(function (s, z) { return s + (z.activeRedTags || 0); }, 0);
  var today = Utilities.formatDate(new Date(), TZ, 'dd-MMM-yyyy (EEE)');

  var out = '📊 <b>5S Daily Digest — ' + today + '</b>\n' +
    '✅ Submitted: <b>' + submitted.length + '</b> / ' + grid.length +
    '   📈 Avg: <b>' + avg + '%</b>\n' +
    '📋 Open NCs: <b>' + openCapa + '</b> (' + overdue + ' overdue)   ' +
    '🧰 Open tasks: <b>' + openTask + '</b> (' + overTask + ' overdue)   ' +
    '🏷️ Red tags: <b>' + redTags + '</b>';

  if (pending.length) {
    out += '\n\n🔴 <b>Audit not submitted (' + pending.length + '):</b>\n' +
      pending.map(function (z) { return '• ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name); }).join('\n');
  }
  out += _tg5sDigestSection_(grid, '⚠️', 'Overdue NCs', 'overdueCAPAs');
  out += _tg5sDigestSection_(grid, '🧰', 'Overdue tasks/actions', 'overdueTasks');
  out += _tg5sDigestSection_(grid, '🏷️', 'Active red tags', 'activeRedTags');
  return out;
}

// Renders a "• Z-07 Name — N" block for zones where grid[key] > 0, or ''.
function _tg5sDigestSection_(grid, icon, label, key) {
  var hits = grid.filter(function (z) { return (z[key] || 0) > 0; })
    .sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
  if (!hits.length) return '';
  return '\n\n' + icon + ' <b>' + label + ':</b>\n' +
    hits.map(function (z) { return '• ' + _tg5sZoneLink_(z.id) + ' — ' + z[key]; }).join('\n');
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
    var needsNudge = !z.submitted || z.openCAPAs > 0 || z.openTasks > 0 || (z.activeRedTags || 0) > 0;
    if (!needsNudge) return;
    var chatId = map[z.id];
    if (!chatId) { skipped++; return; }
    var parts = [];
    if (!z.submitted) parts.push('🔴 daily 5S audit is <b>pending</b>');
    if (z.openCAPAs > 0) parts.push('📋 <b>' + z.openCAPAs + '</b> open NC' + (z.openCAPAs > 1 ? 's' : '') +
      (z.overdueCAPAs > 0 ? ' (' + z.overdueCAPAs + ' overdue)' : ''));
    if (z.openTasks > 0) parts.push('🧰 <b>' + z.openTasks + '</b> open task' + (z.openTasks > 1 ? 's' : '') +
      (z.overdueTasks > 0 ? ' (' + z.overdueTasks + ' overdue)' : ''));
    if ((z.activeRedTags || 0) > 0) parts.push('🏷️ <b>' + z.activeRedTags + '</b> active red tag' + (z.activeRedTags > 1 ? 's' : ''));
    var msg = '⏰ <b>' + z.id + ' ' + TelegramLib.esc(z.name) + '</b>\n' +
      parts.join('\n') + '\n\nTap to action → ' + _tg5sZoneLink_(z.id);
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
