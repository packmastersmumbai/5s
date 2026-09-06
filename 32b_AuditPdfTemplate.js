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
 *   - IBM Plex throughout: the family drawn for technical documentation, and
 *     the only one here with a matched Devanagari companion — so the Hindi line
 *     shares the Latin line's skeleton and weight instead of being a borrowed
 *     face sitting beside it. Condensed for data, Mono for identifiers.
 *   - Cool neutrals at one temperature; never #000. One accent per verdict.
 *   - Hairlines and negative space instead of boxes: five bordered meter tiles
 *     repeated the same frame five times across the page.
 */

/** Fonts and palette in one place so the whole document stays coherent. */
var APDF = {
  /* Cool neutral greys, one consistent temperature throughout — the previous
     warm-brown greys read as "document template" rather than as an instrument.
     Never pure black: 0E1116 keeps weight without the flatness #000 prints. */
  ink: '#0E1116',
  ink2: '#454C56',
  ink3: '#8A929E',
  paper: '#FFFFFF',
  rule: '#DDE1E6',
  ruleSoft: '#EEF0F2',
  /* Desaturated status colours. Print exaggerates saturation, and a report that
     shouts in three colours at once ranks nothing. */
  green: '#14683C',
  amber: '#9A6206',
  red: '#A32020',
  greenBg: '#F1F7F3',
  amberBg: '#FCF6EA',
  redBg: '#FBF0F0'
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
 * Shared document head: fonts, palette and the full stylesheet.
 *
 * All three reports (audit, Gemba walk, Kaizen) render through this so the
 * type system cannot drift between them — the whole point of picking one
 * family was that a plant sees one document, not three lookalikes.
 *
 * @param {string} accent    the verdict/status colour for this report
 * @param {string} accentBg  its tinted stock
 */
function _apdfHead_(accent, accentBg) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  /* IBM Plex: designed for technical documentation, and the only family here
     with a matched Devanagari companion — so the Hindi line shares the Latin
     line's skeleton, weight and rhythm instead of being a borrowed face sitting
     awkwardly beside it. Condensed carries the data; Mono carries identifiers,
     which is what a mono is actually for. */
  '<link href="https://fonts.googleapis.com/css2?' +
    'family=IBM+Plex+Sans:wght@400;450;600;700&' +
    'family=IBM+Plex+Sans+Condensed:wght@500;600;700&' +
    'family=IBM+Plex+Sans+Devanagari:wght@400;500&' +
    'family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">' +
  '<style>' +
  '@page { size: A4; margin: 14mm 13mm 16mm; }' +
  '* { box-sizing: border-box; }' +
  'body { margin:0; background:' + APDF.paper + '; color:' + APDF.ink + ';' +
    " font-family:'IBM Plex Sans',system-ui,sans-serif; font-size:9pt;" +
    ' line-height:1.45; -webkit-font-smoothing:antialiased; }' +
  // One class for every Hindi string, so the Devanagari never inherits a Latin face.
  ".hi { font-family:'IBM Plex Sans Devanagari','IBM Plex Sans',sans-serif; }" +
  // masthead
  /* The masthead is a nameplate, not a banner: a tight lockup on a single hard
     rule. Weight and letterspacing carry the hierarchy, not size. */
  '.mast { display:flex; align-items:baseline; justify-content:space-between;' +
    ' border-bottom:1.5pt solid ' + APDF.ink + '; padding-bottom:5px; }' +
  ".mast-l { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:700;" +
    ' font-size:15pt; letter-spacing:.01em; text-transform:uppercase; line-height:1; }' +
  '.mast-l i { font-style:normal; font-weight:500; color:' + APDF.ink3 + '; }' +
  ".mast-r { font-family:'IBM Plex Mono',monospace; font-weight:400; font-size:7pt;" +
    ' text-align:right; color:' + APDF.ink3 + '; letter-spacing:.04em; line-height:1.5; }' +
  // verdict
  /* No outline box. A 3pt bar on the left edge carries the verdict colour and
     the block sits on tinted stock — a boxed panel inside a bordered page just
     stacks frames. */
  '.vd { display:flex; align-items:stretch; margin-top:14px;' +
    ' border-left:3pt solid ' + accent + '; background:' + accentBg + '; }' +
  '.vd-s { flex:0 0 104px; text-align:center; padding:11px 6px 9px;' +
    ' border-right:1px solid ' + APDF.rule + '; }' +
  ".vd-n { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:38pt;" +
    ' line-height:.84; color:' + accent + '; letter-spacing:-.03em;' +
    ' font-feature-settings:\'tnum\' 1; }' +
  '.vd-n i { font-style:normal; font-size:14pt; font-weight:500; letter-spacing:0; }' +
  ".vd-l { font-family:'IBM Plex Mono',monospace; font-weight:400; font-size:6pt;" +
    ' letter-spacing:.16em; text-transform:uppercase; color:' + APDF.ink3 + '; margin-top:5px; }' +
  '.vd-b { flex:1; padding:11px 14px 10px; }' +
  ".vd-t { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:13pt;" +
    ' letter-spacing:.02em; text-transform:uppercase; color:' + accent + '; line-height:1.05; }' +
  '.vd-sub { font-size:8.5pt; color:' + APDF.ink2 + '; margin-top:2px; }' +
  /* A long auditor email crushed the last field into a two-line wrap. Fixed
     shares stop one value from starving its neighbours, and the email is
     allowed to break rather than push the row apart. */
  '.vd-f { display:flex; gap:16px; margin-top:9px; padding-top:8px;' +
    ' border-top:1px solid ' + APDF.rule + '; }' +
  '.vd-f > div { flex:1 1 0; min-width:0; }' +
  '.vd-f > div:first-child { flex:1.5 1 0; }' +
  ".vd-f b { display:block; font-family:'IBM Plex Mono',monospace; font-weight:400;" +
    ' font-size:5.8pt; letter-spacing:.14em; text-transform:uppercase;' +
    ' color:' + APDF.ink3 + '; margin-bottom:1px; }' +
  '.vd-f span { font-size:9pt; font-weight:450; word-break:break-word; }' +
  /* Meters: five boxed tiles became five columns divided by hairlines. Boxing
     each one repeated a frame five times across the page; a rule between them
     says the same thing with a tenth of the ink. Left-aligned so the pillar
     keys form a vertical reading edge instead of five floating centres. */
  '.mtrs { display:flex; margin-top:14px; border-top:1px solid ' + APDF.rule + ';' +
    ' border-bottom:1px solid ' + APDF.rule + '; }' +
  '.mtr { flex:1; padding:8px 10px 9px; }' +
  '.mtr + .mtr { border-left:1px solid ' + APDF.ruleSoft + '; }' +
  '.mtr-bar { margin-top:6px; font-size:8.5px; line-height:1; letter-spacing:-0.5px;' +
    ' white-space:nowrap; }' +
  '.mtr-bar .off { color:' + APDF.ruleSoft + '; }' +
  ".mtr-k { font-family:'IBM Plex Mono',monospace; font-weight:500; font-size:6.5pt;" +
    ' letter-spacing:.14em; color:' + APDF.ink3 + '; }' +
  ".mtr-n { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:8pt;" +
    ' text-transform:uppercase; letter-spacing:.03em; margin-top:2px; line-height:1.15; }' +
  ".mtr-hi { font-family:'IBM Plex Sans Devanagari',sans-serif; font-size:7pt;" +
    ' color:' + APDF.ink3 + '; line-height:1.3; }' +
  ".mtr-v { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:17pt;" +
    " line-height:1.1; margin-top:4px; letter-spacing:-.02em; font-feature-settings:'tnum' 1; }" +
  '.mtr-v i { font-style:normal; font-size:8pt; font-weight:500; letter-spacing:0; }' +
  // sections
  '.sec { margin-top:18px; }' +
  '.sec--break { page-break-before:auto; }' +
  /* A small, hard-set label on a hairline. The 2pt rule read as a divider
     competing with the masthead; a heading should mark a start, not shout. */
  ".sec-h { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:8.5pt;" +
    ' letter-spacing:.16em; text-transform:uppercase; margin:0 0 8px; padding-bottom:5px;' +
    ' border-bottom:1px solid ' + APDF.ink + '; display:flex; align-items:baseline; gap:8px; }' +
  '.sec-h--red { border-bottom-color:' + APDF.red + '; color:' + APDF.red + '; }' +
  ".sec-h-hi { font-family:'IBM Plex Sans Devanagari',sans-serif; font-weight:400; font-size:7.5pt;" +
    ' letter-spacing:0; text-transform:none; color:' + APDF.ink3 + '; }' +
  ".sec-h-n { margin-left:auto; font-family:'IBM Plex Mono',monospace; font-size:7.5pt;" +
    ' color:' + APDF.ink3 + '; letter-spacing:.04em; }' +
  // failures
  '.fail { display:flex; gap:11px; align-items:flex-start; padding:8px 10px; margin-bottom:3px;' +
    ' background:' + APDF.redBg + '; border-left:2.5pt solid ' + APDF.red + '; page-break-inside:avoid; }' +
  ".fail-sc { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:14pt;" +
    ' line-height:1.05; color:' + APDF.red + '; flex:0 0 auto; width:15px; text-align:center; }' +
  '.fail-b { flex:1; min-width:0; }' +
  '.fail-t { font-weight:600; font-size:9.5pt; line-height:1.3; }' +
  ".fail-hi { font-family:'IBM Plex Sans Devanagari',sans-serif; font-size:8pt;" +
    ' color:' + APDF.ink2 + '; line-height:1.45; }' +
  '.fail-r { font-size:8pt; color:' + APDF.ink2 + '; margin-top:3px;' +
    ' padding-left:7px; border-left:1px solid ' + APDF.rule + '; }' +
  ".fail-p { font-family:'IBM Plex Mono',monospace; font-size:7pt; letter-spacing:.08em;" +
    ' color:' + APDF.red + '; flex:0 0 auto; padding-top:3px; }' +
  // evidence
  '.ev { display:flex; flex-wrap:wrap; gap:10px; }' +
  '.ev-i { margin:0; width:calc(50% - 5px); page-break-inside:avoid; }' +
  '.ev-i img { width:100%; height:210px; object-fit:cover; display:block;' +
    ' border:1px solid ' + APDF.rule + '; }' +
  '.ev-i figcaption { display:flex; gap:7px; align-items:baseline; margin-top:5px; }' +
  ".ev-sc { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:10.5pt;" +
    ' flex:0 0 auto; line-height:1; }' +
  '.ev-t { font-size:8.5pt; line-height:1.35; color:' + APDF.ink2 + '; }' +
  // criteria table
  'table { width:100%; border-collapse:collapse; }' +
  "thead th { font-family:'IBM Plex Mono',monospace; font-weight:400; font-size:6.5pt;" +
    ' letter-spacing:.14em; text-transform:uppercase; color:' + APDF.ink3 + ';' +
    ' text-align:left; padding:0 7px 5px; border-bottom:1px solid ' + APDF.ink + '; }' +
  /* Hairline rules only, and the softer tone: 15 rows of full-strength rule
     turned the list into a ladder you read instead of the criteria. */
  'tbody td { padding:6px 7px; border-bottom:1px solid ' + APDF.ruleSoft + '; vertical-align:top; }' +
  'tbody tr { page-break-inside:avoid; }' +
  'tbody tr:last-child td { border-bottom:1px solid ' + APDF.rule + '; }' +
  ".c-n { width:20px; font-family:'IBM Plex Mono',monospace; font-size:7pt;" +
    ' color:' + APDF.ink3 + '; padding-top:7px; }' +
  '.c-en { display:block; font-size:9pt; line-height:1.35; font-weight:450; }' +
  ".c-hi { display:block; font-family:'IBM Plex Sans Devanagari',sans-serif; font-size:7.5pt;" +
    ' color:' + APDF.ink2 + '; line-height:1.5; }' +
  '.c-r { display:block; font-size:7.5pt; color:' + APDF.ink3 + '; margin-top:3px;' +
    ' padding-left:7px; border-left:1px solid ' + APDF.rule + '; }' +
  ".c-p { width:26px; font-family:'IBM Plex Mono',monospace; font-size:7pt;" +
    ' color:' + APDF.ink3 + '; padding-top:7px; }' +
  '.c-s { width:32px; text-align:right; }' +
  ".pip { font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:9.5pt;" +
    " display:inline-block; min-width:18px; padding:1px 0; text-align:center;" +
    " font-feature-settings:'tnum' 1; }" +
  '.pip.g { color:' + APDF.green + '; } .pip.a { color:' + APDF.amber + '; }' +
  /* Reversed white-on-red is the one place a fill is used in the table, and it
     works because the converter paints backgrounds behind glyphs. */
  '.pip.r { color:#fff; background:' + APDF.red + '; } .pip.na { color:' + APDF.ink3 + '; }' +
  // footer
  '.foot { margin-top:16px; padding-top:6px; border-top:1px solid ' + APDF.rule + ';' +
    " font-family:'IBM Plex Mono',monospace; font-weight:400; font-size:6.5pt;" +
    ' letter-spacing:.06em; text-transform:uppercase; color:' + APDF.ink3 + ';' +
    ' display:flex; justify-content:space-between; }' +
  '</style></head><body>';
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

  return _apdfHead_(band.c, band.bg) +

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
        '<div><b>Zone <span class="hi">/ ज़ोन</span></b><span>' + _apdfEsc_(h.zoneId) + ' — ' + _apdfEsc_(h.zoneName) + '</span></div>' +
        '<div><b>Date <span class="hi">/ दिनांक</span></b><span>' + _apdfEsc_(when) + '</span></div>' +
        '<div><b>Auditor <span class="hi">/ ऑडिटर</span></b><span>' + _apdfEsc_(h.auditor || '—') + '</span></div>' +
        '<div><b>Leader <span class="hi">/ लीडर</span></b><span>' + _apdfEsc_(zoneCfg.leader || '—') + '</span></div>' +
      '</div></div></div>' +

  '<div class="mtrs">' + meters + '</div>' +
  failBlock +
  evidence +

  '<section class="sec"><h2 class="sec-h">All criteria<span class="sec-h-hi">सभी मानदंड</span>' +
    '<span class="sec-h-n">' + items.length + '</span></h2>' +
    '<table><thead><tr><th></th><th>Criterion <span class="hi">/ मानदंड</span></th><th>Pillar</th>' +
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
