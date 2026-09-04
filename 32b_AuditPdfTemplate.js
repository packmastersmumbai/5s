/**
 * 32b_AuditPdfTemplate.js — HTML/CSS audit report, rendered straight to PDF.
 *
 * WHY THIS REPLACES THE SHEET-BASED SLIP
 * The old report was a Google Sheet styled to look like a document and exported
 * with fitw=true. Everything fought the grid: one column width had to serve the
 * criterion text, the pillar scorecard and the photo at once, so a 200pt photo
 * meant a 132pt remark column; row heights leaked between runs; the identity
 * labels printed as "Zon"/"Aud"; and =IMAGE() raced the export and left "[1]"
 * placeholders. None of those are layout mistakes — they are what a spreadsheet
 * does when asked to be a document.
 *
 * Utilities.newBlob(html).getAs('application/pdf') renders real CSS (verified:
 * @page, web fonts, flexbox, grid, borders, Devanagari, remote <img>), so the
 * report is now typeset instead of tabulated.
 *
 * DESIGN — industrial control document, not a business report.
 * This is printed and read on a factory floor, so it reads like an
 * instrument panel: a heavy score block you can judge across a room, pillar
 * meters that show shortfall as a bar rather than only a number, failures given
 * the most space because they are the reason the report exists, and evidence
 * printed large enough to actually examine.
 *   - Oswald (condensed grotesque) for data and headings: industrial signage.
 *   - Source Serif for the criterion text: long bilingual lines need a serif.
 *   - Ink on paper stock (#12100E on #FAF8F5), one accent per verdict band.
 *   - A 4px rule under the masthead and hairlines elsewhere; no boxed-in cells.
 */

/** Fonts and palette in one place so the whole document stays coherent. */
var APDF = {
  ink: '#12100E',
  ink2: '#4A443C',
  ink3: '#8A8175',
  paper: '#FAF8F5',
  rule: '#DDD6CB',
  green: '#1F6F43',
  amber: '#B4690E',
  red: '#A81E1E',
  greenBg: '#E9F3EC',
  amberBg: '#FBF1E0',
  redBg: '#F9E9E9'
};

/** Verdict band: the one colour that carries the report's judgement. */
function _apdfBand_(pct) {
  if (pct >= 90) return { c: APDF.green, bg: APDF.greenBg, t: 'EXCELLENT', s: 'Sustain the standard' };
  if (pct >= 80) return { c: APDF.green, bg: APDF.greenBg, t: 'GOOD', s: 'Minor gaps to close' };
  if (pct >= 60) return { c: APDF.amber, bg: APDF.amberBg, t: 'NEEDS IMPROVEMENT', s: 'Act on the items below' };
  return { c: APDF.red, bg: APDF.redBg, t: 'CRITICAL', s: 'Immediate corrective action required' };
}

function _apdfScoreColour_(pct) {
  return pct >= 80 ? APDF.green : pct >= 60 ? APDF.amber : APDF.red;
}

/** HTML-escape. Every value below is operator-entered text. */
function _apdfEsc_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Full report as an HTML string.
 * @param {Object} detail   getAuditDetail() result
 * @param {Object} zoneCfg  zone config row (leader, etc.)
 * @param {number} overall  overall %
 * @param {Object} byPillar { S1: {sum, n}, ... }
 * @param {number} ncCount  criteria scoring 0-1
 */
function buildAuditReportHtml_(detail, zoneCfg, overall, byPillar, ncCount) {
  var tz = (typeof TZ !== 'undefined' && TZ) ? TZ : (Session.getScriptTimeZone() || 'Asia/Kolkata');
  var band = _apdfBand_(overall);
  var h = detail.header || {};
  var items = detail.items || [];
  var when = h.timestamp
    ? Utilities.formatDate(new Date(h.timestamp), tz, 'dd MMM yyyy · HH:mm') : '—';
  var generated = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm');

  var PN = { S1: 'Sort', S2: 'Set in Order', S3: 'Shine', S4: 'Standardise', S5: 'Sustain' };
  var PHI = { S1: 'छाँटो', S2: 'व्यवस्थित', S3: 'चमकाओ', S4: 'मानक', S5: 'बनाए रखो' };

  var fails = items.filter(function (it) { return it.score != null && it.score <= 1; });
  var withPhoto = items.filter(function (it) {
    return (it.photoUrls && it.photoUrls.length) || it.photoUrl;
  });

  // ── pillar meters ────────────────────────────────────────────────────────
  /* Each pillar is a fill bar plus its number: a shortfall reads as a gap in
     the bar before anyone parses the digits, which is the point of a meter. */
  /* The PDF converter drops background-colour on EMPTY elements — verified:
     div+span, nested div and table-cell fills all rendered as nothing, which is
     why the first attempt at these meters printed blank. Backgrounds only paint
     behind actual glyphs. So the bar is drawn with U+2588 FULL BLOCK characters,
     which do render: twelve cells, filled proportionally. */
  function meterBar(pct, col) {
    var CELLS = 12;
    var on = pct == null ? 0 : Math.round(pct / 100 * CELLS);
    var block = '█';
    var filled = '', empty = '';
    for (var i = 0; i < on; i++) filled += block;
    for (var j = on; j < CELLS; j++) empty += block;
    return '<div class="mtr-bar">' +
      (filled ? '<span style="color:' + col + '">' + filled + '</span>' : '') +
      (empty ? '<span class="off">' + empty + '</span>' : '') +
      '</div>';
  }
  var meters = ['S1', 'S2', 'S3', 'S4', 'S5'].map(function (pk) {
    var b = byPillar[pk];
    var pct = b ? Math.round(100 * b.sum / (4 * b.n)) : null;
    var col = pct == null ? APDF.ink3 : _apdfScoreColour_(pct);
    return '<div class="mtr">' +
      '<div class="mtr-k">' + pk + '</div>' +
      '<div class="mtr-n">' + PN[pk] + '</div>' +
      '<div class="mtr-hi">' + PHI[pk] + '</div>' +
      '<div class="mtr-v" style="color:' + col + '">' + (pct == null ? '—' : pct + '<i>%</i>') + '</div>' +
      meterBar(pct, col) +
      '</div>';
  }).join('');

  // ── failures ─────────────────────────────────────────────────────────────
  var failBlock = '';
  if (fails.length) {
    failBlock =
      '<section class="sec">' +
        '<h2 class="sec-h sec-h--red">Action required' +
          '<span class="sec-h-hi">कार्रवाई ज़रूरी</span>' +
          '<span class="sec-h-n">' + fails.length + '</span>' +
        '</h2>' +
        '<div class="fails">' +
        fails.map(function (it) {
          return '<div class="fail">' +
            '<div class="fail-sc">' + it.score + '</div>' +
            '<div class="fail-b">' +
              '<div class="fail-t">' + _apdfEsc_(it.label || it.criterionId) + '</div>' +
              (it.labelHi ? '<div class="fail-hi">' + _apdfEsc_(it.labelHi) + '</div>' : '') +
              (it.remark ? '<div class="fail-r">' + _apdfEsc_(it.remark) + '</div>' : '') +
            '</div>' +
            '<div class="fail-p">' + _apdfEsc_(it.pillar) + '</div>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</section>';
  }

  // ── evidence ─────────────────────────────────────────────────────────────
  var evidence = '';
  if (withPhoto.length) {
    evidence =
      '<section class="sec sec--break">' +
        '<h2 class="sec-h">Evidence<span class="sec-h-hi">प्रमाण</span>' +
          '<span class="sec-h-n">' + withPhoto.length + '</span></h2>' +
        '<div class="ev">' +
        withPhoto.map(function (it) {
          var urls = (it.photoUrls && it.photoUrls.length) ? it.photoUrls : [it.photoUrl];
          var sc = it.score == null ? '—' : it.score;
          var col = it.score == null ? APDF.ink3
            : it.score <= 1 ? APDF.red : it.score <= 2 ? APDF.amber : APDF.green;
          return urls.filter(Boolean).map(function (u) {
            return '<figure class="ev-i">' +
              '<img src="' + _apdfEsc_(u) + '">' +
              '<figcaption>' +
                '<span class="ev-sc" style="color:' + col + '">' + sc + '</span>' +
                '<span class="ev-t">' + _apdfEsc_(it.label || it.criterionId) + '</span>' +
              '</figcaption></figure>';
          }).join('');
        }).join('') +
        '</div>' +
      '</section>';
  }

  // ── full criteria list ───────────────────────────────────────────────────
  var rows = items.map(function (it, i) {
    var sc = it.score == null ? '—' : it.score;
    var cls = it.score == null ? 'na' : it.score <= 1 ? 'r' : it.score <= 2 ? 'a' : 'g';
    return '<tr>' +
      '<td class="c-n">' + (i + 1) + '</td>' +
      '<td class="c-t"><span class="c-en">' + _apdfEsc_(it.label || it.criterionId) + '</span>' +
        (it.labelHi ? '<span class="c-hi">' + _apdfEsc_(it.labelHi) + '</span>' : '') +
        (it.remark ? '<span class="c-r">' + _apdfEsc_(it.remark) + '</span>' : '') + '</td>' +
      '<td class="c-p">' + _apdfEsc_(it.pillar) + '</td>' +
      '<td class="c-s"><span class="pip ' + cls + '">' + sc + '</span></td>' +
    '</tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;500;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Noto+Sans+Devanagari:wght@400;600&display=swap" rel="stylesheet">' +
  '<style>' +
  '@page { size: A4; margin: 14mm 13mm 16mm; }' +
  '* { box-sizing: border-box; }' +
  'body { margin:0; background:' + APDF.paper + '; color:' + APDF.ink + ';' +
    " font-family:'Source Serif 4',Georgia,serif; font-size:9.5pt; line-height:1.45; }" +
  // masthead
  '.mast { display:flex; align-items:flex-end; justify-content:space-between;' +
    ' border-bottom:3px solid ' + APDF.ink + '; padding-bottom:6px; }' +
  ".mast-l { font-family:'Oswald',sans-serif; font-weight:700; font-size:19pt;" +
    ' letter-spacing:.02em; text-transform:uppercase; line-height:1; }' +
  '.mast-l i { font-style:normal; font-weight:300; color:' + APDF.ink3 + '; }' +
  ".mast-r { font-family:'Oswald',sans-serif; font-weight:300; font-size:8pt;" +
    ' text-align:right; color:' + APDF.ink2 + '; text-transform:uppercase; letter-spacing:.08em; }' +
  // verdict
  '.vd { display:flex; align-items:stretch; margin-top:12px; border:1px solid ' + APDF.rule + ';' +
    ' background:' + band.bg + '; }' +
  '.vd-s { flex:0 0 118px; text-align:center; padding:10px 4px 8px; border-right:1px solid ' + APDF.rule + '; }' +
  ".vd-n { font-family:'Oswald',sans-serif; font-weight:700; font-size:40pt; line-height:.86;" +
    ' color:' + band.c + '; letter-spacing:-.02em; }' +
  '.vd-n i { font-style:normal; font-size:17pt; font-weight:500; }' +
  ".vd-l { font-family:'Oswald',sans-serif; font-weight:500; font-size:6.5pt; letter-spacing:.14em;" +
    ' text-transform:uppercase; color:' + APDF.ink2 + '; margin-top:3px; }' +
  '.vd-b { flex:1; padding:10px 14px; }' +
  ".vd-t { font-family:'Oswald',sans-serif; font-weight:700; font-size:14pt; letter-spacing:.04em;" +
    ' text-transform:uppercase; color:' + band.c + '; line-height:1.1; }' +
  '.vd-sub { font-size:9pt; color:' + APDF.ink2 + '; margin-top:1px; }' +
  /* A long auditor email crushed the last field into a two-line wrap. Fixed
     shares stop one value from starving its neighbours, and the email is
     allowed to break rather than push the row apart. */
  '.vd-f { display:flex; gap:14px; margin-top:8px; padding-top:7px; border-top:1px solid ' + APDF.rule + '; }' +
  '.vd-f > div { flex:1 1 0; min-width:0; }' +
  '.vd-f > div:first-child { flex:1.5 1 0; }' +
  '.vd-f span { word-break:break-word; }' +
  ".vd-f b { display:block; font-family:'Oswald',sans-serif; font-weight:500; font-size:6.5pt;" +
    ' letter-spacing:.12em; text-transform:uppercase; color:' + APDF.ink3 + '; }' +
  '.vd-f span { font-size:9.5pt; }' +
  // meters
  '.mtrs { display:flex; gap:5px; margin-top:12px; }' +
  '.mtr { flex:1; border:1px solid ' + APDF.rule + '; padding:7px 6px 7px; text-align:center;' +
    ' background:#fff; }' +
  '.mtr-bar { margin-top:5px; font-size:9px; line-height:1; letter-spacing:-0.5px;' +
    ' white-space:nowrap; }' +
  '.mtr-bar .off { color:' + APDF.rule + '; }' +
  ".mtr-k { font-family:'Oswald',sans-serif; font-weight:700; font-size:8pt; letter-spacing:.1em;" +
    ' color:' + APDF.ink3 + '; }' +
  ".mtr-n { font-family:'Oswald',sans-serif; font-weight:500; font-size:8.5pt; text-transform:uppercase;" +
    ' letter-spacing:.02em; margin-top:1px; }' +
  ".mtr-hi { font-family:'Noto Sans Devanagari',sans-serif; font-size:7pt; color:" + APDF.ink3 + '; }' +
  ".mtr-v { font-family:'Oswald',sans-serif; font-weight:700; font-size:19pt; line-height:1.1; margin-top:2px; }" +
  '.mtr-v i { font-style:normal; font-size:9pt; font-weight:500; }' +
  // sections
  '.sec { margin-top:16px; }' +
  '.sec--break { page-break-before:auto; }' +
  ".sec-h { font-family:'Oswald',sans-serif; font-weight:500; font-size:10pt; letter-spacing:.12em;" +
    ' text-transform:uppercase; margin:0 0 7px; padding-bottom:4px;' +
    ' border-bottom:2px solid ' + APDF.ink + '; display:flex; align-items:baseline; gap:8px; }' +
  '.sec-h--red { border-bottom-color:' + APDF.red + '; color:' + APDF.red + '; }' +
  ".sec-h-hi { font-family:'Noto Sans Devanagari',sans-serif; font-weight:400; font-size:8pt;" +
    ' letter-spacing:0; color:' + APDF.ink3 + '; }' +
  '.sec-h-n { margin-left:auto; font-size:9pt; color:' + APDF.ink3 + '; letter-spacing:.06em; }' +
  // failures
  '.fail { display:flex; gap:10px; align-items:flex-start; padding:7px 9px; margin-bottom:4px;' +
    ' background:' + APDF.redBg + '; border-left:3px solid ' + APDF.red + '; page-break-inside:avoid; }' +
  ".fail-sc { font-family:'Oswald',sans-serif; font-weight:700; font-size:15pt; line-height:1;" +
    ' color:' + APDF.red + '; flex:0 0 auto; width:16px; text-align:center; }' +
  '.fail-b { flex:1; }' +
  '.fail-t { font-weight:600; font-size:10pt; line-height:1.25; }' +
  ".fail-hi { font-family:'Noto Sans Devanagari',sans-serif; font-size:8.5pt; color:" + APDF.ink2 + '; }' +
  '.fail-r { font-size:8.5pt; font-style:italic; color:' + APDF.ink2 + '; margin-top:2px; }' +
  ".fail-p { font-family:'Oswald',sans-serif; font-size:7.5pt; letter-spacing:.1em; color:" + APDF.red + ';' +
    ' flex:0 0 auto; padding-top:3px; }' +
  // evidence
  '.ev { display:flex; flex-wrap:wrap; gap:10px; }' +
  '.ev-i { margin:0; width:calc(50% - 5px); page-break-inside:avoid; }' +
  '.ev-i img { width:100%; height:210px; object-fit:cover; display:block;' +
    ' border:1px solid ' + APDF.rule + '; }' +
  '.ev-i figcaption { display:flex; gap:6px; align-items:baseline; margin-top:4px; }' +
  ".ev-sc { font-family:'Oswald',sans-serif; font-weight:700; font-size:11pt; flex:0 0 auto; }" +
  '.ev-t { font-size:9pt; line-height:1.3; color:' + APDF.ink2 + '; }' +
  // criteria table
  'table { width:100%; border-collapse:collapse; }' +
  'thead th { font-family:\'Oswald\',sans-serif; font-weight:500; font-size:7pt; letter-spacing:.12em;' +
    ' text-transform:uppercase; color:' + APDF.ink3 + '; text-align:left; padding:0 6px 4px;' +
    ' border-bottom:1px solid ' + APDF.ink + '; }' +
  'tbody td { padding:5px 6px; border-bottom:1px solid ' + APDF.rule + '; vertical-align:top; }' +
  'tbody tr { page-break-inside:avoid; }' +
  ".c-n { width:20px; font-family:'Oswald',sans-serif; font-size:8pt; color:" + APDF.ink3 + '; }' +
  '.c-en { display:block; font-size:9.5pt; line-height:1.3; }' +
  ".c-hi { display:block; font-family:'Noto Sans Devanagari',sans-serif; font-size:8pt; color:" + APDF.ink2 + '; }' +
  '.c-r { display:block; font-size:8pt; font-style:italic; color:' + APDF.ink3 + '; margin-top:1px; }' +
  ".c-p { width:26px; font-family:'Oswald',sans-serif; font-size:8pt; color:" + APDF.ink3 + '; }' +
  '.c-s { width:30px; text-align:right; }' +
  ".pip { font-family:'Oswald',sans-serif; font-weight:700; font-size:10pt; display:inline-block;" +
    ' min-width:19px; padding:1px 0; text-align:center; }' +
  '.pip.g { color:' + APDF.green + '; } .pip.a { color:' + APDF.amber + '; }' +
  '.pip.r { color:#fff; background:' + APDF.red + '; } .pip.na { color:' + APDF.ink3 + '; }' +
  // footer
  '.foot { margin-top:14px; padding-top:6px; border-top:1px solid ' + APDF.rule + ';' +
    " font-family:'Oswald',sans-serif; font-weight:300; font-size:7pt; letter-spacing:.08em;" +
    ' text-transform:uppercase; color:' + APDF.ink3 + '; display:flex; justify-content:space-between; }' +
  '</style></head><body>' +

  '<div class="mast"><div class="mast-l">Pack Masters <i>/ 5S Audit</i></div>' +
    '<div class="mast-r">FRM/5S/01<br>' + _apdfEsc_(h.zoneId || '') + '</div></div>' +

  '<div class="vd">' +
    '<div class="vd-s"><div class="vd-n">' + overall + '<i>%</i></div>' +
      '<div class="vd-l">Overall</div></div>' +
    '<div class="vd-b">' +
      '<div class="vd-t">' + band.t + '</div>' +
      '<div class="vd-sub">' + band.s + ' &middot; ' + ncCount +
        (ncCount === 1 ? ' non-conformity' : ' non-conformities') +
        ' &middot; ' + items.length + ' criteria</div>' +
      '<div class="vd-f">' +
        '<div><b>Zone / ज़ोन</b><span>' + _apdfEsc_(h.zoneId) + ' — ' + _apdfEsc_(h.zoneName) + '</span></div>' +
        '<div><b>Date / दिनांक</b><span>' + _apdfEsc_(when) + '</span></div>' +
        '<div><b>Auditor / ऑडिटर</b><span>' + _apdfEsc_(h.auditor || '—') + '</span></div>' +
        '<div><b>Leader / लीडर</b><span>' + _apdfEsc_(zoneCfg.leader || '—') + '</span></div>' +
      '</div></div></div>' +

  '<div class="mtrs">' + meters + '</div>' +
  failBlock +
  evidence +

  '<section class="sec"><h2 class="sec-h">All criteria<span class="sec-h-hi">सभी मानदंड</span>' +
    '<span class="sec-h-n">' + items.length + '</span></h2>' +
    '<table><thead><tr><th></th><th>Criterion / मानदंड</th><th>Pillar</th>' +
    '<th style="text-align:right">Score</th></tr></thead><tbody>' + rows + '</tbody></table></section>' +

  '<div class="foot"><span>Pack Masters 5S &middot; FRM/5S/01</span>' +
    '<span>Generated ' + _apdfEsc_(generated) + '</span></div>' +

  '</body></html>';
}

/** Renders the report HTML to a PDF blob. */
function buildAuditReportPdfBlob_(detail, zoneCfg, overall, byPillar, ncCount, name) {
  var html = buildAuditReportHtml_(detail, zoneCfg, overall, byPillar, ncCount);
  return Utilities.newBlob(html, 'text/html', name + '.html')
    .getAs('application/pdf').setName(name + '.pdf');
}
