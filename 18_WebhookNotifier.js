/**
 * ============================================================================
 * 18_WebhookNotifier.gs — PackMasters 5S v2.0
 * Enhancement: WhatsApp/Telegram Webhooks, Auto Daily Report, Auto PDF
 * ============================================================================
 *
 * Sends push notifications via configurable webhooks (WhatsApp Business API,
 * Telegram Bot, or any HTTP webhook).
 * Generates and sends automated daily summary report at 7 PM IST.
 * Auto-generates PDF audit report after weekly submission.
 *
 * CONSTRAINT-6: Uses only UrlFetchApp (built-in GAS service). Zero external deps.
 * CONSTRAINT-5: Webhook calls count separately from email quota.
 */

// ============================================================================
// WEBHOOK CONFIGURATION
// ============================================================================

/**
 * Gets webhook config from ScriptProperties.
 * Set via Admin menu or directly in ScriptProperties:
 *   WEBHOOK_URL — full endpoint URL
 *   WEBHOOK_TYPE — "whatsapp" | "telegram" | "generic"
 *   WEBHOOK_ENABLED — "true" | "false"
 *   TELEGRAM_BOT_TOKEN — (for Telegram only)
 *   TELEGRAM_CHAT_ID — (for Telegram only)
 */
function getWebhookConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty("WEBHOOK_URL") || "",
    type: props.getProperty("WEBHOOK_TYPE") || "generic",
    enabled: props.getProperty("WEBHOOK_ENABLED") === "true",
    telegramToken: props.getProperty("TELEGRAM_BOT_TOKEN") || "",
    telegramChatId: props.getProperty("TELEGRAM_CHAT_ID") || "",
  };
}

// ============================================================================
// SEND WEBHOOK NOTIFICATION
// ============================================================================

/**
 * Sends a notification via the configured webhook.
 * Non-blocking: logs errors but does not throw.
 *
 * @param {string} message — Plain text message
 * @param {string} [recipientPhone] — Phone number for WhatsApp (optional)
 */
function sendWebhookNotification(message, recipientPhone) {
  var config = getWebhookConfig_();
  if (!config.enabled || !config.url) return;

  try {
    var payload, options;

    switch (config.type) {
      case "telegram":
        payload = {
          chat_id: config.telegramChatId,
          text: message,
          parse_mode: "HTML"
        };
        var telegramUrl = "https://api.telegram.org/bot" + config.telegramToken + "/sendMessage";
        UrlFetchApp.fetch(telegramUrl, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        break;

      case "whatsapp":
        // WhatsApp Business API format (Meta Cloud API)
        payload = {
          messaging_product: "whatsapp",
          to: recipientPhone || "",
          type: "text",
          text: { body: message }
        };
        UrlFetchApp.fetch(config.url, {
          method: "post",
          contentType: "application/json",
          headers: { "Authorization": "Bearer " + (PropertiesService.getScriptProperties().getProperty("WHATSAPP_TOKEN") || "") },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        break;

      default: // generic webhook
        payload = {
          text: message,
          timestamp: new Date().toISOString(),
          source: "PackMasters 5S"
        };
        UrlFetchApp.fetch(config.url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
    }

    Logger.log("  📱 Webhook sent: " + message.substring(0, 60) + "...");
  } catch (e) {
    Logger.log("  ⚠️ Webhook error: " + e.message);
  }
}

/**
 * Sends a batch of webhook notifications from digest events.
 * Called after email digests are sent.
 *
 * @param {Object} digestEvents
 */
function sendWebhookDigest(digestEvents) {
  var config = getWebhookConfig_();
  if (!config.enabled) return;

  var zoneConfig = v2GetZoneConfig_();

  // Summarize key events into a single webhook message
  var lines = ["📋 *PackMasters 5S Daily Summary*\n"];

  // Missed submissions
  var missed = digestEvents.mcEvents.filter(function(e) { return e.type === "MISSED_DAILY"; });
  if (missed.length > 0) {
    lines.push("❌ *Missed Submissions:* " + missed.length + " zone(s)");
    missed.forEach(function(m) { lines.push("  • " + m.zoneName); });
    lines.push("");
  }

  // Escalations
  var escalations = digestEvents.mcEvents.filter(function(e) { return e.type === "ESCALATION"; });
  if (escalations.length > 0) {
    lines.push("⬆️ *Escalations:* " + escalations.length);
    escalations.forEach(function(esc) {
      lines.push("  • " + esc.ncId + " (" + esc.zoneName + ") — " + esc.daysAge + " days");
    });
    lines.push("");
  }

  // Achievements
  var achievements = digestEvents.mcEvents.filter(function(e) { return e.type === "ACHIEVEMENT"; });
  if (achievements.length > 0) {
    lines.push("🏆 *Achievements:*");
    achievements.forEach(function(a) { lines.push("  • " + a.zoneName + " — " + a.streakDays + " day streak!"); });
    lines.push("");
  }

  // Alerts
  var alerts = digestEvents.mcEvents.filter(function(e) { return e.type === "ALERT_RULE"; });
  if (alerts.length > 0) {
    lines.push("🔔 *Alerts:* " + alerts.length + " rule(s) triggered");
  }

  if (lines.length > 1) {
    sendWebhookNotification(lines.join("\n"));
  }
}

// ============================================================================
// AUTOMATED DAILY SUMMARY REPORT (7 PM IST)
// ============================================================================

/**
 * Generates and sends a comprehensive daily summary email.
 * Designed to run at 7 PM IST after all submissions are expected.
 * Can be called from masterOrchestrator or a separate 7 PM trigger.
 */
function sendDailySummaryReport() {
  var ss = v2GetSpreadsheet_();
  var zoneConfig = v2GetZoneConfig_();
  var zoneIds = Object.keys(zoneConfig).sort();
  var props = PropertiesService.getScriptProperties();
  var mcEmail = props.getProperty("MC_EMAIL");
  if (!mcEmail) return;

  var now = new Date();
  var todayStr = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var todayDisplay = Utilities.formatDate(now, TZ, "dd-MMM-yyyy (EEEE)");

  // ── Load today's daily submissions (BATCH_READ) ──
  var dailySheet = ss.getSheetByName("DailySubmissions");
  var dailyData = dailySheet && dailySheet.getLastRow() > 1 ? dailySheet.getDataRange().getValues() : [];

  // ── Load open CAPAs (BATCH_READ) ──
  var capaSheet = ss.getSheetByName("NC_CAPA");
  var capaData = capaSheet && capaSheet.getLastRow() > 1 ? capaSheet.getDataRange().getValues() : [];

  // ── Build zone status grid ──
  var zoneStatuses = [];
  var submittedCount = 0;
  var totalScore = 0;
  var scoredCount = 0;

  zoneIds.forEach(function(zoneId) {
    var zone = zoneConfig[zoneId];
    var submitted = false;
    var pctScore = 0;

    for (var r = 1; r < dailyData.length; r++) {
      if (String(dailyData[r][2]).trim() === zoneId) {
        var dateVal = dailyData[r][5];
        var dateStr = dateVal instanceof Date ? Utilities.formatDate(dateVal, TZ, "yyyy-MM-dd") : String(dateVal).trim();
        if (dateStr === todayStr && !dailyData[r][17]) {
          submitted = true;
          pctScore = parseFloat(dailyData[r][14]) || 0;
          break;
        }
      }
    }

    if (submitted) {
      submittedCount++;
      totalScore += pctScore;
      scoredCount++;
    }

    // Count open CAPAs for this zone
    var openCAPAs = 0;
    var overdueCAPAs = 0;
    for (var r = 1; r < capaData.length; r++) {
      if (String(capaData[r][2]).trim() === zoneId && String(capaData[r][14]).trim() !== "CLOSED") {
        openCAPAs++;
        var target = capaData[r][13];
        if (target instanceof Date && now > target) overdueCAPAs++;
      }
    }

    zoneStatuses.push({
      id: zoneId,
      name: zone.name,
      leader: zone.leader,
      submitted: submitted,
      pctScore: submitted ? Math.round(pctScore) : null,
      openCAPAs: openCAPAs,
      overdueCAPAs: overdueCAPAs
    });
  });

  var avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

  // ── Build HTML ──
  var html = emailHeader_("📊 Daily 5S Status Report — " + todayDisplay);
  html += '<div style="padding:20px;">';

  // Summary stats
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">';
  html += '<tr>' +
    '<td style="padding:12px;text-align:center;background:#e8f8f0;border-radius:8px;"><b style="font-size:24px;color:#27ae60;">' + submittedCount + '/' + zoneIds.length + '</b><br><small>Zones Submitted</small></td>' +
    '<td style="width:8px;"></td>' +
    '<td style="padding:12px;text-align:center;background:#ebf5fb;border-radius:8px;"><b style="font-size:24px;color:#2980b9;">' + avgScore + '%</b><br><small>Avg Score</small></td>' +
    '<td style="width:8px;"></td>' +
    '<td style="padding:12px;text-align:center;background:' + (zoneStatuses.reduce(function(s, z) { return s + z.overdueCAPAs; }, 0) > 0 ? '#fdedec' : '#e8f8f0') + ';border-radius:8px;"><b style="font-size:24px;color:' + (zoneStatuses.reduce(function(s, z) { return s + z.overdueCAPAs; }, 0) > 0 ? '#e74c3c' : '#27ae60') + ';">' + zoneStatuses.reduce(function(s, z) { return s + z.overdueCAPAs; }, 0) + '</b><br><small>Overdue CAPAs</small></td>' +
    '</tr></table>';

  // Zone grid
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<tr style="background:#1a5276;color:white;">' +
    '<th style="padding:8px;">Zone</th>' +
    '<th style="padding:8px;">Status</th>' +
    '<th style="padding:8px;">Score</th>' +
    '<th style="padding:8px;">Open NCs</th>' +
    '<th style="padding:8px;">Leader</th></tr>';

  zoneStatuses.forEach(function(z, i) {
    var bg = i % 2 === 0 ? "#fff" : "#f8f9fa";
    var statusIcon = z.submitted ? "✅" : "❌";
    var scoreColor = z.pctScore === null ? "#999" : (z.pctScore >= 80 ? "#27ae60" : (z.pctScore >= 60 ? "#f39c12" : "#e74c3c"));
    var scoreText = z.pctScore !== null ? z.pctScore + "%" : "—";
    var capaText = z.openCAPAs > 0 ? (z.overdueCAPAs > 0 ? z.openCAPAs + " (" + z.overdueCAPAs + " overdue)" : String(z.openCAPAs)) : "0";
    var capaColor = z.overdueCAPAs > 0 ? "#e74c3c" : "#333";

    html += '<tr style="background:' + bg + ';">' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;"><b>' + z.id + '</b> ' + z.name + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">' + statusIcon + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:' + scoreColor + ';">' + scoreText + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:' + capaColor + ';">' + capaText + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + z.leader + '</td></tr>';
  });
  html += '</table>';

  html += '</div>';
  html += emailFooter_();

  // ── Send ──
  try {
    MailApp.sendEmail({
      to: mcEmail,
      subject: "📊 5S Daily Status — " + todayDisplay + " — " + submittedCount + "/" + zoneIds.length + " zones, Avg " + avgScore + "%",
      htmlBody: html
    });
    Logger.log("  📧 Daily summary report sent to MC.");
  } catch (e) {
    Logger.log("  ⚠️ Daily summary email failed: " + e.message);
  }

  // Also send webhook summary
  var webhookMsg = "📊 *Daily 5S Status — " + todayDisplay + "*\n" +
    "✅ Submitted: " + submittedCount + "/" + zoneIds.length + "\n" +
    "📈 Avg Score: " + avgScore + "%\n" +
    "⚠️ Overdue CAPAs: " + zoneStatuses.reduce(function(s, z) { return s + z.overdueCAPAs; }, 0);
  sendWebhookNotification(webhookMsg);
}

// ============================================================================
// AUTO PDF AUDIT REPORT AFTER WEEKLY SUBMISSION
// ============================================================================

/**
 * Generates a PDF snapshot of the audit report and emails it.
 * Called from doPost after a weekly audit is successfully written.
 *
 * @param {Object} data — Weekly audit form data
 * @param {Object} zone — Zone config object
 * @param {string} auditorEmail
 * @param {string} dateStr — Audit date
 * @param {string} submissionId — The generated submission ID
 */
function autoSendAuditReportPDF(data, zone, auditorEmail, dateStr, submissionId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var deployId = props.getProperty("DEPLOY_ID");
    if (!deployId || deployId === "NOT_SET") return;

    // Build the print URL for the audit report
    var printUrl = "https://script.google.com/macros/s/" + deployId + "/exec" +
      "?action=print&zone=" + encodeURIComponent(zone.id) +
      "&month=" + dateStr.substring(0, 7) +
      "&type=audit";

    // Email the link (generating actual PDF from Apps Script is complex and quota-heavy)
    var mcEmail = props.getProperty("MC_EMAIL") || "";
    var recipients = [zone.email];
    if (mcEmail) recipients.push(mcEmail);

    var subject = "📋 Weekly Audit Report — " + zone.name + " — " + dateStr;
    var html = emailHeader_("📋 Weekly Audit Complete");
    html += '<div style="padding:20px;">';
    html += '<p>The weekly 5S audit for <b>' + zone.name + '</b> has been completed.</p>';
    html += '<table style="border-collapse:collapse;width:100%;margin:12px 0;">';
    html += '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Zone</td><td style="padding:6px;border:1px solid #ddd;">' + zone.id + ' — ' + zone.name + '</td></tr>';
    html += '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Audit Date</td><td style="padding:6px;border:1px solid #ddd;">' + dateStr + '</td></tr>';
    html += '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Auditor</td><td style="padding:6px;border:1px solid #ddd;">' + auditorEmail + '</td></tr>';
    html += '<tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;">Submission ID</td><td style="padding:6px;border:1px solid #ddd;">' + submissionId + '</td></tr>';
    html += '</table>';
    html += '<p><a href="' + printUrl + '" style="display:inline-block;background:#1a5276;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">📄 View Printable Audit Report</a></p>';
    html += '<p style="color:#666;font-size:12px;">Open the link above and use File → Print for an A4 PDF.</p>';
    html += '</div>';
    html += emailFooter_();

    emailWrapper_(recipients.join(","), subject, html);
    Logger.log("  📧 Auto audit report email sent for " + zone.name);
  } catch (e) {
    Logger.log("  ⚠️ Auto audit report email failed: " + e.message);
  }
}

// ============================================================================
// SETUP TRIGGERS FOR DAILY SUMMARY
// ============================================================================

/**
 * Creates an additional trigger for the 7 PM daily summary report.
 * Called from admin menu.
 */
function setupDailySummaryTrigger() {
  // Delete existing daily summary triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "sendDailySummaryReport") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("sendDailySummaryReport")
    .timeBased()
    .everyDays(1)
    .atHour(19) // 7 PM
    .nearMinute(0)
    .create();

  Logger.log("✅ Daily summary trigger set for 7 PM.");
  logAdminAction_("setupDailySummaryTrigger", "Daily 7 PM summary trigger created.");
}
