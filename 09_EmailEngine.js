/**
 * ============================================================================
 * 09_EmailEngine.gs — PackMasters 5S Integrated System
 * Phase 3: Batched Email Digest Engine
 * ============================================================================
 *
 * CONSTRAINT-5: Never send per-event emails. All notifications batched
 * into per-role digest emails. Maximum 3 emails per trigger run:
 *   1. One per Zone Leader (only if they have events)
 *   2. One to MC (plant-wide summary)
 *   3. One to TOP_MGT (only if escalation events exist)
 *
 * Functions:
 *   sendDigestEmails(digestEvents)  — Master send function
 *   buildZLDigest_(zoneId, events)  — Builds ZL email HTML
 *   buildMCDigest_(events)          — Builds MC email HTML
 *   buildTopMgtDigest_(events)      — Builds TOP_MGT escalation email
 *   sendMRMDigest_(month, mrmData)  — Monthly MRM summary to TOP_MGT
 *   emailWrapper_(to, subject, html) — Safe email sender with quota check
 */

// ============================================================================
// MASTER DIGEST SENDER
// ============================================================================

/**
 * Sends batched digest emails based on accumulated events.
 * Called at the end of masterOrchestrator() every day.
 *
 * CONSTRAINT-5: Maximum 3 emails per run.
 *
 * @param {Object} digestEvents — Event accumulator from masterOrchestrator
 *   .zoneEvents: { "Z-01": [event, ...], ... }
 *   .mcEvents: [event, ...]
 *   .topMgtEvents: [event, ...]
 *   .errors: [string, ...]
 */
/**
 * Returns an address only if it is safe to send to.
 *
 * 01_Config.js seeds MC_EMAIL and TOP_EMAIL with @packmasters.in placeholders
 * and its own comment says to replace them before going live. They were not,
 * so the digest was mailing addresses nobody owns. Refusing to send is the
 * correct failure: a bounce is recoverable, delivering plant data to a stranger
 * is not.
 * @private
 */
function _digestAddress_(raw, key) {
  var v = String(raw || "").trim();
  if (!v) return "";
  if (/@packmasters\.in$/i.test(v)) {
    Logger.log("  ⚠ " + key + " is still the placeholder " + v +
               " — refusing to send. Set a real address in Settings.");
    return "";
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    Logger.log("  ⚠ " + key + " is not a valid address: " + v);
    return "";
  }
  return v;
}

function sendDigestEmails(digestEvents) {
  var props = PropertiesService.getScriptProperties();

  // Master switch, settable from Settings -> Notifications.
  if (props.getProperty("DIGEST_ENABLED") === "false") {
    Logger.log("  ⏸ Daily digest is disabled in Settings — nothing sent.");
    return;
  }

  var zoneConfig = getZoneConfig();
  var mcEmail = _digestAddress_(props.getProperty("MC_EMAIL"), "MC_EMAIL");
  var topEmail = _digestAddress_(props.getProperty("TOP_EMAIL"), "TOP_EMAIL");
  var emailCount = 0;

  // ── 1. Zone Leader Digests (one email per ZL with events) ──
  // Group events by ZL email (since multiple zones might share a ZL)
  var zlDigests = {};

  Object.keys(digestEvents.zoneEvents).forEach(function(zoneId) {
    var events = digestEvents.zoneEvents[zoneId];
    if (!events || events.length === 0) return;

    var zone = zoneConfig[zoneId];
    if (!zone) return;
    var zlEmail = _digestAddress_(zone.email, "zone " + zoneId + " email");
    if (!zlEmail) return;
    if (!zlDigests[zlEmail]) {
      zlDigests[zlEmail] = {
        zones: [],
        allEvents: []
      };
    }
    zlDigests[zlEmail].zones.push(zone);
    zlDigests[zlEmail].allEvents = zlDigests[zlEmail].allEvents.concat(
      events.map(function(e) { e._zoneName = zone.name; return e; })
    );
  });

  Object.keys(zlDigests).forEach(function(email) {
    var digest = zlDigests[email];
    var html = buildZLDigest_(digest.zones, digest.allEvents);
    var zoneNames = digest.zones.map(function(z) { return z.id; }).join(", ");

    if (emailWrapper_(email,
      "📋 PackMasters 5S Daily Digest — " + zoneNames,
      html)) {
      emailCount++;
    }
  });

  // ── 2. MC Digest (one email with plant-wide summary) ──
  if (mcEmail && (digestEvents.mcEvents.length > 0 || digestEvents.errors.length > 0)) {
    var mcHtml = buildMCDigest_(digestEvents.mcEvents, digestEvents.errors);
    if (emailWrapper_(mcEmail,
      "📊 PackMasters 5S Plant Digest — " + Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy"),
      mcHtml)) {
      emailCount++;
    }
  }

  // ── 3. TOP_MGT Escalation (only if there are escalation events) ──
  if (topEmail && digestEvents.topMgtEvents.length > 0) {
    var topHtml = buildTopMgtDigest_(digestEvents.topMgtEvents);
    if (emailWrapper_(topEmail,
      "🔴 PackMasters 5S — Escalation Alert",
      topHtml)) {
      emailCount++;
    }
  }

  Logger.log("  📧 Digest emails sent: " + emailCount);
}


// ============================================================================
// EMAIL BUILDERS
// ============================================================================

/**
 * Builds the Zone Leader daily digest email HTML.
 *
 * @param {Object[]} zones — Array of zone config objects for this ZL
 * @param {Object[]} events — All events for this ZL's zones
 * @returns {string} HTML email body
 * @private
 */
function buildZLDigest_(zones, events) {
  var dateStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy");
  var zoneNames = zones.map(function(z) { return z.name; }).join(", ");

  var html = emailHeader_("Daily Digest — Zone Leader");

  html += '<div style="padding:20px;">';
  html += '<p>Dear ' + zones[0].leader + ',</p>';
  html += '<p>Here is your daily 5S status update for <strong>' + dateStr + '</strong>.</p>';

  // Group events by type
  var missed = events.filter(function(e) { return e.type === "MISSED_DAILY"; });
  var overdue = events.filter(function(e) { return e.type === "NC_OVERDUE"; });

  // Missed submissions
  if (missed.length > 0) {
    html += '<div style="background:#fef9e7;border-left:4px solid #f39c12;padding:12px;margin:12px 0;border-radius:4px;">';
    html += '<h3 style="color:#f39c12;margin:0 0 8px;">⚠️ Missed Daily Submissions</h3>';
    missed.forEach(function(m) {
      html += '<p style="margin:4px 0;">• <strong>' + m.zoneName + '</strong> — No submission for ' + m.date + '</p>';
    });
    html += '</div>';
  }

  // Overdue NCs
  if (overdue.length > 0) {
    html += '<div style="background:#fdedec;border-left:4px solid #e74c3c;padding:12px;margin:12px 0;border-radius:4px;">';
    html += '<h3 style="color:#e74c3c;margin:0 0 8px;">🔴 Overdue Non-Conformances</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="background:#e74c3c;color:white;"><th style="padding:8px;text-align:left;">NC ID</th>' +
      '<th style="padding:8px;text-align:left;">Criterion</th>' +
      '<th style="padding:8px;text-align:center;">Days Overdue</th></tr>';
    overdue.forEach(function(o) {
      html += '<tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">' + o.ncId + '</td>' +
        '<td style="padding:8px;">' + o.criterionLabel + '</td>' +
        '<td style="padding:8px;text-align:center;color:#e74c3c;font-weight:bold;">' + o.daysOverdue + '</td></tr>';
    });
    html += '</table></div>';
  }

  if (missed.length === 0 && overdue.length === 0) {
    html += '<div style="background:#e8f8f0;border-left:4px solid #27ae60;padding:12px;margin:12px 0;border-radius:4px;">';
    html += '<h3 style="color:#27ae60;margin:0;">✅ All Clear</h3>';
    html += '<p>No action items for your zones today.</p>';
    html += '</div>';
  }

  html += '<p style="color:#666;font-size:12px;margin-top:20px;">Please submit today\'s checksheet before end of shift.</p>';
  html += '</div>';
  html += emailFooter_();

  return html;
}

/**
 * Builds the MC plant-wide daily digest email HTML.
 *
 * @param {Object[]} events — All plant-wide events
 * @param {string[]} errors — Any orchestrator errors
 * @returns {string} HTML email body
 * @private
 */
function buildMCDigest_(events, errors) {
  var dateStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy");

  var html = emailHeader_("Plant-Wide Daily Digest");
  html += '<div style="padding:20px;">';
  html += '<p>Dear Management Coordinator,</p>';
  html += '<p>Daily 5S system report for <strong>' + dateStr + '</strong>.</p>';

  // Summary counts
  var missed = events.filter(function(e) { return e.type === "MISSED_DAILY"; });
  var overdue = events.filter(function(e) { return e.type === "NC_OVERDUE"; });
  var repeats = events.filter(function(e) { return e.type === "REPEAT_NC"; });

  html += '<table style="width:100%;border-collapse:collapse;margin:16px 0;">';
  html += summaryTableRow_("📋 Missed Daily Submissions", missed.length, missed.length > 0 ? "#f39c12" : "#27ae60");
  html += summaryTableRow_("🔴 Overdue NCs", overdue.length, overdue.length > 0 ? "#e74c3c" : "#27ae60");
  html += summaryTableRow_("🔁 Repeat NCs (Escalated)", repeats.length, repeats.length > 0 ? "#e74c3c" : "#27ae60");
  html += summaryTableRow_("⚠️ System Errors", errors.length, errors.length > 0 ? "#e74c3c" : "#27ae60");
  html += '</table>';

  // Detailed missed submissions
  if (missed.length > 0) {
    html += '<h3 style="color:#f39c12;">Missed Submissions</h3>';
    html += '<ul style="font-size:13px;">';
    missed.forEach(function(m) {
      html += '<li>' + m.zoneId + ' — ' + m.zoneName + ' (' + m.leader + ')</li>';
    });
    html += '</ul>';
  }

  // Detailed overdue NCs
  if (overdue.length > 0) {
    html += '<h3 style="color:#e74c3c;">Overdue NCs</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="background:#333;color:white;">' +
      '<th style="padding:6px;">NC ID</th><th style="padding:6px;">Zone</th>' +
      '<th style="padding:6px;">Criterion</th><th style="padding:6px;">Days</th></tr>';
    overdue.forEach(function(o) {
      var color = o.daysOverdue > 14 ? '#e74c3c' : '#f39c12';
      html += '<tr style="border-bottom:1px solid #ddd;">' +
        '<td style="padding:6px;">' + o.ncId + '</td>' +
        '<td style="padding:6px;">' + o.zoneName + '</td>' +
        '<td style="padding:6px;">' + o.criterionLabel + '</td>' +
        '<td style="padding:6px;color:' + color + ';font-weight:bold;">' + o.daysOverdue + '</td></tr>';
    });
    html += '</table>';
  }

  // Repeat NCs
  if (repeats.length > 0) {
    html += '<h3 style="color:#c0392b;">🔁 Repeat Non-Conformances (Escalated to Top Management)</h3>';
    repeats.forEach(function(rep) {
      html += '<div style="background:#fdedec;padding:10px;margin:8px 0;border-radius:4px;font-size:13px;">';
      html += '<strong>' + rep.criterionId + '</strong> in <strong>' + rep.zoneName + '</strong>';
      html += ' — raised ' + rep.consecutiveMonths + ' consecutive months (' + rep.months.join(", ") + ')';
      html += '</div>';
    });
  }

  // Errors
  if (errors.length > 0) {
    html += '<h3 style="color:#e74c3c;">System Errors</h3>';
    html += '<pre style="background:#f5f5f5;padding:10px;font-size:11px;overflow:auto;">';
    errors.forEach(function(err) { html += err + '\n'; });
    html += '</pre>';
  }

  html += '</div>';
  html += emailFooter_();
  return html;
}

/**
 * Builds the Top Management escalation email HTML.
 *
 * @param {Object[]} events — Escalation events only
 * @returns {string} HTML email body
 * @private
 */
function buildTopMgtDigest_(events) {
  var html = emailHeader_("⚠️ Escalation Alert");
  html += '<div style="padding:20px;">';
  html += '<p>Dear Sir,</p>';
  html += '<p>The following 5S items require your attention:</p>';

  var overdue = events.filter(function(e) { return e.type === "NC_OVERDUE"; });
  var repeats = events.filter(function(e) { return e.type === "REPEAT_NC"; });

  if (overdue.length > 0) {
    html += '<h3 style="color:#e74c3c;">Severely Overdue NCs (>14 days)</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="background:#e74c3c;color:white;">' +
      '<th style="padding:8px;">NC ID</th><th style="padding:8px;">Zone</th>' +
      '<th style="padding:8px;">Issue</th><th style="padding:8px;">Days Overdue</th></tr>';
    overdue.forEach(function(o) {
      html += '<tr style="border-bottom:1px solid #ddd;">' +
        '<td style="padding:8px;">' + o.ncId + '</td>' +
        '<td style="padding:8px;">' + o.zoneName + '</td>' +
        '<td style="padding:8px;">' + o.criterionLabel + '</td>' +
        '<td style="padding:8px;font-weight:bold;color:#e74c3c;">' + o.daysOverdue + '</td></tr>';
    });
    html += '</table>';
  }

  if (repeats.length > 0) {
    html += '<h3 style="color:#c0392b;">🔁 Repeat Non-Conformances</h3>';
    html += '<p style="font-size:13px;">The following issues have recurred for 2+ consecutive months. Root Cause Analysis is mandatory.</p>';
    repeats.forEach(function(rep) {
      html += '<div style="background:#fdedec;border-left:4px solid #e74c3c;padding:12px;margin:8px 0;border-radius:4px;">';
      html += '<strong>' + rep.criterionId + '</strong>: ' + (rep.criterionLabel || '') + '<br>';
      html += 'Zone: <strong>' + rep.zoneName + '</strong><br>';
      html += 'Consecutive months: <strong>' + rep.consecutiveMonths + '</strong> (' + rep.months.join(", ") + ')';
      html += '</div>';
    });
  }

  html += '<p style="margin-top:20px;color:#666;font-size:12px;">This is an automated escalation from the PackMasters 5S IMS.</p>';
  html += '</div>';
  html += emailFooter_();
  return html;
}


// ============================================================================
// MRM MONTHLY DIGEST
// ============================================================================

/**
 * Sends the monthly Management Review Meeting summary to Top Management.
 * Called by monthlyRollup() on the 1st of each month.
 *
 * @param {string} month — Prior month string (yyyy-MM)
 * @param {Object[]} mrmData — Per-zone monthly aggregated data
 * @private
 */
function sendMRMDigest_(month, mrmData) {
  var topEmail = PropertiesService.getScriptProperties().getProperty("TOP_EMAIL");
  var mcEmail = PropertiesService.getScriptProperties().getProperty("MC_EMAIL");

  if (!topEmail && !mcEmail) {
    Logger.log("  ⚠️ No TOP_EMAIL or MC_EMAIL configured for MRM digest.");
    return;
  }

  var html = emailHeader_("Monthly MRM Summary — " + month);
  html += '<div style="padding:20px;">';
  html += '<p>Dear Sir,</p>';
  html += '<p>Please find the 5S performance summary for <strong>' + month + '</strong>.</p>';

  // Plant average
  var totalPct = 0;
  var totalNCs = 0;
  var totalClosed = 0;
  mrmData.forEach(function(z) {
    totalPct += z.pctAvg;
    totalNCs += z.ncCount;
    totalClosed += z.ncClosed;
  });
  var plantAvg = mrmData.length > 0 ? round2_(totalPct / mrmData.length) : 0;
  var closureRate = totalNCs > 0 ? round2_((totalClosed / totalNCs) * 100) : 100;

  // Plant summary card
  html += '<div style="background:' + (plantAvg >= 80 ? '#e8f8f0' : plantAvg >= 60 ? '#fef9e7' : '#fdedec') +
    ';padding:16px;border-radius:8px;text-align:center;margin:16px 0;">';
  html += '<div style="font-size:14px;color:#666;">Plant Average Score</div>';
  html += '<div style="font-size:36px;font-weight:800;color:' +
    (plantAvg >= 80 ? '#27ae60' : plantAvg >= 60 ? '#f39c12' : '#e74c3c') + ';">' + plantAvg + '%</div>';
  html += '<div style="font-size:12px;color:#999;">NCs: ' + totalNCs + ' raised, ' + totalClosed +
    ' closed (' + closureRate + '% closure rate)</div>';
  html += '</div>';

  // Zone-wise table
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;">';
  html += '<tr style="background:#1a5276;color:white;">' +
    '<th style="padding:8px;">Zone</th>' +
    '<th style="padding:8px;">S1</th><th style="padding:8px;">S2</th>' +
    '<th style="padding:8px;">S3</th><th style="padding:8px;">S4</th>' +
    '<th style="padding:8px;">S5</th><th style="padding:8px;">Avg %</th>' +
    '<th style="padding:8px;">NCs</th><th style="padding:8px;">Daily %</th></tr>';

  mrmData.forEach(function(z) {
    var rowColor = z.pctAvg >= 80 ? '#e8f8f0' : z.pctAvg >= 60 ? '#fef9e7' : '#fdedec';
    html += '<tr style="background:' + rowColor + ';border-bottom:1px solid #ddd;">' +
      '<td style="padding:6px;font-weight:bold;">' + z.zoneId + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.pillarAvgs.S1 + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.pillarAvgs.S2 + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.pillarAvgs.S3 + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.pillarAvgs.S4 + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.pillarAvgs.S5 + '</td>' +
      '<td style="padding:6px;text-align:center;font-weight:bold;">' + z.pctAvg + '%</td>' +
      '<td style="padding:6px;text-align:center;">' + z.ncCount + '</td>' +
      '<td style="padding:6px;text-align:center;">' + z.dailyRate + '%</td></tr>';
  });
  html += '</table>';

  html += '<p style="margin-top:20px;font-size:12px;color:#666;">' +
    'This report is auto-generated on the 1st of each month by the PackMasters 5S IMS.</p>';
  html += '</div>';
  html += emailFooter_();

  // Send to both Top Management and MC
  var recipients = [];
  if (topEmail) recipients.push(topEmail);
  if (mcEmail) recipients.push(mcEmail);

  emailWrapper_(
    recipients.join(","),
    "📊 PackMasters 5S — Monthly MRM Summary — " + month,
    html
  );
}


// ============================================================================
// EMAIL HELPERS
// ============================================================================

/**
 * Safe email sender with quota check.
 * @returns {boolean} true if sent successfully
 * @private
 */
function emailWrapper_(to, subject, htmlBody) {
  if (!to) {
    Logger.log("  ⚠️ No recipient for email: " + subject);
    return false;
  }

  try {
    var remaining = MailApp.getRemainingDailyQuota();
    if (remaining < 1) {
      Logger.log("  ⚠️ Email quota exhausted. Could not send: " + subject);
      return false;
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: htmlBody
    });

    Logger.log("  📧 Sent: " + subject + " → " + to);
    return true;

  } catch (e) {
    Logger.log("  ❌ Email error: " + e.message + " — " + subject);
    return false;
  }
}

/** Standard email header @private */
function emailHeader_(title) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
    '<div style="background:#1a5276;color:white;padding:20px;">' +
    '<h1 style="margin:0;font-size:20px;">PackMasters</h1>' +
    '<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">5S Integrated Management System</p>' +
    '<p style="margin:4px 0 0;font-size:14px;font-weight:bold;">' + title + '</p>' +
    '</div>';
}

/** Standard email footer @private */
function emailFooter_() {
  return '<div style="background:#f5f5f5;padding:12px 20px;font-size:11px;color:#999;text-align:center;">' +
    '© PackMasters | ZED-2 Compliant | ISO 9001:2015<br>' +
    'Auto-generated by 5S IMS — ' + Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy HH:mm") +
    '</div></div>';
}

/** Summary table row helper @private */
function summaryTableRow_(label, count, color) {
  return '<tr style="border-bottom:1px solid #eee;">' +
    '<td style="padding:10px;font-size:14px;">' + label + '</td>' +
    '<td style="padding:10px;text-align:right;font-size:18px;font-weight:bold;color:' + color + ';">' + count + '</td></tr>';
}
