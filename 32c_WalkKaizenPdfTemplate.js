/**
 * 32c_WalkKaizenPdfTemplate.js — Gemba walk and Kaizen reports as PDFs.
 *
 * Both render through _apdfHead_() in 32b_AuditPdfTemplate.js, so they inherit
 * the audit report's type system exactly: IBM Plex with its matched Devanagari,
 * cool neutrals at one temperature, hairlines instead of boxes. A plant should
 * see one document family, not three lookalikes.
 *
 * WHY THESE EXIST
 * Both record types were viewable on screen but had no printable output, so a
 * walk with five findings or a kaizen with a verified saving could not be taken
 * to a meeting, pinned on a board, or filed. The audit had a PDF; these did not.
 *
 * WHAT EACH ONE LEADS WITH
 *   Gemba  — compliance %, then the findings. A walk exists to record what
 *            failed, so failures are the body of the document and the passed
 *            checks are a quiet appendix.
 *   Kaizen — the money. An improvement is judged on delivered benefit, so
 *            estimated vs actual saving is the headline and the PDCA stages
 *            read as a timeline underneath.
 */

/** Compliance bands for a Gemba walk. Same shape as the audit's verdict band. */
function _walkBand_(pct, failCount) {
  if (failCount === 0) return { c: APDF.green, bg: APDF.greenBg, t: 'ALL CLEAR', s: 'Every check passed on this walk' };
  if (pct >= 90) return { c: APDF.green, bg: APDF.greenBg, t: 'GOOD', s: 'Minor gaps to close' };
  if (pct >= 70) return { c: APDF.amber, bg: APDF.amberBg, t: 'NEEDS ATTENTION', s: 'Act on the findings below' };
  return { c: APDF.red, bg: APDF.redBg, t: 'CRITICAL', s: 'Immediate corrective action required' };
}

/**
 * Kaizen stage band. A kaizen is not scored, so its accent comes from how far
 * through the loop it has travelled — an idea nobody has acted on and a
 * verified saving are not the same document.
 */
function _kaizenBand_(status) {
  var s = String(status || '').toUpperCase();
  if (s === 'BENEFIT_VERIFIED') return { c: APDF.green, bg: APDF.greenBg, t: 'BENEFIT VERIFIED', s: 'Saving confirmed and signed off' };
  if (s === 'COMPLETED') return { c: APDF.green, bg: APDF.greenBg, t: 'IMPLEMENTED', s: 'Awaiting benefit verification' };
  if (s === 'IMPLEMENTING') return { c: APDF.amber, bg: APDF.amberBg, t: 'IN PROGRESS', s: 'Implementation under way' };
  if (s === 'APPROVED') return { c: APDF.amber, bg: APDF.amberBg, t: 'APPROVED', s: 'Ready to implement' };
  if (s === 'REJECTED') return { c: APDF.red, bg: APDF.redBg, t: 'NOT TAKEN FORWARD', s: 'Reviewed and declined' };
  if (s === 'UNDER_REVIEW') return { c: APDF.ink2, bg: APDF.ruleSoft, t: 'UNDER REVIEW', s: 'Awaiting a decision' };
  return { c: APDF.ink2, bg: APDF.ruleSoft, t: 'SUBMITTED', s: 'Awaiting review' };
}

/** Indian-format rupees, or '' when there is no figure to show. */
function _apdfMoney_(v) {
  var n = Number(v);
  if (v === '' || v == null || isNaN(n) || n === 0) return '';
  return '₹' + n.toLocaleString('en-IN');
}

// ────────────────────────────────────────────────────────────────────────────
//  GEMBA WALK
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} rec  getPublicRecord('gemba', id) result — already carries
 *                      findings with question text, SQCDP leg and category.
 * @param {Object} raw  the GembaWalks row fields we need beyond that record.
 */
function buildWalkReportHtml_(rec, raw) {
  var tz = (typeof TZ !== 'undefined' && TZ) ? TZ : (Session.getScriptTimeZone() || 'Asia/Kolkata');
  var generated = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm');
  var findings = rec.findings || [];
  var fails = findings.filter(function (f) { return f.fail; });
  var passes = findings.filter(function (f) { return !f.fail; });
  var pct = Number(raw.compliancePct || 0);
  var band = _walkBand_(pct, fails.length);

  function fieldsRow() {
    var f = rec.fields || [];
    var pick = {};
    f.forEach(function (x) { pick[x.l] = x.v; });
    return '<div class="vd-f">' +
      '<div><b>Zone <span class="hi">/ ज़ोन</span></b><span>' +
        _apdfEsc_(rec.zone) + '</span></div>' +
      '<div><b>Walk type</b><span>' + _apdfEsc_(pick['Walk type'] || '—') + '</span></div>' +
      '<div><b>Date <span class="hi">/ दिनांक</span></b><span>' +
        _apdfEsc_(pick['Date'] || '—') + '</span></div>' +
      '<div><b>Walked by</b><span>' + _apdfEsc_(pick['Walked by'] || '—') + '</span></div>' +
      '</div>';
  }

  /* Findings carry their SQCDP leg and category, which is what routes a finding
     to the board the plant already reviews — so it prints, not just displays. */
  function findingRow(f) {
    var tag = [f.sqcdp ? 'SQCDP ' + f.sqcdp : '', f.category || ''].filter(Boolean).join(' · ');
    return '<div class="fail">' +
      '<div class="fail-sc">✗</div>' +
      '<div class="fail-b">' +
        '<div class="fail-t">' + _apdfEsc_(f.q) + '</div>' +
        (tag ? '<div class="fail-r">' + _apdfEsc_(tag) + '</div>' : '') +
      '</div></div>';
  }

  var failBlock = fails.length
    ? '<section class="sec"><h2 class="sec-h sec-h--red">Findings' +
        '<span class="sec-h-hi">निष्कर्ष</span>' +
        '<span class="sec-h-n">' + fails.length + '</span></h2>' +
        fails.map(findingRow).join('') + '</section>'
    : '<section class="sec"><h2 class="sec-h">Findings' +
        '<span class="sec-h-hi">निष्कर्ष</span>' +
        '<span class="sec-h-n">0</span></h2>' +
        '<p style="font-size:9pt;color:' + APDF.ink2 + ';margin:0">' +
        (findings.length
          ? 'Every check passed on this walk.'
          : 'Per-question answers were not recorded for this walk, so the individual ' +
            'checks cannot be shown. The counts above are what was saved.') +
        '</p></section>';

  // Actions raised — the point of walking is what gets fixed afterwards.
  var taskIds = rec.taskIds || [];
  var actions = taskIds.length
    ? '<section class="sec"><h2 class="sec-h">Actions raised' +
        '<span class="sec-h-n">' + taskIds.length + '</span></h2>' +
        '<p style="font-size:9pt;margin:0;font-family:\'IBM Plex Mono\',monospace">' +
        taskIds.map(_apdfEsc_).join(' &middot; ') + '</p></section>'
    : '';

  var passRows = passes.map(function (f, i) {
    return '<tr><td class="c-n">' + (i + 1) + '</td>' +
      '<td class="c-t"><span class="c-en">' + _apdfEsc_(f.q) + '</span></td>' +
      '<td class="c-p">' + _apdfEsc_(f.sqcdp || '') + '</td>' +
      '<td class="c-s"><span class="pip g">' + _apdfEsc_(f.a) + '</span></td></tr>';
  }).join('');

  var passBlock = passes.length
    ? '<section class="sec"><h2 class="sec-h">Checks passed' +
        '<span class="sec-h-n">' + passes.length + '</span></h2>' +
        '<table><thead><tr><th></th><th>Check</th><th>SQCDP</th>' +
        '<th style="text-align:right">Result</th></tr></thead><tbody>' +
        passRows + '</tbody></table></section>'
    : '';

  var obs = '';
  (rec.fields || []).forEach(function (x) {
    if (x.l === 'Observations' && x.v) {
      obs = '<section class="sec"><h2 class="sec-h">Observations' +
        '<span class="sec-h-hi">टिप्पणी</span></h2>' +
        '<p style="font-size:9pt;margin:0">' + _apdfEsc_(x.v) + '</p></section>';
    }
  });

  return _apdfHead_(band.c, band.bg) +
    '<div class="mast"><div class="mast-l">Pack Masters <i>/ Gemba Walk</i></div>' +
      '<div class="mast-r">FRM/5S/02<br>' + _apdfEsc_(rec.id) + '</div></div>' +

    '<div class="vd">' +
      '<div class="vd-s"><div class="vd-n">' + pct + '<i>%</i></div>' +
        '<div class="vd-l">Compliant</div></div>' +
      '<div class="vd-b">' +
        '<div class="vd-t">' + band.t + '</div>' +
        '<div class="vd-sub">' + band.s + ' &middot; ' + fails.length +
          (fails.length === 1 ? ' finding' : ' findings') + ' &middot; ' +
          (raw.totalQuestions || findings.length) + ' checks</div>' +
        fieldsRow() +
      '</div></div>' +

    failBlock + obs + actions + passBlock +

    '<div class="foot"><span>Pack Masters 5S &middot; FRM/5S/02</span>' +
      '<span>Generated ' + _apdfEsc_(generated) + '</span></div>' +
    '</body></html>';
}

// ────────────────────────────────────────────────────────────────────────────
//  KAIZEN
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} rec getPublicRecord('kaizen', id) result
 * @param {Object} raw the KaizenSuggestions row (savings, notes, dates)
 */
function buildKaizenReportHtml_(rec, raw) {
  var tz = (typeof TZ !== 'undefined' && TZ) ? TZ : (Session.getScriptTimeZone() || 'Asia/Kolkata');
  var generated = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm');
  var band = _kaizenBand_(raw.status);

  var est = _apdfMoney_(raw.estimatedSavings);
  var act = _apdfMoney_(raw.actualSavings);

  /* The headline number is the delivered saving where one exists, and the
     estimate only until then — an estimate shown as an achievement is how a
     suggestion scheme loses credibility. */
  var headline = act || est || '—';
  var headlineLabel = act ? 'Actual saving' : (est ? 'Estimated' : 'No figure');

  function pick(label) {
    var v = '';
    (rec.fields || []).forEach(function (x) { if (x.l === label) v = x.v; });
    return v;
  }

  var fieldsRow =
    '<div class="vd-f">' +
      '<div><b>Zone <span class="hi">/ ज़ोन</span></b><span>' +
        _apdfEsc_(rec.zone) + '</span></div>' +
      '<div><b>Suggested by</b><span>' + _apdfEsc_(pick('Suggested by') || '—') + '</span></div>' +
      '<div><b>Category</b><span>' + _apdfEsc_(pick('Category') || '—') + '</span></div>' +
      '<div><b>Submitted</b><span>' + _apdfEsc_(pick('Submitted') || '—') + '</span></div>' +
    '</div>';

  /* PDCA as a timeline. A kaizen sheet whose stages are a flat list of dates
     hides the thing a reviewer looks for: where it stalled. */
  var stages = [
    { k: 'Plan', label: 'Suggested', who: pick('Suggested by'), when: pick('Submitted') },
    { k: 'Do', label: 'Approved', who: pick('Reviewer'), when: pick('Target date') },
    { k: 'Check', label: 'Implemented', who: pick('Assigned to'), when: pick('Completed') },
    { k: 'Act', label: 'Benefit verified', who: raw.benefitVerifiedBy || '',
      when: raw.verificationDate || '' }
  ];
  var stageRows = stages.map(function (s) {
    var done = !!(s.when || s.who);
    return '<tr>' +
      '<td class="c-n">' + s.k + '</td>' +
      '<td class="c-t"><span class="c-en">' + _apdfEsc_(s.label) + '</span>' +
        (s.who ? '<span class="c-r">' + _apdfEsc_(s.who) + '</span>' : '') + '</td>' +
      /* nowrap and a wider column: the stage dates arrive from two different
         formatters upstream (yyyy-MM-dd and dd-MMM-yyyy), and the longer form
         broke across two lines, knocking its row out of alignment. */
      '<td class="c-s" style="width:88px;text-align:right;white-space:nowrap;' +
        'font-family:\'IBM Plex Mono\',monospace;' +
        'font-size:7.5pt;color:' + (done ? APDF.ink2 : APDF.ink3) + '">' +
        _apdfEsc_(s.when || '—') + '</td></tr>';
  }).join('');

  function para(label, hi, text) {
    if (!text) return '';
    return '<section class="sec"><h2 class="sec-h">' + label +
      (hi ? '<span class="sec-h-hi">' + hi + '</span>' : '') + '</h2>' +
      '<p style="font-size:9pt;margin:0">' + _apdfEsc_(text) + '</p></section>';
  }

  var money =
    '<div class="mtrs">' +
      '<div class="mtr"><div class="mtr-k">EST</div>' +
        '<div class="mtr-n">Estimated</div>' +
        '<div class="mtr-v" style="font-size:14pt;color:' + APDF.ink2 + '">' +
        (est || '—') + '</div></div>' +
      '<div class="mtr"><div class="mtr-k">ACT</div>' +
        '<div class="mtr-n">Actual</div>' +
        '<div class="mtr-v" style="font-size:14pt;color:' +
        (act ? APDF.green : APDF.ink3) + '">' + (act || '—') + '</div></div>' +
      '<div class="mtr"><div class="mtr-k">VERIFIED BY</div>' +
        '<div class="mtr-n" style="text-transform:none;font-weight:450">' +
        _apdfEsc_(raw.benefitVerifiedBy || '—') + '</div></div>' +
    '</div>';

  return _apdfHead_(band.c, band.bg) +
    '<div class="mast"><div class="mast-l">Pack Masters <i>/ Kaizen</i></div>' +
      '<div class="mast-r">FRM/5S/03<br>' + _apdfEsc_(rec.id) + '</div></div>' +

    '<div class="vd">' +
      '<div class="vd-s"><div class="vd-n" style="font-size:' +
        (headline.length > 7 ? '20pt' : '26pt') + '">' + _apdfEsc_(headline) + '</div>' +
        '<div class="vd-l">' + headlineLabel + '</div></div>' +
      '<div class="vd-b">' +
        '<div class="vd-t">' + band.t + '</div>' +
        '<div class="vd-sub">' + band.s + '</div>' +
        fieldsRow +
      '</div></div>' +

    '<section class="sec" style="margin-top:16px">' +
      '<h2 class="sec-h">' + _apdfEsc_(rec.title) + '</h2></section>' +

    para('The idea', 'सुझाव', pick('Idea')) +
    para('Expected benefit', '', pick('Expected benefit')) +
    para('Implementation notes', '', raw.implementationNotes) +

    '<section class="sec"><h2 class="sec-h">Benefit</h2></section>' + money +

    '<section class="sec"><h2 class="sec-h">PDCA</h2>' +
      '<table><tbody>' + stageRows + '</tbody></table></section>' +

    '<div class="foot"><span>Pack Masters 5S &middot; FRM/5S/03</span>' +
      '<span>Generated ' + _apdfEsc_(generated) + '</span></div>' +
    '</body></html>';
}

// ────────────────────────────────────────────────────────────────────────────
//  ENTRY POINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * PDF + WhatsApp link for a Gemba walk.
 * Always regenerates: unlike an audit, a walk's linked task list changes as the
 * actions it raised are worked, so a cached copy goes stale.
 */
function generateWalkPdf(walkId) {
  return v2SafeExecute_(function () {
    var rec = getPublicRecord('gemba', walkId);
    if (!rec) return { success: false, message: 'Walk not found: ' + walkId };

    var ss = v2GetSpreadsheet_(), sh = ss.getSheetByName('GembaWalks');
    var data = sh.getDataRange().getValues(), raw = {};
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][GW_COL.WALK_ID]).trim() !== walkId) continue;
      raw = {
        zoneId: String(data[r][GW_COL.ZONE_ID] || ''),
        compliancePct: data[r][GW_COL.COMPLIANCE_PCT] || 0,
        totalQuestions: data[r][GW_COL.TOTAL_Q] || 0
      };
      break;
    }

    var zoneCfg = (typeof getZoneConfig === 'function' ? getZoneConfig()[raw.zoneId] : null) || {};
    var name = 'Walk_' + walkId.replace(/[^A-Za-z0-9\-]/g, '');
    var pdfUrl = _apdfPublish_(zoneCfg.driveFolderId, name,
      buildWalkReportHtml_(rec, raw));

    return { success: true, pdfUrl: pdfUrl,
      waUrl: _apdfWhatsApp_('5S GEMBA WALK', rec, [
        ['Zone', rec.zone], ['Compliance', raw.compliancePct + '%'],
        ['Findings', String((rec.findings || []).filter(function (f) { return f.fail; }).length)]
      ], pdfUrl) };
  }, 'generateWalkPdf:' + walkId, { success: false, message: 'Could not generate walk PDF' });
}

/** PDF + WhatsApp link for a Kaizen. Always regenerates — the record evolves. */
function generateKaizenPdf(kaizenId) {
  return v2SafeExecute_(function () {
    var rec = getPublicRecord('kaizen', kaizenId);
    if (!rec) return { success: false, message: 'Kaizen not found: ' + kaizenId };

    var ss = v2GetSpreadsheet_(), sh = ss.getSheetByName('KaizenSuggestions');
    var data = sh.getDataRange().getValues(), raw = {};
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][KZ_COL.KAIZEN_ID]).trim() !== kaizenId) continue;
      raw = {
        zoneId: String(data[r][KZ_COL.ZONE_ID] || ''),
        status: String(data[r][KZ_COL.STATUS] || ''),
        estimatedSavings: data[r][KZ_COL.EST_SAVINGS],
        actualSavings: data[r][KZ_COL.ACTUAL_SAVINGS],
        implementationNotes: String(data[r][KZ_COL.IMPLEMENTATION_NOTES] || ''),
        benefitVerifiedBy: String(data[r][KZ_COL.BENEFIT_VERIFIED_BY] || ''),
        verificationDate: data[r][KZ_COL.VERIFICATION_DATE]
          ? v2FormatDate_(data[r][KZ_COL.VERIFICATION_DATE]) : ''
      };
      break;
    }

    var zoneCfg = (typeof getZoneConfig === 'function' ? getZoneConfig()[raw.zoneId] : null) || {};
    var name = 'Kaizen_' + kaizenId.replace(/[^A-Za-z0-9\-]/g, '');
    var pdfUrl = _apdfPublish_(zoneCfg.driveFolderId, name,
      buildKaizenReportHtml_(rec, raw));

    return { success: true, pdfUrl: pdfUrl,
      waUrl: _apdfWhatsApp_('5S KAIZEN', rec, [
        ['Zone', rec.zone], ['Status', raw.status],
        ['Saving', _apdfMoney_(raw.actualSavings) || _apdfMoney_(raw.estimatedSavings) || '-']
      ], pdfUrl) };
  }, 'generateKaizenPdf:' + kaizenId, { success: false, message: 'Could not generate kaizen PDF' });
}

/**
 * Render HTML to a PDF in the zone folder, replacing any previous copy.
 * Returns '' when the zone has no Drive folder configured, which is a config
 * gap rather than an error — the caller still gets success with no link.
 */
function _apdfPublish_(folderId, name, html) {
  if (!folderId) return '';
  try {
    var folder = DriveApp.getFolderById(folderId);
    var old = folder.getFilesByName(name + '.pdf');
    while (old.hasNext()) old.next().setTrashed(true);
    var blob = Utilities.newBlob(html, 'text/html', name + '.html')
      .getAs('application/pdf').setName(name + '.pdf');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/file/d/' + file.getId() + '/preview';
  } catch (e) {
    Logger.log('_apdfPublish_ failed for ' + name + ': ' + e.message);
    return '';
  }
}

/** wa.me deep link. Emoji-free: the existing audit link proved they mangle. */
function _apdfWhatsApp_(heading, rec, rows, pdfUrl) {
  var msg = '*' + heading + ' — PACK MASTERS*\n\n' +
    '*' + String(rec.title || '').replace(/\*/g, '') + '*\n' +
    rows.filter(function (r) { return r[1]; })
        .map(function (r) { return '*' + r[0] + ':* ' + r[1]; }).join('\n') +
    (pdfUrl ? '\n\nPDF: ' + pdfUrl : '') +
    '\n\n— PackMasters 5S';
  return 'https://wa.me/?text=' + encodeURIComponent(msg);
}
