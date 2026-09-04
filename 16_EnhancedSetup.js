/**
 * ============================================================================
 * 16_EnhancedSetup.gs — PackMasters 5S v2.0
 * Enhancement: Extended Sheet Definitions, 6S Config, Setup Wizard Support
 * ============================================================================
 *
 * Adds new sheets for: AlertRules, EscalationConfig, RedTagRegister,
 * KaizenSuggestions, TaskBoard, GembaWalks, GembaWalkConfig, MapConfig,
 * WDGLL_Library, TrainingLog, SkillsMatrix
 *
 * CONSTRAINT-7: All new features are config-driven via sheets.
 * CONSTRAINT-1: All reads use batch getDataRange().getValues()
 */

// ============================================================================
// ENHANCED SHEET DEFINITIONS
// ============================================================================

function getEnhancedSheetDefinitions_() {
  return [
    {
      name: "AlertRules",
      namedRange: "Alert_Rules",
      type: "config",
      headers: [
        "rule_id", "enabled", "zone_scope", "metric", "operator", "threshold",
        "action", "recipient", "cooldown_hours", "last_triggered", "description"
      ]
    },
    {
      name: "EscalationConfig",
      namedRange: "Escalation_Config",
      type: "config",
      headers: [
        "level", "days_after_creation", "action", "notify_role", "notify_email_override",
        "email_subject_template", "auto_status_change", "description"
      ]
    },
    {
      name: "RedTagRegister",
      namedRange: "RedTag_Data",
      type: "operational",
      headers: [
        "tag_id", "created_date", "zone_id", "zone_name", "item_description",
        "item_category", "estimated_value", "proposed_action", "photo_url",
        "photo_file_id", "tagged_by", "owner", "disposition_deadline",
        "actual_disposition", "disposition_date", "disposed_by",
        "after_photo_url", "status", "remarks"
      ]
    },
    {
      name: "KaizenSuggestions",
      namedRange: "Kaizen_Data",
      type: "operational",
      headers: [
        "kaizen_id", "created_date", "zone_id", "zone_name", "submitter_name",
        "category", "title", "description", "photo_url", "expected_benefit",
        "estimated_savings", "status", "reviewer", "review_date", "review_remarks",
        "assigned_to", "target_date", "completion_date", "actual_savings",
        "implementation_notes", "benefit_verified_by", "verification_date"
      ]
    },
    {
      name: "TaskBoard",
      namedRange: "Task_Data",
      type: "operational",
      headers: [
        "task_id", "created_date", "zone_id", "zone_name", "title",
        "description", "category", "priority", "source", "source_ref_id",
        "assigned_to", "due_date", "status", "status_updated_at",
        "completed_date", "completed_by", "remarks", "photo_url"
      ]
    },
    {
      name: "GembaWalkConfig",
      namedRange: "GembaWalk_Config",
      type: "config",
      headers: [
        "walk_type", "question_id", "question_text", "question_text_hi",
        "category", "response_type", "required", "sort_order"
      ]
    },
    {
      name: "GembaWalks",
      namedRange: "GembaWalk_Data",
      type: "operational",
      headers: [
        "walk_id", "timestamp", "walk_type", "walker_name", "walker_email",
        "zone_id", "zone_name", "responses_json", "observations",
        "action_items_json", "photo_urls", "total_questions", "yes_count",
        "no_count", "na_count", "compliance_pct"
      ]
    },
    {
      name: "MapConfig",
      namedRange: "Map_Config",
      type: "config",
      headers: [
        "zone_id", "polygon_points", "label_x", "label_y", "sub_zones_json",
        "floor_plan_url", "last_updated"
      ]
    },
    {
      name: "WDGLL_Library",
      namedRange: "WDGLL_Data",
      type: "config",
      headers: [
        "wdgll_id", "zone_id", "criterion_id", "photo_url", "photo_file_id",
        "description", "uploaded_by", "uploaded_date", "is_active"
      ]
    },
    {
      name: "TrainingLog",
      namedRange: "Training_Data",
      type: "operational",
      headers: [
        "record_id", "worker_name", "worker_email", "zone_id", "topic",
        "pillar", "status", "trained_date", "certified_date", "expiry_date",
        "trainer_name", "sop_drive_url", "remarks"
      ]
    },
    {
      name: "HandoverLog",
      namedRange: "Handover_Data",
      type: "operational",
      headers: [
        "handover_id", "timestamp", "zone_id", "zone_name", "from_shift",
        "to_shift", "handover_by", "handover_email", "key_notes",
        "safety_concerns", "pending_tasks", "equipment_status", "photo_urls", "status"
      ]
    },
    {
      name: "ErrorLog",
      namedRange: "Error_Log",
      type: "audit",
      headers: [
        "timestamp", "context", "error_message", "severity", "stack_trace",
        "user_email"
      ]
    }
  ];
}

/**
 * Creates all v2 enhancement sheets. Safe to run multiple times.
 * Called from the enhanced admin menu.
 */
function createEnhancedSheets() {
  var ss = v2GetSpreadsheet_();
  var definitions = getEnhancedSheetDefinitions_();

  Logger.log("🔧 Creating v2 enhancement sheets...");

  definitions.forEach(function(def) {
    createSheet_(ss, def.name, def.headers);
  });

  // Set up Named Ranges for new sheets
  setupEnhancedNamedRanges_(ss, definitions);

  // Populate default configs
  populateDefaultAlertRules_(ss);
  populateDefaultEscalationConfig_(ss);
  populateDefaultGembaWalkConfig_(ss);

  // Update ScriptProperties with new config
  refreshEnhancedConfig_();

  // Plan E: Create AuditTrail sheet for ISO compliance
  if (typeof createAuditTrailSheet_ === "function") {
    try {
      createAuditTrailSheet_();
    } catch (e) {
      Logger.log("AuditTrail sheet creation skipped: " + e.message);
    }
  }

  Logger.log("✅ All v2 enhancement sheets created.");
  ss.toast("Enhancement sheets created successfully!", "V2 Setup", 5);
}

// ============================================================================
// NAMED RANGES FOR NEW SHEETS
// ============================================================================

function setupEnhancedNamedRanges_(ss, definitions) {
  definitions.forEach(function(def) {
    if (!def.namedRange) return;
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) return;

    // Remove existing
    var existing = ss.getNamedRanges();
    existing.forEach(function(nr) {
      if (nr.getName() === def.namedRange) nr.remove();
    });

    var range = sheet.getRange(1, 1, 10000, def.headers.length);
    ss.setNamedRange(def.namedRange, range);
    Logger.log("  📌 Named Range '" + def.namedRange + "' → '" + def.name + "'");
  });
}

// ============================================================================
// DEFAULT CONFIGURATION POPULATION
// ============================================================================

function populateDefaultAlertRules_(ss) {
  var sheet = ss.getSheetByName("AlertRules");
  if (!sheet || sheet.getLastRow() > 1) return;

  var rules = [
    ["AR-001", true, "all", "daily_score_pct", "<", 60, "email", "zone_leader", 24, "", "Alert zone leader when daily score drops below 60%"],
    ["AR-002", true, "all", "nc_age_days", ">", 14, "email", "mc", 48, "", "Escalate NCs older than 14 days to MC"],
    ["AR-003", true, "all", "missed_consecutive", ">", 2, "email", "zone_leader,mc", 24, "", "Alert when zone misses 3+ consecutive daily submissions"],
    ["AR-004", true, "all", "weekly_score_drop_pct", ">", 20, "email", "mc", 168, "", "Alert MC when weekly score drops more than 20% from 4-week avg"],
    ["AR-005", true, "all", "weekly_score_jump_pct", ">", 40, "email", "mc", 168, "", "Flag potential fraud: score jumps more than 40% in one week"],
    ["AR-006", true, "all", "streak_high_days", ">=", 20, "email", "zone_leader,mc", 168, "", "Celebrate zones maintaining ≥90% for 20+ working days"],
    ["AR-007", true, "all", "capa_overdue_count", ">", 0, "email", "zone_leader", 48, "", "Remind zone leader of overdue CAPAs"],
    ["AR-008", true, "all", "all_zones_submitted", "=", true, "email", "mc", 24, "", "Notify MC when all 8 zones submit daily on time"],
  ];

  if (rules.length > 0) {
    sheet.getRange(2, 1, rules.length, rules[0].length).setValues(rules);
    Logger.log("  ✅ AlertRules populated with " + rules.length + " default rules.");
  }
}

function populateDefaultEscalationConfig_(ss) {
  var sheet = ss.getSheetByName("EscalationConfig");
  if (!sheet || sheet.getLastRow() > 1) return;

  var levels = [
    [1, 0, "email", "zone_leader", "", "New NC Raised: {nc_id} in {zone_name}", "", "NC created — notify zone leader immediately"],
    [2, 3, "email", "zone_leader", "", "Reminder: NC {nc_id} awaiting root cause analysis", "", "Day 3 — no root cause entered yet"],
    [3, 7, "email", "mc", "", "Escalation: NC {nc_id} in {zone_name} — no action plan after 7 days", "", "Day 7 — escalate to MC"],
    [4, 14, "email", "top_mgmt", "", "Critical: NC {nc_id} not closed — 14 days overdue", "OVERDUE", "Day 14 — escalate to top management, auto-mark OVERDUE"],
    [5, 21, "email", "mc,top_mgmt", "", "CRITICAL: NC {nc_id} — 21 days, auto-flagged for MRM agenda", "CRITICAL", "Day 21 — add to MRM agenda, mark CRITICAL"],
  ];

  if (levels.length > 0) {
    sheet.getRange(2, 1, levels.length, levels[0].length).setValues(levels);
    Logger.log("  ✅ EscalationConfig populated with " + levels.length + " escalation levels.");
  }
}

function populateDefaultGembaWalkConfig_(ss) {
  var sheet = ss.getSheetByName("GembaWalkConfig");
  if (!sheet || sheet.getLastRow() > 1) return;

  var questions = [
    // Safety Walk
    ["Safety", "SW-01", "Are all workers wearing required PPE?", "क्या सभी कर्मचारी आवश्यक PPE पहने हैं?", "PPE", "yes_no", true, 1],
    ["Safety", "SW-02", "Are emergency exits clear and accessible?", "क्या आपातकालीन निकास साफ और सुलभ हैं?", "Emergency", "yes_no", true, 2],
    ["Safety", "SW-03", "Are fire extinguishers visible and within expiry?", "क्या अग्निशामक यंत्र दृश्यमान और वैधता के भीतर हैं?", "Fire Safety", "yes_no", true, 3],
    ["Safety", "SW-04", "Are hazard warning signs visible?", "क्या खतरे के चेतावनी संकेत दृश्यमान हैं?", "Signage", "yes_no", true, 4],
    ["Safety", "SW-05", "Any near-miss incidents reported this week?", "क्या इस सप्ताह कोई near-miss रिपोर्ट की गई?", "Reporting", "yes_no_na", false, 5],
    // Quality Walk
    ["Quality", "QW-01", "Are SOPs displayed at workstations?", "क्या कार्यस्थलों पर SOP प्रदर्शित हैं?", "Documentation", "yes_no", true, 1],
    ["Quality", "QW-02", "Is the inspection area clean and calibrated?", "क्या निरीक्षण क्षेत्र साफ और अंशांकित है?", "Calibration", "yes_no", true, 2],
    ["Quality", "QW-03", "Are reject bins labelled and segregated?", "क्या रिजेक्ट बिन लेबल और अलग हैं?", "Segregation", "yes_no", true, 3],
    ["Quality", "QW-04", "Is the FIFO system maintained for materials?", "क्या सामग्री के लिए FIFO प्रणाली बनाई रखी है?", "FIFO", "yes_no", true, 4],
    // Process Walk
    ["Process", "PW-01", "Is the production schedule visible?", "क्या उत्पादन अनुसूची दृश्यमान है?", "Planning", "yes_no", true, 1],
    ["Process", "PW-02", "Are machines running at standard cycle time?", "क्या मशीनें मानक चक्र समय पर चल रही हैं?", "Efficiency", "yes_no", true, 2],
    ["Process", "PW-03", "Is there visible WIP (Work In Progress) control?", "क्या WIP नियंत्रण दृश्यमान है?", "Flow", "yes_no", true, 3],
    ["Process", "PW-04", "Are changeover times tracked and displayed?", "क्या बदलाव समय ट्रैक और प्रदर्शित है?", "Changeover", "yes_no_na", false, 4],
    // Leadership Walk
    ["Leadership", "LW-01", "Did you speak with at least 3 operators?", "क्या आपने कम से कम 3 ऑपरेटरों से बात की?", "Engagement", "yes_no", true, 1],
    ["Leadership", "LW-02", "Are team performance boards updated?", "क्या टीम प्रदर्शन बोर्ड अपडेट हैं?", "Visual Mgmt", "yes_no", true, 2],
    ["Leadership", "LW-03", "Were previous action items followed up?", "क्या पिछले कार्य आइटम्स पर फॉलो-अप किया गया?", "Accountability", "yes_no", true, 3],
    ["Leadership", "LW-04", "Any improvement ideas suggested by workers?", "क्या कर्मचारियों ने कोई सुधार विचार सुझाए?", "Kaizen", "yes_no_na", false, 4],
  ];

  if (questions.length > 0) {
    sheet.getRange(2, 1, questions.length, questions[0].length).setValues(questions);
    Logger.log("  ✅ GembaWalkConfig populated with " + questions.length + " questions.");
  }
}

// ============================================================================
// ENHANCED CONFIG REFRESH
// ============================================================================

function refreshEnhancedConfig_() {
  var props = PropertiesService.getScriptProperties();
  var ss = v2GetSpreadsheet_();

  // Read AlertRules
  var alertSheet = ss.getSheetByName("AlertRules");
  if (alertSheet && alertSheet.getLastRow() > 1) {
    var alertData = alertSheet.getDataRange().getValues();
    var rules = [];
    for (var r = 1; r < alertData.length; r++) {
      if (alertData[r][0]) {
        rules.push({
          id: String(alertData[r][0]),
          enabled: alertData[r][1] === true || alertData[r][1] === "TRUE",
          zoneScope: String(alertData[r][2]),
          metric: String(alertData[r][3]),
          operator: String(alertData[r][4]),
          threshold: alertData[r][5],
          action: String(alertData[r][6]),
          recipient: String(alertData[r][7]),
          cooldownHours: parseInt(alertData[r][8], 10) || 24,
          lastTriggered: alertData[r][9] || "",
          description: String(alertData[r][10] || "")
        });
      }
    }
    props.setProperty("ALERT_RULES", JSON.stringify(rules));
  }

  // Read EscalationConfig
  var escSheet = ss.getSheetByName("EscalationConfig");
  if (escSheet && escSheet.getLastRow() > 1) {
    var escData = escSheet.getDataRange().getValues();
    var levels = [];
    for (var r = 1; r < escData.length; r++) {
      if (escData[r][0] !== "") {
        levels.push({
          level: parseInt(escData[r][0], 10),
          daysAfter: parseInt(escData[r][1], 10),
          action: String(escData[r][2]),
          notifyRole: String(escData[r][3]),
          notifyEmailOverride: String(escData[r][4] || ""),
          subjectTemplate: String(escData[r][5] || ""),
          autoStatusChange: String(escData[r][6] || ""),
          description: String(escData[r][7] || "")
        });
      }
    }
    props.setProperty("ESCALATION_CONFIG", JSON.stringify(levels));
  }

  // Read GembaWalkConfig
  var gembaSheet = ss.getSheetByName("GembaWalkConfig");
  if (gembaSheet && gembaSheet.getLastRow() > 1) {
    var gembaData = gembaSheet.getDataRange().getValues();
    var walkConfig = {};
    for (var r = 1; r < gembaData.length; r++) {
      var walkType = String(gembaData[r][0]).trim();
      if (!walkType) continue;
      if (!walkConfig[walkType]) walkConfig[walkType] = [];
      walkConfig[walkType].push({
        questionId: String(gembaData[r][1]),
        text: String(gembaData[r][2]),
        textHi: String(gembaData[r][3] || ""),
        category: String(gembaData[r][4] || ""),
        responseType: String(gembaData[r][5] || "yes_no"),
        required: gembaData[r][6] === true || gembaData[r][6] === "TRUE",
        sortOrder: parseInt(gembaData[r][7], 10) || 0
      });
    }
    props.setProperty("GEMBA_WALK_CONFIG", JSON.stringify(walkConfig));
  }

  logAdminAction_("refreshEnhancedConfig", "V2 enhanced config refreshed.");
}

// ============================================================================
// 6S SAFETY CRITERIA (Config-Only Addition)
// ============================================================================

/**
 * Adds Safety (S6) criteria to the ChecklistSchema sheet.
 * Call once, then refreshConfig to activate.
 */
function add6SSafetyCriteria() {
  var ss = v2GetSpreadsheet_();
  var sheet = ss.getSheetByName("ChecklistSchema");
  if (!sheet) {
    Logger.log("ChecklistSchema sheet not found.");
    return;
  }

  var safetyCriteria = [
    ["S6-C1", "S6", "PPE compliance verified", "PPE अनुपालन सत्यापित", 4],
    ["S6-C2", "S6", "Hazard identification & reporting up to date", "खतरे की पहचान और रिपोर्टिंग अद्यतन", 4],
    ["S6-C3", "S6", "Near-miss log reviewed & actions taken", "Near-miss लॉग की समीक्षा और कार्रवाई", 4],
    ["S6-C4", "S6", "Emergency equipment checked & accessible", "आपातकालीन उपकरण जांचे और सुलभ", 4],
  ];

  // Check if S6 criteria already exist
  var data = sheet.getDataRange().getValues();
  var hasS6 = false;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][1]).trim() === "S6") { hasS6 = true; break; }
  }

  if (hasS6) {
    Logger.log("S6 Safety criteria already exist. Skipping.");
    v2GetSpreadsheet_().toast("S6 Safety criteria already present.", "6S", 3);
    return;
  }

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, safetyCriteria.length, 5).setValues(safetyCriteria);

  // Also update pillarNames in default schema
  var props = PropertiesService.getScriptProperties();
  var schema = JSON.parse(props.getProperty("CHECKLIST_SCHEMA") || "{}");
  if (schema.pillarNames) {
    schema.pillarNames["S6"] = { en: "Safety (Anzen)", hi: "सुरक्षा (अन्ज़ेन)" };
    if (schema.pillars && schema.pillars.indexOf("S6") === -1) {
      schema.pillars.push("S6");
    }
    props.setProperty("CHECKLIST_SCHEMA", JSON.stringify(schema));
  }

  refreshConfig();
  logAdminAction_("add6SSafetyCriteria", "Added 4 Safety (S6) criteria. Total criteria now: " + (lastRow - 1 + 4));
  v2GetSpreadsheet_().toast("6S Safety criteria added! Run 'Refresh Config' to activate.", "6S Added", 5);
}

// ============================================================================
// ID GENERATORS
// ============================================================================

// PREFIX-YYMMDD-### — short, date-scannable, unique-per-record.
// ponytail: 3-digit random suffix, ~1/1000 same-day collision ceiling. If two
// records ever share an id, widen the suffix (4 digits / base36 seconds-of-day).
function shortId_(prefix) {
  return prefix + "-" + Utilities.formatDate(new Date(), TZ, "yyMMdd") +
    "-" + ("00" + Math.floor(Math.random() * 1000)).slice(-3);
}

function generateRedTagId_() { return shortId_("RT"); }
function generateKaizenId_()  { return shortId_("KZ"); }
function generateTaskId_()    { return shortId_("TK"); }
function generateWalkId_()    { return shortId_("GW"); }
function generateWDGLLId_()   { return shortId_("WD"); }
