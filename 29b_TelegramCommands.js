// ============================================================================
// 29b_TelegramCommands.js — PackMasters 5S Telegram command map
// ----------------------------------------------------------------------------
// Transport (send/reply/poll/enable) lives in the shared 29_TelegramLib.js.
// This file declares WHICH commands 5S answers and reads the sheets to build
// the replies. Column indices mirror sendDailySummaryReport (18_WebhookNotifier).
//
// Config: reuses the existing ScriptProperties keys TELEGRAM_BOT_TOKEN /
// TELEGRAM_CHAT_ID (TelegramLib resolves those aliases automatically).
//
// Commands: /status  /zones  /capas  /help
// ============================================================================

var TELEGRAM_COMMANDS = {
  '/status':     function () { return _tg5sStatus_(); },
  '/summary':    function () { return _tg5sStatus_(); },
  '/zones':      function () { return _tg5sZones_(); },
  '/capas':      function () { return _tg5sCapas_(); },
  '/pending':    function () { return _tg5sPending_(); },
  '/register':   function (arg, chatId) { return tg5sRegister_(arg, chatId); },
  '/unregister': function (arg, chatId) { return tg5sUnregister_(arg, chatId); },
  '/start':      function () { return _tg5sWelcome_(); },
  '/help':       function () { return _tg5sHelp_(); }
};

// One-shot credential setup — writes the bot token + channel ID into
// ScriptProperties. Channel: "PM 5s SQDCP" (-1004336498836), bot @PM5sBot.
// SECURITY: never commit the real token. Paste it into BOT_TOKEN below in the
// Apps Script editor, run once, then clear it again. (Prod token already lives
// in ScriptProperties, so this only needs re-running if the token is rotated.)
function setTelegramCredentials_5s() {
  var BOT_TOKEN = '';  // paste bot token here to (re)set; leave empty otherwise
  if (!BOT_TOKEN) { SpreadsheetApp.getUi().alert('Paste the bot token into BOT_TOKEN first (see editor).'); return; }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
  props.setProperty('TELEGRAM_CHAT_ID', '-1004336498836');
  SpreadsheetApp.getUi().alert('Telegram credentials saved (bot @PM5sBot → channel PM 5s SQDCP).');
}

// Admin-menu wrappers (added to 04_AdminUtils onOpen menu).
function enableTelegramBot_5s()  { return TelegramLib.enable(); }
function disableTelegramBot_5s() { return TelegramLib.disable(); }
function sendTelegramTest_5s() {
  var ok = TelegramLib.send('✅ 5S Telegram test — bot is connected.');
  SpreadsheetApp.getUi().alert(ok ? 'Test message sent.' : 'Send failed — check token/chat ID in ScriptProperties.');
}

// Openable zone link: tappable in Telegram, opens the Zone Landing Page (?zone=<id>).
// Falls back to bold text if the deploy URL isn't available.
function _tg5sZoneLink_(zoneId) {
  var id = String(zoneId || '').trim();
  if (!id) return '';
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!base) return '<b>' + TelegramLib.esc(id) + '</b>';
  return '<a href="' + base + '?zone=' + encodeURIComponent(id) + '">' + TelegramLib.esc(id) + '</a>';
}

// ── Shared data loader (one batch read of the zone grid) ────────────────────
function _tg5sZoneGrid_() {
  var ss = v2GetSpreadsheet_();
  var zoneConfig = v2GetZoneConfig_();
  var zoneIds = Object.keys(zoneConfig).sort();
  var now = new Date();
  var todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');

  var dailySheet = ss.getSheetByName('DailySubmissions');
  var dailyData = dailySheet && dailySheet.getLastRow() > 1 ? dailySheet.getDataRange().getValues() : [];
  var capaSheet = ss.getSheetByName('NC_CAPA');
  var capaData = capaSheet && capaSheet.getLastRow() > 1 ? capaSheet.getDataRange().getValues() : [];

  return zoneIds.map(function (zoneId) {
    var zone = zoneConfig[zoneId];
    var submitted = false, pctScore = 0;
    for (var r = 1; r < dailyData.length; r++) {
      if (String(dailyData[r][2]).trim() === zoneId) {
        var dv = dailyData[r][5];
        var ds = dv instanceof Date ? Utilities.formatDate(dv, TZ, 'yyyy-MM-dd') : String(dv).trim();
        if (ds === todayStr && !dailyData[r][17]) { submitted = true; pctScore = parseFloat(dailyData[r][14]) || 0; break; }
      }
    }
    var openCAPAs = 0, overdueCAPAs = 0;
    for (var c = 1; c < capaData.length; c++) {
      if (String(capaData[c][2]).trim() === zoneId && String(capaData[c][14]).trim() !== 'CLOSED') {
        openCAPAs++;
        var target = capaData[c][13];
        if (target instanceof Date && now > target) overdueCAPAs++;
      }
    }
    return {
      id: zoneId, name: zone.name, leader: zone.leader,
      submitted: submitted, pctScore: submitted ? Math.round(pctScore) : null,
      openCAPAs: openCAPAs, overdueCAPAs: overdueCAPAs
    };
  });
}

// ── Command builders (return HTML strings) ──────────────────────────────────
function _tg5sStatus_() {
  var grid = _tg5sZoneGrid_();
  var submitted = grid.filter(function (z) { return z.submitted; });
  var scored = submitted.filter(function (z) { return z.pctScore !== null; });
  var avg = scored.length ? Math.round(scored.reduce(function (s, z) { return s + z.pctScore; }, 0) / scored.length) : 0;
  var overdue = grid.reduce(function (s, z) { return s + z.overdueCAPAs; }, 0);
  var openCapa = grid.reduce(function (s, z) { return s + z.openCAPAs; }, 0);
  var todayDisplay = Utilities.formatDate(new Date(), TZ, 'dd-MMM-yyyy (EEE)');
  return '📊 <b>5S Status — ' + todayDisplay + '</b>\n' +
    '✅ Submitted: <b>' + submitted.length + '</b> / ' + grid.length + '\n' +
    '📈 Avg Score: <b>' + avg + '%</b>\n' +
    '📋 Open CAPAs: <b>' + openCapa + '</b>   ⚠️ Overdue: <b>' + overdue + '</b>';
}

function _tg5sZones_() {
  var grid = _tg5sZoneGrid_();
  if (!grid.length) return 'No zones configured.';
  var lines = grid.map(function (z) {
    var icon = z.submitted ? '🟢' : '🔴';
    var score = z.pctScore !== null ? z.pctScore + '%' : '—';
    return icon + ' ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name) +
      ' — ' + score + (z.openCAPAs ? ' · ' + z.openCAPAs + ' NC' + (z.overdueCAPAs ? ' (' + z.overdueCAPAs + ' overdue)' : '') : '');
  });
  return '<b>Zones today (' + grid.length + ')</b>\n' + lines.join('\n');
}

function _tg5sCapas_() {
  var grid = _tg5sZoneGrid_().filter(function (z) { return z.openCAPAs > 0; })
    .sort(function (a, b) { return b.overdueCAPAs - a.overdueCAPAs || b.openCAPAs - a.openCAPAs; });
  if (!grid.length) return '🎉 No open CAPAs.';
  var lines = grid.map(function (z) {
    return (z.overdueCAPAs ? '🔴' : '🟠') + ' ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name) + ' — ' +
      z.openCAPAs + ' open' + (z.overdueCAPAs ? ', ' + z.overdueCAPAs + ' overdue' : '');
  });
  var totOpen = grid.reduce(function (s, z) { return s + z.openCAPAs; }, 0);
  var totOver = grid.reduce(function (s, z) { return s + z.overdueCAPAs; }, 0);
  return '<b>Open CAPAs — ' + totOpen + ' (' + totOver + ' overdue)</b>\n' + lines.join('\n');
}

function _tg5sPending_() {
  var pending = _tg5sZoneGrid_().filter(function (z) { return !z.submitted; });
  if (!pending.length) return '🎉 All zones have submitted today.';
  var lines = pending.map(function (z) {
    return '🔴 ' + _tg5sZoneLink_(z.id) + ' ' + TelegramLib.esc(z.name) +
      (z.openCAPAs ? ' · ' + z.openCAPAs + ' open NC' : '');
  });
  return '<b>Not submitted today (' + pending.length + ')</b>\n' + lines.join('\n');
}

function _tg5sWelcome_() {
  return '👋 <b>Welcome to the PackMasters 5S Bot</b>\n' +
    'Your assistant for daily 5S audits, NCs and zone status.\n\n' +
    '📊 <b>Check status:</b> /status · /zones · /pending · /capas\n' +
    '🔔 <b>Get personal reminders:</b> send <b>/register &lt;ZONE&gt;</b> (e.g. /register Z-07)\n' +
    'and I\'ll DM you when your zone\'s audit is pending or an NC is overdue.\n\n' +
    'Type /help for the full command list.';
}

function _tg5sHelp_() {
  return '🤖 <b>PackMasters 5S Bot</b>\n' +
    '/status — today\'s submission &amp; score summary\n' +
    '/zones — per-zone status grid\n' +
    '/pending — zones not yet submitted today\n' +
    '/capas — open &amp; overdue CAPAs\n' +
    '/register &lt;ZONE&gt; — get DM reminders for a zone (e.g. /register Z-07)\n' +
    '/unregister — stop DM reminders';
}
