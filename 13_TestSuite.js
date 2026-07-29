/**
 * ============================================================================
 * 13_TestSuite.gs — PackMasters 5S Integrated System
 * Phase 5: Comprehensive Self-Test Suite
 * ============================================================================
 *
 * Validates the entire system against known test data.
 * Uses a SANDBOX sheet created and destroyed per test run.
 * Reports PASS/FAIL per test to Logger and AdminLog.
 *
 * Functions:
 *   runAllTests()                   — Master test runner
 *   testConfigLoad_()              — Tests ScriptProperties config
 *   testZoneValidation_()          — Tests zone ID validation
 *   testScoreValidation_()         — Tests score range validation
 *   testSanitization_()            — Tests input sanitisation
 *   testRowBuild_()                — Tests daily and weekly row builders
 *   testCAPALifecycle_()           — Tests create → update → close
 *   testRollupCompute_()           — Tests aggregation computations
 *   testEmailBuild_()              — Tests email HTML generation
 *   testDedupDetection_()          — Tests duplicate submission detection
 *   testDataServiceFunctions_()    — Tests Phase 4 data service layer
 *   testPayloadValidation_()       — Tests full payload validation
 */

// ============================================================================
// MASTER TEST RUNNER
// ============================================================================

/**
 * Runs all test suites. Called from Admin Menu → Run All Tests.
 * Creates a sandbox sheet, runs all tests, cleans up.
 * Displays results in a dialog.
 */
function runAllTests() {
  var startTime = new Date();
  var results = [];
  var totalPassed = 0;
  var totalFailed = 0;
  var totalSkipped = 0;

  /**
   * Test assertion helper — used by all test functions.
   */
  function assert(testName, condition, detail) {
    if (condition) {
      results.push({ name: testName, status: "PASS", detail: detail || "" });
      totalPassed++;
    } else {
      results.push({ name: testName, status: "FAIL", detail: detail || "" });
      totalFailed++;
    }
  }

  function skip(testName, reason) {
    results.push({ name: testName, status: "SKIP", detail: reason });
    totalSkipped++;
  }

  // ── Create sandbox ──
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sandboxName = "TEST_SANDBOX_" + Date.now();
  var sandbox = ss.insertSheet(sandboxName);

  results.push({ name: "═══ PACKMASTERS 5S — FULL TEST SUITE ═══", status: "HEADER", detail: "" });
  results.push({ name: "Started: " + startTime.toISOString(), status: "INFO", detail: "" });

  try {
    // ══════════════════════════════════════════
    // SUITE 1: Configuration Tests
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 1: Configuration ──", status: "HEADER", detail: "" });

    // Test 1.1: ScriptProperties contains all required keys
    var requiredKeys = ["ZONE_CONFIG", "CHECKLIST_SCHEMA", "DEPLOY_ID", "QR_VERSION",
      "CONFIG_VERSION", "MC_EMAIL", "TOP_EMAIL", "MC_WHITELIST"];
    var props = PropertiesService.getScriptProperties();
    requiredKeys.forEach(function(key) {
      var val = props.getProperty(key);
      assert("Config key '" + key + "' exists", val !== null && val !== "", val ? "✓" : "MISSING");
    });

    // Test 1.2: ZONE_CONFIG parses correctly
    try {
      var zoneConfig = getZoneConfig();
      assert("ZONE_CONFIG parses to object", typeof zoneConfig === "object" && zoneConfig !== null);
      var zoneIds = Object.keys(zoneConfig);
      assert("ZONE_CONFIG has 28 zones", zoneIds.length === 28, "Found " + zoneIds.length);

      // Verify each zone has required structural fields.
      // email and department are intentionally "" in getDefaultZoneMetadata_();
      // they are populated later from the Zones sheet for configured zones only.
      var allZonesValid = true;
      zoneIds.forEach(function(id) {
        var z = zoneConfig[id];
        if (!z.id || !z.name || !z.leader) {
          allZonesValid = false;
        }
      });
      assert("All zones have required fields", allZonesValid);
    } catch (e) {
      assert("ZONE_CONFIG parses", false, e.message);
    }

    // Test 1.3: CHECKLIST_SCHEMA parses correctly
    try {
      var schema = getChecklistSchema();
      assert("CHECKLIST_SCHEMA parses", typeof schema === "object");
      assert("Schema has 5 pillars", schema.pillars && schema.pillars.length === 5);
      assert("Schema has 20 criteria", schema.criteria && schema.criteria.length === 20, "Found " + (schema.criteria ? schema.criteria.length : 0));
      assert("Schema maxTotalScore = 80", schema.maxTotalScore === 80, "Found " + schema.maxTotalScore);
      assert("Schema ncThreshold defined", schema.ncThreshold !== undefined, "Value: " + schema.ncThreshold);
    } catch (e) {
      assert("CHECKLIST_SCHEMA parses", false, e.message);
    }

    // ══════════════════════════════════════════
    // SUITE 2: Validation Functions
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 2: Validation ──", status: "HEADER", detail: "" });

    // Test 2.1: Zone validation
    try {
      assert("Valid zone Z-01 passes", validateZoneId("Z-01") === "Z-01");
      assert("Valid zone z-01 normalises", validateZoneId("z-01") === "Z-01");
      assert("Valid zone ' Z-01 ' trims", validateZoneId(" Z-01 ") === "Z-01");
    } catch (e) {
      assert("Valid zone passes", false, e.message);
    }

    try { validateZoneId("Z-99"); assert("Invalid zone Z-99 throws", false); }
    catch (e) { assert("Invalid zone Z-99 throws", true); }

    try { validateZoneId(""); assert("Empty zone throws", false); }
    catch (e) { assert("Empty zone throws", true); }

    try { validateZoneId(null); assert("Null zone throws", false); }
    catch (e) { assert("Null zone throws", true); }

    try { validateZoneId("INVALID"); assert("Bad format throws", false); }
    catch (e) { assert("Bad format throws", true); }

    // Test 2.2: Score validation
    assert("Score 0 valid [0,4]", validateScore(0, 0, 4) === 0);
    assert("Score 4 valid [0,4]", validateScore(4, 0, 4) === 4);
    assert("Score '3' coerces", validateScore("3", 0, 4) === 3);

    try { validateScore(5, 0, 4); assert("Score 5 throws [0,4]", false); }
    catch (e) { assert("Score 5 throws [0,4]", true); }

    try { validateScore(-1, 0, 4); assert("Score -1 throws [0,4]", false); }
    catch (e) { assert("Score -1 throws [0,4]", true); }

    try { validateScore("abc", 0, 4); assert("Score 'abc' throws", false); }
    catch (e) { assert("Score 'abc' throws", true); }

    // Test 2.3: Date validation
    assert("Valid date passes", validateDateString("2025-04-15") === "2025-04-15");
    try { validateDateString("04-15-2025"); assert("MM-DD-YYYY throws", false); }
    catch (e) { assert("MM-DD-YYYY throws", true); }

    // Test 2.4: Email validation
    assert("Valid email passes", validateEmail("test@example.com") === "test@example.com");
    assert("Email normalises", validateEmail("  TEST@Example.COM  ") === "test@example.com");
    try { validateEmail("not-an-email"); assert("Invalid email throws", false); }
    catch (e) { assert("Invalid email throws", true); }

    // ══════════════════════════════════════════
    // SUITE 3: Sanitisation
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 3: Sanitisation ──", status: "HEADER", detail: "" });

    assert("Plain text unchanged", sanitizeInput("Hello World") === "Hello World");
    assert("HTML stripped", sanitizeInput("<script>alert('xss')</script>Hello") === "alert('xss')Hello");
    assert("Tags removed", sanitizeInput("<b>Bold</b>") === "Bold");
    assert("Length limited", sanitizeInput("A".repeat(200), 50).length === 50);
    assert("Null becomes empty", sanitizeInput(null) === "");
    assert("Number coerced", sanitizeInput(12345) === "12345");
    assert("JS protocol stripped", sanitizeInput("javascript:alert(1)").indexOf("javascript:") === -1);
    assert("Event handlers stripped", sanitizeInput('onclick=alert(1)').indexOf("onclick=") === -1);
    assert("Newlines preserved", sanitizeInput("line1\nline2").indexOf("\n") !== -1);
    assert("Trim works", sanitizeInput("  spaces  ") === "spaces");

    // ══════════════════════════════════════════
    // SUITE 4: Row Builders
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 4: Row Builders ──", status: "HEADER", detail: "" });

    try {
      var testSchema = getChecklistSchema();
      var testCriteria = {};
      testSchema.criteria.forEach(function(c) { testCriteria[c.id] = 1; });

      var dailyData = {
        submission_id: "test-uuid-1234",
        zone_id: "Z-01",
        submission_type: "daily",
        criteria: testCriteria,
        remarks: "Test remarks",
        photo_url: ""
      };
      var zone = getZoneConfig()["Z-01"];
      var dailyRow = buildDailyRow_(dailyData, zone, new Date(), "2025-04-15", false);

      assert("Daily row has 18 cols", dailyRow.length === 18, "Got " + dailyRow.length);
      assert("Daily row[0] = submission_id", dailyRow[0] === "test-uuid-1234");
      assert("Daily row[2] = zone_id", dailyRow[2] === "Z-01");
      assert("Daily row[6] = 'daily'", dailyRow[6] === "daily");
      assert("Daily row[12] total_pass = 20", dailyRow[12] === 20);
      assert("Daily row[13] total_criteria = 20", dailyRow[13] === 20);
      assert("Daily row[14] pct = 100", dailyRow[14] === 100);
      assert("Daily row[17] is_duplicate = false", dailyRow[17] === false);

      // Test with some failures
      var partialCriteria = {};
      testSchema.criteria.forEach(function(c, i) { partialCriteria[c.id] = i < 15 ? 1 : 0; });
      dailyData.criteria = partialCriteria;
      var partialRow = buildDailyRow_(dailyData, zone, new Date(), "2025-04-15", false);
      assert("Partial daily total_pass = 15", partialRow[12] === 15);
      assert("Partial daily pct = 75", partialRow[14] === 75);

    } catch (e) {
      assert("Daily row builder works", false, e.message);
    }

    // Weekly row
    try {
      var testScores = {};
      var schema3 = getChecklistSchema();
      schema3.criteria.forEach(function(c) { testScores[c.id] = 3; });

      var weeklyData = {
        submission_id: "test-weekly-uuid",
        zone_id: "Z-02",
        submission_type: "weekly",
        scores: testScores,
        photo_urls: "[]"
      };
      var zone2 = getZoneConfig()["Z-02"];
      var wRow = buildWeeklyRow_(weeklyData, zone2, new Date(), "2025-04-15", "mc@test.com");
      var expectedCols = 6 + schema3.criteria.length + 6;
      assert("Weekly row has correct cols", wRow.length === expectedCols, "Expected " + expectedCols + " got " + wRow.length);
      assert("Weekly total = 60", wRow[wRow.length - 6] === 60);
      assert("Weekly max = 80", wRow[wRow.length - 5] === 80);
      assert("Weekly pct = 75", wRow[wRow.length - 4] === 75);
      assert("Weekly nc_count = 0 (all scores 3)", wRow[wRow.length - 3] === 0);

      // Test with NCs
      testScores["S1-C1"] = 0;
      testScores["S2-C1"] = 1;
      weeklyData.scores = testScores;
      var wRow2 = buildWeeklyRow_(weeklyData, zone2, new Date(), "2025-04-15", "mc@test.com");
      assert("Weekly nc_count = 2 (scores 0,1)", wRow2[wRow2.length - 3] === 2);

    } catch (e) {
      assert("Weekly row builder works", false, e.message);
    }

    // ══════════════════════════════════════════
    // SUITE 5: CAPA Lifecycle
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 5: CAPA Lifecycle ──", status: "HEADER", detail: "" });

    var testNcId = null;
    try {
      // createCAPA signature: (zoneId, description, type, pillar, sqcdpDim, responsiblePerson)
      // Passing responsiblePerson= (6th arg omitted) so NC_COL.RESPONSIBLE is blank,
      // which means the 4-eyes CLOSED check (createdBy === actorEmail) will be false
      // regardless of who runs the test.
      testNcId = createCAPA("Z-01", "S1-C1 test NC", "NC", "S1", "", "");
      assert("CAPA create returns NC ID", testNcId && testNcId.indexOf("NC-") === 0, testNcId);

      // Verify initial status (sheet col 15 = 1-based = NC_COL.STATUS index 14)
      var capaSheet = ss.getSheetByName("NC_CAPA");
      var lastRow = capaSheet.getLastRow();
      assert("CAPA initial status = OPEN", String(capaSheet.getRange(lastRow, 15).getValue()) === "OPEN");

      // Update to IN_PROGRESS — requires root_cause >= 50 chars and corrective_action non-empty (RCA gate).
      // updateCAPAStatus NEVER throws; it returns { success, message }.
      // Full lifecycle success requires the running identity to have ZONE_LEAD permission.
      var rcaRoot = "Test root cause that is long enough to satisfy the fifty character minimum RCA gate requirement here";
      var updated1 = updateCAPAStatus(testNcId, "IN_PROGRESS", "test@test.com", "Starting work", {
        root_cause: rcaRoot,
        corrective_action: "Test corrective action"
      });
      // If running under an identity without ZONE_LEAD, updated1.success will be false (permission denied).
      // In that case fall back to asserting the returned object has the expected shape.
      if (typeof updated1 === "object" && updated1.success === false &&
          updated1.message && updated1.message.indexOf("Permission") !== -1) {
        assert("CAPA IN_PROGRESS update returns object with success key (permission blocked)",
               typeof updated1 === "object" && "success" in updated1);
        skip("CAPA status = IN_PROGRESS", "Skipped: clasp-run identity lacks ZONE_LEAD permission");
        skip("Root cause populated", "Skipped: IN_PROGRESS update was permission-blocked");
        skip("CAPA status = CLOSED", "Skipped: depends on IN_PROGRESS");
        skip("Closure date set", "Skipped: depends on IN_PROGRESS");
      } else {
        assert("CAPA update IN_PROGRESS returns true", updated1.success === true, updated1.message || "");
        assert("CAPA status = IN_PROGRESS", String(capaSheet.getRange(lastRow, 15).getValue()) === "IN_PROGRESS");
        // Root cause stored verbatim — compare to the actual long string passed in
        assert("Root cause populated", String(capaSheet.getRange(lastRow, 10).getValue()) === rcaRoot);

        // Close — 4-eyes check: createdBy (blank) !== actorEmail (non-blank), so this is allowed
        var closed1 = updateCAPAStatus(testNcId, "CLOSED", "mc@test.com", "Verified OK");
        assert("CAPA status = CLOSED", String(capaSheet.getRange(lastRow, 15).getValue()) === "CLOSED");
        assert("Closure date set", String(capaSheet.getRange(lastRow, 16).getValue()) !== "");
      }

      // Invalid status — updateCAPAStatus returns {success:false}, it does NOT throw
      var bad = updateCAPAStatus(testNcId, "INVALID_STATUS", "test@test.com", "");
      assert("Invalid status rejected", bad.success === false);

      // Non-existent NC — returns {success:false}, does NOT throw
      var missing = updateCAPAStatus("NC-9999-99-9999", "CLOSED", "test@test.com", "");
      assert("Non-existent NC rejected", missing.success === false);

      // Clean up
      capaSheet.deleteRow(lastRow);

    } catch (e) {
      assert("CAPA lifecycle test", false, e.message);
      // Attempt cleanup
      if (testNcId) {
        try {
          var cs = ss.getSheetByName("NC_CAPA");
          if (cs) cs.deleteRow(cs.getLastRow());
        } catch (cleanupErr) { }
      }
    }

    // ══════════════════════════════════════════
    // SUITE 6: Aggregation Helpers
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 6: Aggregation ──", status: "HEADER", detail: "" });

    assert("average_([1,2,3]) = 2", average_([1, 2, 3]) === 2);
    assert("average_([]) = 0", average_([]) === 0);
    assert("average_([100]) = 100", average_([100]) === 100);
    assert("round2_(3.14159) = 3.14", round2_(3.14159) === 3.14);
    assert("round2_(0) = 0", round2_(0) === 0);

    // Consecutive months
    assert("2025-01 → 2025-02 consecutive", areConsecutiveMonths_("2025-01", "2025-02") === true);
    assert("2024-12 → 2025-01 consecutive", areConsecutiveMonths_("2024-12", "2025-01") === true);
    assert("2025-01 → 2025-03 NOT consecutive", areConsecutiveMonths_("2025-01", "2025-03") === false);
    assert("2025-06 → 2025-07 consecutive", areConsecutiveMonths_("2025-06", "2025-07") === true);

    // Working days
    var wd = countWorkingDays_(new Date(2025, 3, 1), new Date(2025, 3, 30)); // April 2025
    assert("April 2025 working days > 20", wd >= 25 && wd <= 30, "Got " + wd);

    // Summary row builder
    var summRow = buildSummaryRow_("Z-01", "2025-04", 80, 75, 90, 85, 70, 60, 75,
      4, 2, 1, 22, 88, "2025-04-30", "2025-04-28", new Date());
    assert("Summary row has 15 cols", summRow.length === 15, "Got " + summRow.length);
    assert("Summary row[0] = Z-01", summRow[0] === "Z-01");
    assert("Summary row[4] = s1 score", summRow[4] === 90);

    // ══════════════════════════════════════════
    // SUITE 7: Email Builders
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 7: Email Builders ──", status: "HEADER", detail: "" });

    try {
      var zlHtml = buildZLDigest_(
        [{ id: "Z-01", name: "Test Zone", leader: "Test Leader", email: "test@test.com" }],
        [{ type: "MISSED_DAILY", zoneName: "Test Zone", date: "2025-04-15", leader: "Test Leader" }]
      );
      assert("ZL digest is string", typeof zlHtml === "string");
      assert("ZL digest has PackMasters", zlHtml.indexOf("PackMasters") !== -1);
      assert("ZL digest has missed warning", zlHtml.indexOf("Missed") !== -1);
    } catch (e) { assert("ZL digest builds", false, e.message); }

    try {
      var mcHtml = buildMCDigest_(
        [{ type: "NC_OVERDUE", ncId: "NC-2025-04-0001", zoneName: "Test", criterionLabel: "Test Criterion", daysOverdue: 5 }],
        []
      );
      assert("MC digest is string", typeof mcHtml === "string");
      assert("MC digest has overdue section", mcHtml.indexOf("Overdue") !== -1);
    } catch (e) { assert("MC digest builds", false, e.message); }

    try {
      var topHtml = buildTopMgtDigest_([
        { type: "REPEAT_NC", zoneId: "Z-01", zoneName: "Test", criterionId: "S1-C1", criterionLabel: "Test", consecutiveMonths: 3, months: ["2025-02", "2025-03", "2025-04"] }
      ]);
      assert("Top Mgt digest has repeat section", topHtml.indexOf("Repeat") !== -1);
    } catch (e) { assert("Top Mgt digest builds", false, e.message); }

    // ══════════════════════════════════════════
    // SUITE 8: Payload Validation
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 8: Payload Validation ──", status: "HEADER", detail: "" });

    try {
      var validCriteria = {};
      getChecklistSchema().criteria.forEach(function(c) { validCriteria[c.id] = 1; });
      var validPayload = validateSubmissionPayload({
        submission_id: Utilities.getUuid(),
        zone_id: "Z-01",
        submission_type: "daily",
        criteria: validCriteria,
        remarks: "Test <script>alert(1)</script>",
        photo_url: ""
      });
      assert("Valid daily payload passes", validPayload.zone_id === "Z-01");
      assert("Remarks sanitised", validPayload.remarks.indexOf("<script>") === -1);
    } catch (e) { assert("Valid payload passes", false, e.message); }

    // Invalid payloads
    try { validateSubmissionPayload(null); assert("Null payload throws", false); }
    catch (e) { assert("Null payload throws", true); }

    try { validateSubmissionPayload({ zone_id: "Z-01", submission_type: "invalid" }); assert("Invalid type throws", false); }
    catch (e) { assert("Invalid type throws", true); }

    try { validateSubmissionPayload({ zone_id: "Z-99", submission_type: "daily", criteria: {} }); assert("Invalid zone throws", false); }
    catch (e) { assert("Invalid zone throws", true); }

    // ══════════════════════════════════════════
    // SUITE 9: Data Service
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 9: Data Service ──", status: "HEADER", detail: "" });

    try {
      var zs = getZoneSummary("Z-01");
      assert("getZoneSummary returns object", typeof zs === "object");
    } catch (e) { assert("getZoneSummary", false, e.message); }

    try {
      var ps = getPlantSummary();
      assert("getPlantSummary has zones array", Array.isArray(ps.zones));
    } catch (e) { assert("getPlantSummary", false, e.message); }

    try {
      var zt = getZoneTrend("Z-01", 3);
      assert("getZoneTrend returns array", Array.isArray(zt));
    } catch (e) { assert("getZoneTrend", false, e.message); }

    try {
      var openCAPAs = getOpenCAPAs();
      assert("getOpenCAPAs returns array", Array.isArray(openCAPAs));
    } catch (e) { assert("getOpenCAPAs", false, e.message); }

    try {
      var hc = getHistoricalComparison("Z-01");
      assert("getHistoricalComparison has 12 months", hc.comparison.length === 12);
    } catch (e) { assert("getHistoricalComparison", false, e.message); }

    // ══════════════════════════════════════════
    // SUITE 10: Infrastructure Integrity
    // ══════════════════════════════════════════
    results.push({ name: "── Suite 10: Infrastructure ──", status: "HEADER", detail: "" });

    // Sheets exist
    ["Zones", "ChecklistSchema", "DailySubmissions", "WeeklyAudit",
      "NC_CAPA", "PhotoLog", "Summary", "AdminLog", "QR_Master"].forEach(function(name) {
        assert("Sheet '" + name + "' exists", ss.getSheetByName(name) !== null);
      });

    // Named ranges
    ["Zones_Config", "Checklist_Schema", "Daily_Data", "Weekly_Data",
      "CAPA_Data", "Photo_Data", "Summary_Data", "Admin_Log", "QR_Data"].forEach(function(name) {
        try {
          var range = ss.getRangeByName(name);
          assert("Named Range '" + name + "' resolvable", range !== null);
        } catch (e) {
          assert("Named Range '" + name + "' resolvable", false, e.message);
        }
      });

    // Triggers
    var triggers = ScriptApp.getProjectTriggers();
    assert("Trigger count ≤ 1", triggers.length <= 1, "Found " + triggers.length);

    // Drive folders
    try {
      var zc = getZoneConfig();
      var folderCount = 0;
      Object.keys(zc).forEach(function(id) {
        if (zc[id].driveFolderId) {
          try { DriveApp.getFolderById(zc[id].driveFolderId); folderCount++; }
          catch (e) { }
        }
      });
      assert("Drive folders accessible ≥ 6", folderCount >= 6, "Found " + folderCount);
    } catch (e) {
      assert("Drive folders", false, e.message);
    }

    // Core functions exist
    var coreFunctions = [
      "doGet", "doPost", "masterOrchestrator", "createCAPA", "updateCAPAStatus",
      "weeklyRollup", "monthlyRollup", "sendDigestEmails", "archiveOldData",
      "getZoneSummary", "getPlantSummary", "safeExecute", "validateZoneId", "sanitizeInput"
    ];
    coreFunctions.forEach(function(fn) {
      assert("Function '" + fn + "' exists", typeof eval(fn) === "function");
    });

    // _tg5sWho_ — suppresses placeholder names on every Telegram card
    if (typeof _tg5sWho_ === "function") {
      assert("_tg5sWho_ drops 'system'",  _tg5sWho_("system") === "");
      assert("_tg5sWho_ drops 'worker'",  _tg5sWho_("worker") === "");
      assert("_tg5sWho_ drops 'auditor'", _tg5sWho_("auditor") === "");
      assert("_tg5sWho_ strips email domain", _tg5sWho_("jane@x.com") === "jane");
      assert("_tg5sWho_ keeps a real name", _tg5sWho_("Ravi") === "Ravi");
    }

    // v2SafeCell_ — neutralises CSV/formula injection from client-entered names
    if (typeof v2SafeCell_ === "function") {
      assert("v2SafeCell_ quotes leading =", v2SafeCell_("=HYPERLINK(1)") === "'=HYPERLINK(1)");
      assert("v2SafeCell_ quotes leading @", v2SafeCell_("@x") === "'@x");
      assert("v2SafeCell_ leaves plain name", v2SafeCell_("Ravi") === "Ravi");
      assert("v2SafeCell_ caps length", v2SafeCell_(new Array(200).join("a")).length <= 100);
    }

  } catch (suiteError) {
    results.push({ name: "TEST SUITE ERROR", status: "FAIL", detail: suiteError.message });
    totalFailed++;
  }

  // ── Clean up sandbox ──
  try { ss.deleteSheet(sandbox); } catch (e) { }

  // ── Build results ──
  var elapsed = ((new Date().getTime()) - startTime.getTime()) / 1000;
  results.push({ name: "", status: "HEADER", detail: "" });
  results.push({ name: "═══════════════════════════════════════════", status: "HEADER", detail: "" });
  results.push({ name: "  RESULTS: " + totalPassed + " passed, " + totalFailed + " failed, " + totalSkipped + " skipped", status: "HEADER", detail: "" });
  results.push({ name: "  TIME: " + elapsed.toFixed(1) + "s", status: "HEADER", detail: "" });
  results.push({ name: "  " + (totalFailed === 0 ? "✅ ALL TESTS PASSED" : "❌ " + totalFailed + " TESTS FAILED"), status: "HEADER", detail: "" });
  results.push({ name: "═══════════════════════════════════════════", status: "HEADER", detail: "" });

  // Log results
  var logLines = results.map(function(r) {
    if (r.status === "HEADER" || r.status === "INFO") return r.name;
    var icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏭️";
    return icon + " " + r.status + ": " + r.name + (r.detail ? " — " + r.detail : "");
  });
  Logger.log(logLines.join("\n"));

  // Log to AdminLog
  logAdminAction_("runAllTests",
    totalPassed + " passed, " + totalFailed + " failed, " + totalSkipped + " skipped in " + elapsed.toFixed(1) + "s");

  // Display dialog
  var htmlContent = '<div style="font-family:monospace;font-size:11px;line-height:1.7;padding:10px;">';
  results.forEach(function(r) {
    if (r.status === "HEADER" || r.status === "INFO") {
      htmlContent += '<div style="font-weight:bold;margin-top:8px;color:#1a5276;">' + r.name + '</div>';
    } else {
      var color = r.status === "PASS" ? "#27ae60" : r.status === "FAIL" ? "#e74c3c" : "#f39c12";
      var icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⏭️";
      htmlContent += '<div style="color:' + color + ';">' + icon + ' ' + r.name +
        (r.detail ? ' <span style="color:#999;">— ' + r.detail + '</span>' : '') + '</div>';
    }
  });
  htmlContent += '</div>';

  var html = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(650)
    .setHeight(750)
    .setTitle("Test Results");

  try {
    SpreadsheetApp.getUi().showModalDialog(html,
      "PackMasters 5S Tests — " + (totalFailed === 0 ? "ALL PASSED ✅" : totalFailed + " FAILED ❌"));
  } catch (uiErr) {
    // If UI not available (trigger context), just log
    Logger.log("UI not available for test results display.");
  }

  // Log each failing test name for retrieval
  results.forEach(function(r) {
    if (r.status === "FAIL") {
      Logger.log("FAILED: " + r.name);
    }
  });

  var failureNames = results.filter(function(r) { return r.status === "FAIL"; }).map(function(r) { return r.name; });
  var failureDetails = results.filter(function(r) { return r.status === "FAIL"; }).map(function(r) { return r.name + ": " + (r.detail || ""); });

  return { passed: totalPassed, failed: totalFailed, skipped: totalSkipped, elapsed: elapsed, failures: failureNames, details: failureDetails };
}
