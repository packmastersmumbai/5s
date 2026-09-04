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
function tg5sBroadcast_(text, buttons, photoUrl) {
  try {
    if (typeof TelegramLib === 'undefined') return;
    var flag = PropertiesService.getScriptProperties().getProperty('TELEGRAM_ACTIONS_ENABLED');
    if (flag === 'false') return;
    // With evidence, send the photo itself and carry the card as its caption —
    // sendPhoto falls back to a text message if Telegram cannot fetch the image.
    if (photoUrl && TelegramLib.sendPhoto) TelegramLib.sendPhoto(_tg5sFirstPhoto_(photoUrl), text, buttons);
    else TelegramLib.send(text, buttons);
  } catch (e) { Logger.log('tg5sBroadcast_ skipped: ' + e.message); }
}

// Normalise a user field for display. Anonymous web-app users have no Session
// identity, so records can carry "system"/"worker"/an email — none of which is
// a useful name in a chat feed. Returns "" so the caller can omit the field.
function _tg5sWho_(name) {
  var s = String(name == null ? '' : name).trim();
  if (!s) return '';
  var low = s.toLowerCase();
  if (low === 'system' || low === 'worker' || low === 'auditor' || low === 'unknown') return '';
  if (s.indexOf('@') > -1) s = s.split('@')[0];   // email → local part
  return s;
}

// Photo columns store comma-joined Drive URLs; Telegram takes one. Prefer a
// direct-download form, which Telegram fetches more reliably than /thumbnail.
function _tg5sFirstPhoto_(photoUrls) {
  var first = String(photoUrls || '').split(',')[0].trim();
  if (!first) return '';
  var m = first.match(/[?&]id=([A-Za-z0-9_-]+)/) || first.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? ('https://drive.google.com/uc?export=download&id=' + m[1]) : first;
}

// ── Formatting system ────────────────────────────────────────────
// Telegram HTML supports ONLY <b> <i> <u> <s> <code> <pre> <a>. There is no
// colour, no border, no table. So: "colour" = emoji, "border" = a Unicode rule,
// "alignment" = <code>. Two independent axes, never merged into one glyph:
//   TG5S_STATUS — how the record is DOING  (red = bad, green = good)
//   TG5S_KIND   — what the record IS       (NC / Task / Red Tag / Kaizen / Gemba)
// Merging them was the Actions Hub defect: a Task read green even when overdue.
var TG5S_STATUS = {
  blocked: '🔴', overdue: '🔴',
  soon: '🟠', due: '🟠',
  progress: '🟡', open: '🟡',
  done: '🟢', good: '🟢',
  info: '⚪'
};
var TG5S_KIND = {
  'NC': '🔴', 'Task': '🗒️', 'Red Tag': '🏷️',
  'Kaizen': '💡', 'Gemba': '👁', 'Audit': '📊'
};
var TG5S_RULE_HEAVY = '━━━━━━━━━━━━━━━━━━━━';   // between digest sections
var TG5S_RULE_LIGHT = '────────────────────';   // inside a card
var TG5S_BAR = '▎';                     // left bar on quoted finding text
var TG5S_BULLET = '•', TG5S_SUB = '◦', TG5S_ARROW = '↳';

// Cap the emoji budget. More than ~4 and the eye stops reading them as signal.
function _tg5sCapEmoji_(text, max) {
  var re = /[\u231A-\u27BF\u2B00-\u2BFF\uD83C-\uDBFF\uDC00-\uDFFF\uFE0F\u20E3]+/g;
  var seen = 0;
  return String(text || '').replace(re, function (m) {
    seen++;
    return seen <= (max || 4) ? m : '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n');
}

// Broadcast card. Status glyph and kind glyph stay distinct; the finding text is
// quoted behind a left bar so it reads as evidence, not as prose.
//   <kind-icon><status> <b>Kind</b> · <zone> <name>
//   ▎ <first fact>
//   • <fact> · <fact>
//   ↳ <action> · 👤 <by>
// opts: { icon, kind, id, link, zoneId, zoneName, facts:[str], action, by, status }
function _tg5sCard_(opts) {
  var esc = (typeof TelegramLib !== 'undefined' && TelegramLib.esc)
    ? TelegramLib.esc : function (s) { return String(s == null ? '' : s); };
  // Full record ID is omitted here (long, low-signal in a chat feed) — the
  // "Open record" inline button carries it. Icon links to the record instead.
  var kindIcon = opts.icon || TG5S_KIND[opts.kind] || '🔔';
  var status = opts.status ? (TG5S_STATUS[opts.status] || '') : '';
  var lead = kindIcon + status;
  if (opts.link) lead = '<a href="' + esc(opts.link) + '">' + lead + '</a>';
  var head = lead + ' <b>' + esc(opts.kind || '') + '</b>' +
    ' · ' + esc(opts.zoneId || '') + (opts.zoneName ? ' ' + esc(opts.zoneName) : '');

  var facts = (opts.facts || []).filter(Boolean);
  var lines = [head];
  if (facts.length) lines.push(TG5S_BAR + ' ' + facts[0]);
  if (facts.length > 1) lines.push(TG5S_BULLET + ' ' + facts.slice(1).join(' · '));
  var tail = '';
  if (opts.action) tail = TG5S_ARROW + ' ' + esc(opts.action);
  if (opts.by) tail += (tail ? ' · ' : TG5S_ARROW + ' ') + '👤 ' + esc(opts.by);
  if (tail) lines.push(tail);
  return _tg5sCapEmoji_(lines.join('\n'), 4);
}

// Raw deployed /exec URL + query — for inline button links (not an <a> tag).
function _tg5sDeep_(query) {
  // Was ScriptApp.getService().getUrl(), which drifted to a dead deployment and
  // made every Telegram "Open record" button 404. See v2WebAppUrl_.
  if (typeof v2WebAppUrl_ === 'function') return v2WebAppUrl_(query);
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!base) return '';
  base = base.replace(/\/dev$/, '/exec');
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

  var dueToday = grid.reduce(function (s, z) { return s + (z.dueToday || 0); }, 0);
  var dueTom   = grid.reduce(function (s, z) { return s + (z.dueTomorrow || 0); }, 0);

  var out = '📊 <b>5S Daily Digest — ' + today + '</b>\n' +
    '✅ Submitted: <b>' + submitted.length + '</b> / ' + grid.length +
    '   📈 Avg: <b>' + avg + '%</b>\n' +
    '🗓️ Due: <b>' + dueToday + '</b> today · <b>' + dueTom + '</b> tomorrow\n' +
    '📋 Open NCs: <b>' + openCapa + '</b> (' + overdue + ' overdue)   ' +
    '🧰 Open tasks: <b>' + openTask + '</b> (' + overTask + ' overdue)   ' +
    '🏷️ Red tags: <b>' + redTags + '</b>';

  // Integration health goes ABOVE the per-zone lists: those lists are long, and
  // anything after them is what gets pushed off the end when the digest is split.
  // syncTaskSafe swallows every DWM failure by design (an outage must not block a
  // save), which meant a quarter of the integration could be broken while the app
  // looked perfectly healthy. Surface it here or nowhere.
  var dwm = _tg5sDwmFailures_(1);
  if (dwm.failed > 0) {
    out += '\n⚠ <b>' + dwm.failed + '</b> record' + (dwm.failed > 1 ? 's' : '') +
      ' failed to sync to DWM in the last 24h' +
      (dwm.topReason ? '\n' + TG5S_SUB + ' ' + TelegramLib.esc(dwm.topReason) : '');
  }

  if (pending.length) {
    out += '\n\n🔴 <b>Audit not submitted (' + pending.length + '):</b>\n' +
      pending.map(function (z) { return '• ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name); }).join('\n');
  }
  out += _tg5sDigestSection_(grid, '⚠️', 'Overdue NCs', 'overdueCAPAs');
  out += _tg5sDigestSection_(grid, '🧰', 'Overdue tasks/actions', 'overdueTasks');
  out += _tg5sDigestSection_(grid, '🏷️', 'Active red tags', 'activeRedTags');

  return out;
}

// Counts DwmSyncLog rows with ok=false in the last `days` days and returns the
// most common error. Column order is fixed by DWM._logSync:
//   0 timestamp · 1 ref · 2 title · 3 ok · 4 taskId · 5 creator · 6 assigned · 7 error
// (Read by index, never by header — a stale header row is what made this log
// misleading in the first place.)
function _tg5sDwmFailures_(days) {
  var out = { failed: 0, topReason: '' };
  try {
    var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : null;
    var sheet = ss && ss.getSheetByName('DwmSyncLog');
    if (!sheet || sheet.getLastRow() < 2) return out;
    // Only the tail matters; the log grows unbounded.
    var want = Math.min(sheet.getLastRow() - 1, 500);
    var rows = sheet.getRange(sheet.getLastRow() - want + 1, 1, want, 8).getValues();
    var cutoff = new Date().getTime() - (days || 1) * 86400000;
    var tally = {};
    rows.forEach(function (r) {
      var ts = (r[0] instanceof Date) ? r[0].getTime() : Date.parse(r[0]);
      if (!ts || ts < cutoff) return;
      if (r[3] === true || String(r[3]).toLowerCase() === 'true') return;
      out.failed++;
      var reason = String(r[7] || 'unknown error').slice(0, 70);
      tally[reason] = (tally[reason] || 0) + 1;
    });
    var best = 0;
    Object.keys(tally).forEach(function (k) { if (tally[k] > best) { best = tally[k]; out.topReason = k; } });
    if (best > 1) out.topReason = out.topReason + ' (×' + best + ')';
  } catch (e) { Logger.log('_tg5sDwmFailures_ skipped: ' + e.message); }
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
    if ((z.dueToday || 0) > 0 || (z.dueTomorrow || 0) > 0) {
      var dp = [];
      if ((z.dueToday || 0) > 0) dp.push('<b>' + z.dueToday + '</b> today');
      if ((z.dueTomorrow || 0) > 0) dp.push('<b>' + z.dueTomorrow + '</b> tomorrow');
      parts.push('🗓️ Due: ' + dp.join(', '));
    }
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
