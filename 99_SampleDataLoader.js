/**
 * ============================================================================
 * 99_SampleDataLoader.gs — PackMasters 5S
 * Loads realistic sample data into all sheets for testing.
 * Run: loadAllSampleData() from the Apps Script editor.
 * ============================================================================
 */

function loadAllSampleData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var resp = ui.alert(
    "Load Sample Data",
    "This will insert sample data into all sheets for testing.\nExisting data rows will NOT be deleted.\n\nContinue?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  _loadDailySubmissions(ss);
  _loadWeeklyAudit(ss);
  _loadNC_CAPA(ss);
  _loadSummary(ss);
  _loadRedTagRegister(ss);
  _loadKaizenSuggestions(ss);
  _loadTaskBoard(ss);
  _loadGembaWalks(ss);
  _loadHandoverLog(ss);
  _loadTrainingLog(ss);
  _loadAlertRules(ss);
  _loadEscalationConfig(ss);

  ui.alert("Sample Data Loaded",
    "Sample data has been inserted into all sheets.\n\n" +
    "You can now test the web app and all V2 features.",
    ui.ButtonSet.OK);
}

// ─── Helper: get or create sheet ───
function _getSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    Logger.log("⚠ Sheet not found: " + name + " — skipping.");
  }
  return sh;
}

// ─── Helper: date helpers ───
function _d(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}
function _ds(daysAgo) {
  return Utilities.formatDate(_d(daysAgo), "Asia/Kolkata", "yyyy-MM-dd");
}
function _ts(daysAgo) {
  return _d(daysAgo);
}

// ─── Zone info ───
var _ZONES = [
  { id: "Z-01", name: "Production Floor A", leader: "Mr. Anuj Pathak", dept: "Production & Ops" },
  { id: "Z-02", name: "Production Floor B", leader: "Mr. Rajesh Kumar", dept: "Production & Ops" },
  { id: "Z-03", name: "Raw Material Store", leader: "Mr. Suresh Yadav", dept: "Stores & Inventory" },
  { id: "Z-04", name: "Finished Goods Store", leader: "Mr. Vikram Singh", dept: "Stores & Inventory" },
  { id: "Z-05", name: "Quality Lab", leader: "Mr. Amit Sharma", dept: "Quality Assurance" },
  { id: "Z-06", name: "Maintenance Workshop", leader: "Mr. Deepak Joshi", dept: "Maintenance" },
  { id: "Z-07", name: "Office & Admin Area", leader: "Mr. Sanjay Gupta", dept: "Administration" },
  { id: "Z-08", name: "Dispatch & Loading Bay", leader: "Mr. Manoj Tiwari", dept: "Logistics" }
];

// ═══════════════════════════════════════════════════════
// DAILY SUBMISSIONS — 30 days of data for all 8 zones
// ═══════════════════════════════════════════════════════
function _loadDailySubmissions(ss) {
  var sh = _getSheet(ss, "DailySubmissions");
  if (!sh) return;
  var rows = [];
  for (var day = 1; day <= 30; day++) {
    _ZONES.forEach(function(z, idx) {
      // Skip some days randomly for realism (about 10% miss rate)
      if (day % 10 === idx % 10 && day > 3) return;
      var s1 = Math.round(2 + Math.random() * 2);
      var s2 = Math.round(2 + Math.random() * 2);
      var s3 = Math.round(1 + Math.random() * 3);
      var s4 = Math.round(2 + Math.random() * 2);
      var s5 = Math.round(1 + Math.random() * 3);
      var total = s1 + s2 + s3 + s4 + s5;
      var pct = Math.round(total / 20 * 100);
      rows.push([
        "DS-" + _ds(day).replace(/-/g, "") + "-" + z.id,  // submission_id
        _ts(day),                                            // timestamp
        z.id,                                                // zone_id
        z.name,                                              // zone_name
        z.leader,                                            // zone_leader
        _d(day),                                             // submission_date
        "daily",                                             // submission_type
        s1, s2, s3, s4, s5,                                  // s1-s5 scores
        total,                                               // total_pass
        20,                                                  // total_criteria
        pct,                                                 // pct_score
        day <= 3 ? "All areas inspected" : "",               // remarks
        "",                                                  // photo_url
        false                                                // is_duplicate
      ]);
    });
  }
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ DailySubmissions: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// WEEKLY AUDIT — 4 weeks for all 8 zones
// ═══════════════════════════════════════════════════════
function _loadWeeklyAudit(ss) {
  var sh = _getSheet(ss, "WeeklyAudit");
  if (!sh) return;
  var rows = [];
  for (var week = 0; week < 4; week++) {
    var dayOffset = week * 7 + 1;
    _ZONES.forEach(function(z) {
      var scores = [];
      var total = 0;
      // 20 criteria, score 1-4 each
      for (var c = 0; c < 20; c++) {
        var score = Math.round(1 + Math.random() * 3);
        scores.push(score);
        total += score;
      }
      var maxScore = 80;
      var pct = Math.round(total / maxScore * 100);
      var ncCount = scores.filter(function(s) { return s <= 1; }).length;
      var ncDetails = ncCount > 0 ? ncCount + " criteria scored 0-1" : "";

      var row = [
        "WA-" + _ds(dayOffset).replace(/-/g, "") + "-" + z.id,  // submission_id
        _ts(dayOffset),                                           // timestamp
        z.id,                                                     // zone_id
        z.name,                                                   // zone_name
        z.leader.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // auditor_email
        _d(dayOffset)                                             // audit_date
      ];
      // Append individual criterion scores
      row = row.concat(scores);
      row.push(total);      // total_score
      row.push(maxScore);   // max_score
      row.push(pct);        // pct_score
      row.push(ncCount);    // nc_count
      row.push(ncDetails);  // nc_details
      row.push("");         // photo_urls
      rows.push(row);
    });
  }
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ WeeklyAudit: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// NC_CAPA — 15 non-conformances across zones
// ═══════════════════════════════════════════════════════
function _loadNC_CAPA(ss) {
  var sh = _getSheet(ss, "NC_CAPA");
  if (!sh) return;
  var ncData = [
    { z: 0, crit: "S1-C1", label: "Unnecessary items removed", score: 1, cause: "Red tags not followed up", ca: "Weekly red tag review meeting", pa: "Assign red tag champion per zone", resp: "Mr. Anuj Pathak", days: 20, status: "OPEN" },
    { z: 1, crit: "S3-C1", label: "Work area clean", score: 0, cause: "Cleaning schedule not followed", ca: "Retrain cleaning crew", pa: "Daily cleaning checklist sign-off", resp: "Mr. Rajesh Kumar", days: 18, status: "OPEN" },
    { z: 2, crit: "S2-C3", label: "FIFO system maintained", score: 1, cause: "New stock placed in front of old", ca: "Rearrange stock per FIFO", pa: "FIFO date labels mandatory", resp: "Mr. Suresh Yadav", days: 15, status: "CLOSED" },
    { z: 3, crit: "S4-C1", label: "SOPs displayed at workstations", score: 1, cause: "SOPs outdated and removed during cleaning", ca: "Reprint and laminate all SOPs", pa: "SOP revision log", resp: "Mr. Vikram Singh", days: 14, status: "CLOSED" },
    { z: 4, crit: "S5-C1", label: "5S training records up to date", score: 0, cause: "New joiners not trained", ca: "Conduct 5S orientation for new staff", pa: "Mandatory 5S induction program", resp: "Mr. Amit Sharma", days: 12, status: "OPEN" },
    { z: 5, crit: "S3-C3", label: "Equipment clean and maintained", score: 1, cause: "No TPM schedule for lathes", ca: "Create TPM checklist for all machines", pa: "Weekly TPM review", resp: "Mr. Deepak Joshi", days: 10, status: "OPEN" },
    { z: 6, crit: "S2-C1", label: "Designated places for all items", score: 1, cause: "Files and stationery scattered", ca: "Label all cabinets and drawers", pa: "Office 5S champion assigned", resp: "Mr. Sanjay Gupta", days: 8, status: "CLOSED" },
    { z: 7, crit: "S1-C4", label: "Floor gangways clear and marked", score: 0, cause: "Dispatch boxes blocking walkway", ca: "Designated staging area for dispatch", pa: "Floor marking repaint", resp: "Mr. Manoj Tiwari", days: 7, status: "OPEN" },
    { z: 0, crit: "S4-C4", label: "Safety signage visible", score: 1, cause: "PPE signs faded", ca: "Replace all safety signs", pa: "Annual signage audit", resp: "Mr. Anuj Pathak", days: 5, status: "OPEN" },
    { z: 1, crit: "S5-C3", label: "Improvement suggestions submitted", score: 1, cause: "No kaizen suggestion box", ca: "Install digital kaizen board", pa: "Monthly kaizen contest", resp: "Mr. Rajesh Kumar", days: 4, status: "OPEN" },
    { z: 2, crit: "S3-C4", label: "Waste bins available and labelled", score: 1, cause: "Bins full, no segregation", ca: "Add color-coded bins", pa: "Bin emptying schedule", resp: "Mr. Suresh Yadav", days: 3, status: "OPEN" },
    { z: 4, crit: "S4-C2", label: "Visual management boards updated", score: 0, cause: "Boards not updated since last month", ca: "Assign board owner per zone", pa: "Daily board update checklist", resp: "Mr. Amit Sharma", days: 2, status: "OPEN" },
    { z: 5, crit: "S1-C2", label: "Red Tag register updated", score: 1, cause: "Register not maintained digitally", ca: "Migrate to digital red tag system", pa: "Monthly register review", resp: "Mr. Deepak Joshi", days: 1, status: "OPEN" },
    { z: 3, crit: "S2-C4", label: "Tools returned to designated locations", score: 1, cause: "No shadow board for tools", ca: "Install shadow boards", pa: "Tool check-in/check-out log", resp: "Mr. Vikram Singh", days: 25, status: "CLOSED" },
    { z: 7, crit: "S5-C4", label: "Previous audit NCs closed within target", score: 0, cause: "NCs from last month still open", ca: "Weekly NC review meeting", pa: "Escalation matrix for overdue NCs", resp: "Mr. Manoj Tiwari", days: 22, status: "OVERDUE" }
  ];

  var rows = [];
  ncData.forEach(function(nc, i) {
    var z = _ZONES[nc.z];
    var created = _d(nc.days);
    var targetDate = new Date(created);
    targetDate.setDate(targetDate.getDate() + 14);
    rows.push([
      "NC-" + _ds(nc.days).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // nc_id
      created,                       // created_date
      z.id,                          // zone_id
      z.name,                        // zone_name
      _d(nc.days + 1),              // audit_date
      nc.crit,                       // criterion_id
      nc.label,                      // criterion_label
      nc.score,                      // score_given
      "auditor@packmasters.in",      // auditor_email
      nc.cause,                      // root_cause
      nc.ca,                         // corrective_action
      nc.pa,                         // preventive_action
      nc.resp,                       // responsible_person
      targetDate,                    // target_date
      nc.status,                     // status
      nc.status === "CLOSED" ? _d(nc.days - 5) : "", // closure_date
      nc.status === "CLOSED" ? "tarun.mishra@packmasters.in" : "", // verified_by
      nc.status === "CLOSED" ? "Verified on site" : "", // verification_remarks
      false,                         // is_repeat_nc
      0                              // repeat_count
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ NC_CAPA: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// SUMMARY — Monthly aggregated data for Feb 2026
// ═══════════════════════════════════════════════════════
function _loadSummary(ss) {
  var sh = _getSheet(ss, "Summary");
  if (!sh) return;
  var now = new Date();
  var monthStr = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM");
  var month = now.getMonth() + 1;
  var year = now.getFullYear();

  var rows = [];
  _ZONES.forEach(function(z) {
    var s1 = (2.5 + Math.random() * 1.5).toFixed(1);
    var s2 = (2.5 + Math.random() * 1.5).toFixed(1);
    var s3 = (2.0 + Math.random() * 2.0).toFixed(1);
    var s4 = (2.5 + Math.random() * 1.5).toFixed(1);
    var s5 = (2.0 + Math.random() * 2.0).toFixed(1);
    var total = ((parseFloat(s1) + parseFloat(s2) + parseFloat(s3) + parseFloat(s4) + parseFloat(s5)) / 5).toFixed(1);
    var pct = Math.round(parseFloat(total) / 4 * 100);
    rows.push([
      z.id,             // zone_id
      z.name,           // zone_name
      monthStr,         // month (yyyy-MM)
      year,             // year
      "monthly",        // period_type
      parseFloat(s1),   // s1_avg
      parseFloat(s2),   // s2_avg
      parseFloat(s3),   // s3_avg
      parseFloat(s4),   // s4_avg
      parseFloat(s5),   // s5_avg
      parseFloat(total),// total_avg
      pct,              // pct_score
      4,                // audit_count
      Math.floor(Math.random() * 4), // nc_count
      Math.floor(Math.random() * 3), // nc_closed
      Math.floor(22 + Math.random() * 6), // daily_submission_count
      Math.round(80 + Math.random() * 20), // daily_submission_rate
      _d(1),            // last_daily_date
      _d(3),            // last_audit_date
      new Date()        // computed_at
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ Summary: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// RED TAG REGISTER — 10 items
// ═══════════════════════════════════════════════════════
function _loadRedTagRegister(ss) {
  var sh = _getSheet(ss, "RedTagRegister");
  if (!sh) return;
  var items = [
    { z: 0, item: "Broken conveyor belt section", cat: "Equipment", val: 15000, action: "Dispose", status: "OPEN" },
    { z: 1, item: "Obsolete packaging machine parts", cat: "Spare Parts", val: 25000, action: "Sell as scrap", status: "OPEN" },
    { z: 2, item: "Expired raw material batch RM-2024-156", cat: "Raw Material", val: 45000, action: "Dispose per SOP", status: "CLOSED" },
    { z: 3, item: "Damaged pallets (stack of 12)", cat: "Packaging", val: 3600, action: "Repair or dispose", status: "OPEN" },
    { z: 4, item: "Old calibration standards (expired)", cat: "Lab Equipment", val: 8000, action: "Recertify or dispose", status: "OPEN" },
    { z: 5, item: "Rusted drill bits set (15 pcs)", cat: "Tools", val: 4500, action: "Replace", status: "CLOSED" },
    { z: 6, item: "Outdated ISO manuals (2019 edition)", cat: "Documents", val: 2000, action: "Shred", status: "CLOSED" },
    { z: 7, item: "Dented shipping containers (3 units)", cat: "Equipment", val: 12000, action: "Repair", status: "OPEN" },
    { z: 0, item: "Unlabelled chemical drums (2 units)", cat: "Chemicals", val: 0, action: "Identify and label or dispose", status: "OPEN" },
    { z: 2, item: "Old weighing scale (non-functional)", cat: "Equipment", val: 5000, action: "Dispose", status: "OPEN" }
  ];
  var rows = [];
  items.forEach(function(it, i) {
    var z = _ZONES[it.z];
    var created = _d(20 - i * 2);
    var deadline = new Date(created);
    deadline.setDate(deadline.getDate() + 14);
    rows.push([
      "RT-" + _ds(20 - i * 2).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // tag_id
      created,           // created_date
      z.id,              // zone_id
      z.name,            // zone_name
      it.item,           // item_description
      it.cat,            // item_category
      it.val,            // estimated_value
      it.action,         // proposed_action
      "",                // photo_url
      "",                // photo_file_id
      z.leader.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // tagged_by
      z.leader,          // owner
      deadline,          // disposition_deadline
      it.status === "CLOSED" ? it.action + " completed" : "", // actual_disposition
      it.status === "CLOSED" ? _d(10 - i) : "",               // disposition_date
      it.status === "CLOSED" ? z.leader : "",                  // disposed_by
      "",                // after_photo_url
      it.status,         // status
      ""                 // remarks
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ RedTagRegister: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// KAIZEN SUGGESTIONS — 8 suggestions
// ═══════════════════════════════════════════════════════
function _loadKaizenSuggestions(ss) {
  var sh = _getSheet(ss, "KaizenSuggestions");
  if (!sh) return;
  var suggestions = [
    { z: 0, cat: "Quality", title: "Poka-yoke jig for assembly line", desc: "Design a mistake-proofing jig to prevent wrong orientation during assembly", benefit: "Reduce defect rate by 30%", savings: 50000, status: "APPROVED" },
    { z: 1, cat: "Cost", title: "LED lighting retrofit in Floor B", desc: "Replace old fluorescent tubes with LED panels for energy savings", benefit: "Reduce electricity cost by 40%", savings: 120000, status: "COMPLETED" },
    { z: 2, cat: "Safety", title: "Automatic dock leveler for trucks", desc: "Install hydraulic dock leveler to reduce manual handling injuries", benefit: "Eliminate loading injuries", savings: 0, status: "SUBMITTED" },
    { z: 3, cat: "Delivery", title: "FIFO lane system for finished goods", desc: "Create gravity roller lanes for automatic FIFO dispatch", benefit: "Reduce FIFO violations to zero", savings: 30000, status: "IN_PROGRESS" },
    { z: 4, cat: "Quality", title: "Digital calibration tracking", desc: "QR-based calibration status for all lab instruments", benefit: "Zero expired calibrations", savings: 15000, status: "APPROVED" },
    { z: 5, cat: "Cost", title: "Predictive maintenance for CNC machines", desc: "Install vibration sensors for early failure detection", benefit: "Reduce breakdowns by 50%", savings: 200000, status: "SUBMITTED" },
    { z: 6, cat: "Morale", title: "5S zone scoreboard in cafeteria", desc: "Digital display showing real-time 5S scores for all zones", benefit: "Increase engagement and competition", savings: 0, status: "COMPLETED" },
    { z: 7, cat: "Safety", title: "Anti-fatigue mats at packing stations", desc: "Install ergonomic mats for workers standing during shift", benefit: "Reduce fatigue complaints by 60%", savings: 10000, status: "IN_PROGRESS" }
  ];
  var rows = [];
  suggestions.forEach(function(s, i) {
    var z = _ZONES[s.z];
    var created = _d(25 - i * 3);
    var targetDate = new Date(created);
    targetDate.setDate(targetDate.getDate() + 30);
    rows.push([
      "KZ-" + _ds(25 - i * 3).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // kaizen_id
      created,             // created_date
      z.id,                // zone_id
      z.name,              // zone_name
      z.leader,            // submitter_name
      s.cat,               // category
      s.title,             // title
      s.desc,              // description
      "",                  // photo_url
      s.benefit,           // expected_benefit
      s.savings,           // estimated_savings
      s.status,            // status
      s.status !== "SUBMITTED" ? "tarun.mishra@packmasters.in" : "", // reviewer
      s.status !== "SUBMITTED" ? _d(20 - i * 3) : "",               // review_date
      s.status !== "SUBMITTED" ? "Good suggestion, approved" : "",   // review_remarks
      z.leader.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // assigned_to
      targetDate,          // target_date
      s.status === "COMPLETED" ? _d(5 - i) : "",  // completion_date
      s.status === "COMPLETED" ? s.savings : "",   // actual_savings
      s.status === "COMPLETED" ? "balkrishna.mishra@packmasters.in" : "", // benefit_verified_by
      s.status === "COMPLETED" ? _d(3 - i) : ""   // verification_date
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ KaizenSuggestions: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// TASK BOARD — 12 tasks
// ═══════════════════════════════════════════════════════
function _loadTaskBoard(ss) {
  var sh = _getSheet(ss, "TaskBoard");
  if (!sh) return;
  var tasks = [
    { z: 0, title: "Install shadow boards in Assembly", cat: "NC", pri: 2, status: "OPEN", days: 15 },
    { z: 0, title: "Replace faded safety signs", cat: "NC", pri: 1, status: "IN_PROGRESS", days: 10 },
    { z: 1, title: "Retrain cleaning crew on 5S", cat: "NC", pri: 2, status: "OPEN", days: 12 },
    { z: 2, title: "FIFO labels for all racks", cat: "KAIZEN", pri: 3, status: "DONE", days: 20 },
    { z: 3, title: "Install gravity roller FIFO lanes", cat: "KAIZEN", pri: 2, status: "IN_PROGRESS", days: 8 },
    { z: 4, title: "QR calibration stickers for instruments", cat: "KAIZEN", pri: 3, status: "OPEN", days: 6 },
    { z: 5, title: "Create TPM checklist for all machines", cat: "NC", pri: 1, status: "IN_PROGRESS", days: 14 },
    { z: 6, title: "Label all office cabinets and drawers", cat: "NC", pri: 3, status: "DONE", days: 18 },
    { z: 7, title: "Mark staging area for dispatch", cat: "NC", pri: 1, status: "OPEN", days: 5 },
    { z: 7, title: "Repaint floor markings at loading bay", cat: "NC", pri: 2, status: "OPEN", days: 4 },
    { z: 2, title: "Dispose expired RM batch per SOP", cat: "RED_TAG", pri: 1, status: "DONE", days: 16 },
    { z: 5, title: "Install vibration sensors on CNC-01", cat: "KAIZEN", pri: 2, status: "OPEN", days: 3 }
  ];
  var rows = [];
  tasks.forEach(function(t, i) {
    var z = _ZONES[t.z];
    var created = _d(t.days);
    var due = new Date(created);
    due.setDate(due.getDate() + 14);
    rows.push([
      "TK-" + _ds(t.days).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // task_id
      created,             // created_date
      z.id,                // zone_id
      z.name,              // zone_name
      t.title,             // title
      "",                  // description
      t.cat,               // category
      t.pri,               // priority
      t.cat,               // source
      "",                  // source_ref_id
      z.leader.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // assigned_to
      due,                 // due_date
      t.status,            // status
      _d(t.days - 1),     // status_updated_at
      t.status === "DONE" ? _d(2) : "",  // completed_date
      t.status === "DONE" ? z.leader : "", // completed_by
      "",                  // remarks
      ""                   // photo_url
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ TaskBoard: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// GEMBA WALKS — 6 walks
// ═══════════════════════════════════════════════════════
function _loadGembaWalks(ss) {
  var sh = _getSheet(ss, "GembaWalks");
  if (!sh) return;
  var walks = [
    { z: 0, type: "Safety", walker: "Mr. Tarun Mishra", yes: 8, no: 2, na: 0 },
    { z: 1, type: "Quality", walker: "Mr. Amit Sharma", yes: 7, no: 3, na: 0 },
    { z: 2, type: "Process", walker: "Mr. Tarun Mishra", yes: 9, no: 1, na: 0 },
    { z: 4, type: "Safety", walker: "Mr. Tarun Mishra", yes: 10, no: 0, na: 0 },
    { z: 5, type: "Process", walker: "Mr. Deepak Joshi", yes: 6, no: 3, na: 1 },
    { z: 7, type: "Leadership", walker: "Mr. Balkrishna Mishra", yes: 8, no: 2, na: 0 }
  ];
  var rows = [];
  walks.forEach(function(w, i) {
    var z = _ZONES[w.z];
    var totalQ = w.yes + w.no + w.na;
    var compliance = Math.round(w.yes / (totalQ - w.na) * 100);
    rows.push([
      "GW-" + _ds(i * 4 + 2).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // walk_id
      _ts(i * 4 + 2),    // timestamp
      w.type,             // walk_type
      w.walker,           // walker_name
      w.walker.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // walker_email
      z.id,               // zone_id
      z.name,             // zone_name
      "{}",               // responses_json
      w.no > 0 ? "Found " + w.no + " non-compliant items during walk" : "All items compliant", // observations
      "[]",               // action_items_json
      "",                 // photo_urls
      totalQ,             // total_questions
      w.yes,              // yes_count
      w.no,               // no_count
      w.na,               // na_count
      compliance          // compliance_pct
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ GembaWalks: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// HANDOVER LOG — 10 entries
// ═══════════════════════════════════════════════════════
function _loadHandoverLog(ss) {
  var sh = _getSheet(ss, "HandoverLog");
  if (!sh) return;
  var entries = [
    { z: 0, from: "Shift A", to: "Shift B", notes: "CNC-02 running slow, needs maintenance check. Material for order #4567 staged at bay 3.", safety: "All PPE stations stocked" },
    { z: 0, from: "Shift B", to: "Shift A", notes: "Order #4567 completed. New order #4589 material to be received at 8 AM.", safety: "Fire extinguisher #7 needs refill" },
    { z: 1, from: "Shift A", to: "Shift B", notes: "Packaging machine PM completed. Test run OK. Continue order #8821.", safety: "No issues" },
    { z: 1, from: "Shift B", to: "Shift A", notes: "Order #8821 50% done. Ink cartridge low on printer P3.", safety: "Spill near station 4 cleaned" },
    { z: 2, from: "Day", to: "Night", notes: "Received 5 pallets of RM from supplier ABC. Quality check pending for lot #RM-2026-089.", safety: "Forklift battery at 30%, charge overnight" },
    { z: 5, from: "Shift A", to: "Shift B", notes: "Lathe L-03 spindle bearing replaced. CNC-01 vibration sensor installed. Pending calibration.", safety: "Lockout/tagout in place for L-03" },
    { z: 5, from: "Shift B", to: "Shift A", notes: "L-03 calibration done, back in service. CNC-01 sensor calibrated.", safety: "All clear" },
    { z: 7, from: "Day", to: "Night", notes: "3 trucks dispatched. 2 trucks expected for loading at 6 AM. Dock #2 leveler repair scheduled.", safety: "Dock #1 light not working" },
    { z: 3, from: "Day", to: "Night", notes: "FG inventory count done. Discrepancy in SKU-445 (-3 units). Investigation needed.", safety: "No issues" },
    { z: 4, from: "Day", to: "Evening", notes: "pH meter calibration done. Pending: tensile tester annual calibration (due Friday).", safety: "Chemical storage area secured" }
  ];

  var rows = [];
  entries.forEach(function(e, i) {
    var z = _ZONES[e.z];
    rows.push([
      "HO-" + _ds(i + 1).replace(/-/g, "") + "-" + String(i + 1).padStart(3, "0"), // handover_id
      _ts(i + 1),            // timestamp
      z.id,                   // zone_id
      z.name,                 // zone_name
      e.from,                 // from_shift
      e.to,                   // to_shift
      z.leader,               // handover_by
      z.leader.replace("Mr. ", "").toLowerCase().replace(/ /g, ".") + "@packmasters.in", // handover_email
      e.notes,                // key_notes
      e.safety,               // safety_concerns
      "",                     // pending_tasks
      "",                     // equipment_status
      "",                     // photo_urls
      "COMPLETED"             // status
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ HandoverLog: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// TRAINING LOG — 12 records
// ═══════════════════════════════════════════════════════
function _loadTrainingLog(ss) {
  var sh = _getSheet(ss, "TrainingLog");
  if (!sh) return;
  var records = [
    { z: 0, name: "Rahul Verma", topic: "5S Sort (Seiri) Basics", pillar: "S1", status: "CERTIFIED", daysAgo: 45 },
    { z: 0, name: "Priya Sharma", topic: "5S Set in Order (Seiton)", pillar: "S2", status: "CERTIFIED", daysAgo: 40 },
    { z: 1, name: "Arun Patel", topic: "5S Shine (Seiso) Practices", pillar: "S3", status: "TRAINED", daysAgo: 30 },
    { z: 1, name: "Sunita Devi", topic: "5S Standardize (Seiketsu)", pillar: "S4", status: "TRAINED", daysAgo: 25 },
    { z: 2, name: "Mohan Lal", topic: "FIFO and Material Handling", pillar: "S2", status: "CERTIFIED", daysAgo: 60 },
    { z: 3, name: "Neha Gupta", topic: "Warehouse Safety and 5S", pillar: "S5", status: "EXPIRED", daysAgo: 200 },
    { z: 4, name: "Ravi Kumar", topic: "Lab 5S and Equipment Care", pillar: "S3", status: "CERTIFIED", daysAgo: 35 },
    { z: 5, name: "Ajay Singh", topic: "TPM and 5S for Maintenance", pillar: "S3", status: "TRAINED", daysAgo: 15 },
    { z: 6, name: "Kavita Rao", topic: "Office 5S and Document Control", pillar: "S4", status: "CERTIFIED", daysAgo: 50 },
    { z: 7, name: "Sanjay Tiwari", topic: "Loading Bay Safety and 5S", pillar: "S5", status: "TRAINED", daysAgo: 10 },
    { z: 0, name: "Deepak Yadav", topic: "Red Tag System Training", pillar: "S1", status: "TRAINED", daysAgo: 8 },
    { z: 4, name: "Anita Joshi", topic: "Visual Management Boards", pillar: "S4", status: "TRAINED", daysAgo: 5 }
  ];

  var rows = [];
  records.forEach(function(r, i) {
    var z = _ZONES[r.z];
    var trained = _d(r.daysAgo);
    var certified = r.status === "CERTIFIED" || r.status === "EXPIRED" ? _d(r.daysAgo - 5) : "";
    var expiry = "";
    if (r.status === "EXPIRED") {
      expiry = _d(r.daysAgo - 5 - 180); // expired 180 days after cert
    } else if (r.status === "CERTIFIED") {
      var exp = new Date(trained);
      exp.setDate(exp.getDate() + 365);
      expiry = exp;
    }

    rows.push([
      "TR-" + String(i + 1).padStart(4, "0"),  // record_id
      r.name,             // worker_name
      r.name.toLowerCase().replace(/ /g, ".") + "@packmasters.in", // worker_email
      z.id,               // zone_id
      r.topic,            // topic
      r.pillar,           // pillar
      r.status,           // status
      trained,            // trained_date
      certified,          // certified_date
      expiry,             // expiry_date
      z.leader,           // trainer_name
      "",                 // sop_drive_url
      ""                  // remarks
    ]);
  });
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log("✅ TrainingLog: " + rows.length + " rows loaded");
  }
}

// ═══════════════════════════════════════════════════════
// ALERT RULES — Default rules
// ═══════════════════════════════════════════════════════
function _loadAlertRules(ss) {
  var sh = _getSheet(ss, "AlertRules");
  if (!sh) return;
  // Only load if empty (after header)
  if (sh.getLastRow() > 1) {
    Logger.log("⚠ AlertRules already has data — skipping");
    return;
  }
  var rows = [
    ["AR-001", true, "all", "daily_score_pct", "<", 60, "email", "zone_leader", 24, "", "Low daily score alert"],
    ["AR-002", true, "all", "nc_age_days", ">", 14, "email", "mc", 48, "", "NC overdue 14 days"],
    ["AR-003", true, "all", "missed_consecutive", ">=", 3, "email", "zone_leader", 72, "", "3+ consecutive missed daily submissions"],
    ["AR-004", true, "all", "weekly_score_pct", "<", 50, "email", "top_mgmt", 168, "", "Critical weekly audit score"],
    ["AR-005", true, "all", "nc_count_open", ">", 5, "email", "mc", 72, "", "Too many open NCs for zone"],
    ["AR-006", true, "all", "daily_score_pct", "<", 40, "email", "top_mgmt", 24, "", "Critical daily score - escalate to management"]
  ];
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log("✅ AlertRules: " + rows.length + " rows loaded");
}

// ═══════════════════════════════════════════════════════
// ESCALATION CONFIG — Default levels
// ═══════════════════════════════════════════════════════
function _loadEscalationConfig(ss) {
  var sh = _getSheet(ss, "EscalationConfig");
  if (!sh) return;
  if (sh.getLastRow() > 1) {
    Logger.log("⚠ EscalationConfig already has data — skipping");
    return;
  }
  var rows = [
    [1, 0, "email", "zone_leader", "", "NC Created: {nc_id} in {zone_name}", "", "NC created - notify zone leader immediately"],
    [2, 3, "email", "zone_leader", "", "Reminder: NC {nc_id} - Root cause pending", "", "Day 3 - no root cause entered yet"],
    [3, 7, "email", "mc", "", "Escalation: NC {nc_id} overdue 7 days", "", "Day 7 - escalate to MC"],
    [4, 14, "email", "top_mgmt", "", "CRITICAL: NC {nc_id} overdue 14 days", "CRITICAL", "Critical: 14 days overdue, auto-flag"],
    [5, 21, "email", "top_mgmt", "", "URGENT: NC {nc_id} overdue 21 days - MRM agenda", "CRITICAL", "CRITICAL: 21 days, auto-flagged for MRM"]
  ];
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log("✅ EscalationConfig: " + rows.length + " rows loaded");
}
