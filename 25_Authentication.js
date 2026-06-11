/**
 * ============================================================================
 * 25_Authentication.js — PackMasters 5S v2.0
 * Username/Password Login System with Session Management
 * ============================================================================
 */

// ============================================================================
// SETUP: Create Users Sheet with Test Accounts
// ============================================================================

/**
 * Run this from Apps Script editor to set up login system:
 * Extensions > Apps Script > setupUsersSheet()
 *
 * Creates the Users sheet with test accounts and password hashes.
 * Safe to run multiple times — will delete and recreate.
 */
function setupUsersSheet() {
  try {
    Logger.log("\n🔄 Starting user setup...");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = "Users";

    // Step 1: Delete existing sheet if it exists
    Logger.log("  Step 1: Checking for existing Users sheet...");
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      Logger.log("    → Found existing sheet, deleting...");
      ss.deleteSheet(sheet);
      Logger.log("    ✅ Deleted");
    } else {
      Logger.log("    → No existing sheet, creating new...");
    }

    // Step 2: Create new Users sheet
    Logger.log("  Step 2: Creating new Users sheet...");
    sheet = ss.insertSheet(sheetName);
    sheet.setTabColor("#FF9800"); // Orange tab
    Logger.log("    ✅ Sheet created");

    // Step 3: Add headers
    Logger.log("  Step 3: Adding headers...");
    var headers = ["username", "password_hash", "full_name", "role", "is_active", "created_date"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log("    ✅ Headers added");

    // Step 4: Hash passwords and create test data
    Logger.log("  Step 4: Hashing passwords and creating test accounts...");
    var testAccounts = [
      { username: "admin", password: "Admin@123", fullName: "Administrator", role: "ADMIN" },
      { username: "manager", password: "Manager@123", fullName: "Manager User", role: "MANAGER" },
      { username: "zonelead", password: "ZoneLead@123", fullName: "Zone Lead", role: "ZONE_LEAD" },
      { username: "auditor", password: "Auditor@123", fullName: "Quality Auditor", role: "AUDITOR" },
      { username: "viewer", password: "Viewer@123", fullName: "Viewer Account", role: "VIEWER" }
    ];

    var testData = [];
    testAccounts.forEach(function(account) {
      var salt = generateSalt_();
      var hash = hashPassword_(account.password, salt);
      Logger.log("    → Hashing: " + account.username + " (" + account.role + ")");
      testData.push([
        account.username,
        salt + ':' + hash,
        account.fullName,
        account.role,
        true,
        new Date()
      ]);
    });
    Logger.log("    ✅ Passwords hashed");

    // Step 5: Write data to sheet
    Logger.log("  Step 5: Writing user data to sheet...");
    sheet.getRange(2, 1, testData.length, testData[0].length).setValues(testData);
    Logger.log("    ✅ " + testData.length + " users created");

    // Step 6: Format sheet
    Logger.log("  Step 6: Formatting sheet...");
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.autoResizeColumns(1, headers.length);
    Logger.log("    ✅ Formatting applied");

    // Step 7: Protect sheet
    Logger.log("  Step 7: Protecting sheet...");
    try {
      sheet.protect()
        .setDescription("Users database - do not edit without authorization")
        .addEditor(Session.getActiveUser().getEmail());
      Logger.log("    ✅ Sheet protected");
    } catch (protectErr) {
      Logger.log("    ⚠️ Could not protect sheet: " + protectErr.message);
    }

    // Summary
    Logger.log("\n✅ SETUP COMPLETE!");
    Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Logger.log("Test User Credentials (passwords set — do not log plaintext):");
    Logger.log("  🟢 admin → ADMIN");
    Logger.log("  🟢 manager → MANAGER");
    Logger.log("  🟢 zonelead → ZONE_LEAD");
    Logger.log("  🟢 auditor → AUDITOR");
    Logger.log("  🟢 viewer → VIEWER");
    Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Logger.log("\n📲 Next: Go to your web app and log in!");

    // UI notification
    SpreadsheetApp.getUi().alert(
      "✅ Setup Complete!\n\n" +
      "Users sheet created with 5 test accounts.\n\n" +
      "Check the Execution Log (Ctrl+Enter area) for details.\n\n" +
      "You can now log in with:\n" +
      "  admin / Admin@123\n" +
      "  manager / Manager@123\n" +
      "  (and 3 others)"
    );

  } catch (error) {
    Logger.log("\n❌ ERROR during setup:");
    Logger.log("  " + error.message);
    Logger.log("  " + error.stack);

    SpreadsheetApp.getUi().alert(
      "❌ Setup Failed!\n\n" +
      "Error: " + error.message + "\n\n" +
      "Check the Execution Log for details (Ctrl+Enter)."
    );
  }
}

// ============================================================================
// PASSWORD HASHING
// ============================================================================

/**
 * Hash password with an optional salt using SHA-256.
 * Returns a hex digest string.
 */
function hashPassword_(password, salt) {
  var saltedInput = password + (salt || '');
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, saltedInput);
  return signature.map(function(b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

/**
 * Generate a random 32-character hex salt.
 */
function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * Hash password using Utilities.computeDigest
 * @deprecated Use hashPassword_() with a salt for new accounts.
 *             Kept for backwards-compatible plain-SHA-256 comparison only.
 */
function hashPassword(password) {
  return hashPassword_(password, '');
}

/**
 * Verify password against a stored value.
 * Stored value is either:
 *   - New format:  "salt:hash"  (salted SHA-256)
 *   - Legacy format: plain 64-char hex hash (unsalted SHA-256)
 */
function verifyPassword(password, storedValue) {
  if (storedValue && storedValue.indexOf(':') !== -1) {
    // New salted format: "salt:hash"
    var parts = storedValue.split(':');
    var storedSalt = parts[0];
    var storedHash = parts[1];
    return hashPassword_(password, storedSalt) === storedHash;
  }
  // Legacy: plain unsalted SHA-256 — backwards-compatible fallback
  return hashPassword_(password, '') === storedValue;
}

// ============================================================================
// LOGIN FUNCTIONALITY
// ============================================================================

/**
 * Authenticate user and return session token if valid
 * @param {string} username
 * @param {string} password
 * @returns {Object} { success: bool, token: string, role: string, message: string }
 */
function authenticateUser(username, password) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Users");
    if (!sheet) {
      return { success: false, message: "Users database not found. Run setupUsersSheet() first." };
    }

    // Rate limiting: max 5 failed attempts per 15 minutes
    var rateLimitKey = 'LOGIN_ATTEMPTS_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_');
    var cache = CacheService.getScriptCache();
    try {
      var attemptsData = cache.get(rateLimitKey);
      var attempts = attemptsData ? JSON.parse(attemptsData) : { count: 0, firstAttempt: Date.now() };

      // Reset window if older than 15 minutes
      if (Date.now() - attempts.firstAttempt > 15 * 60 * 1000) {
        attempts = { count: 0, firstAttempt: Date.now() };
      }

      if (attempts.count >= 5) {
        logSecurityEvent_('LOGIN_BLOCKED', 'Rate limit exceeded for: ' + username, username);
        return { success: false, error: 'Account temporarily locked. Try again in 15 minutes.' };
      }
    } catch(e) { /* cache unavailable, allow attempt */ }

    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var storedUsername = String(row[0]).toLowerCase().trim();
      var storedHash = String(row[1]);
      var role = String(row[3]).trim();
      var isActive = row[4];

      if (storedUsername === username.toLowerCase().trim()) {
        // User found
        if (!isActive) {
          return { success: false, message: "Account is inactive. Contact admin." };
        }

        // Verify password
        if (!verifyPassword(password, storedHash)) {
          logSecurityEvent_("LOGIN_FAILED", "authenticateUser", username, { reason: "Invalid password" });
          // On failed auth — increment rate limit counter
          try {
            var attemptsData2 = CacheService.getScriptCache().get(rateLimitKey);
            var attempts2 = attemptsData2 ? JSON.parse(attemptsData2) : { count: 0, firstAttempt: Date.now() };
            attempts2.count++;
            CacheService.getScriptCache().put(rateLimitKey, JSON.stringify(attempts2), 900); // 15 min TTL
          } catch(e) { /* silent */ }
          return { success: false, message: "Invalid username or password." };
        }

        // Login successful - create session token
        var token = Utilities.getUuid();
        var sessionKey = "SESSION_" + token;
        var sessionData = {
          username: username,
          role: role,
          loginTime: new Date().getTime(),
          expiryTime: new Date().getTime() + (8 * 60 * 60 * 1000) // 8 hours
        };

        // Store in ScriptProperties
        var props = PropertiesService.getScriptProperties();
        props.setProperty(sessionKey, JSON.stringify(sessionData));

        // CRITICAL: Sync user role to USER_ROLES property for RBAC to work
        var userRoles = JSON.parse(props.getProperty("USER_ROLES") || "{}");
        userRoles[username] = [role]; // Store as array to match v2GetUserRoles_ format
        props.setProperty("USER_ROLES", JSON.stringify(userRoles));

        logSecurityEvent_("LOGIN_SUCCESS", "authenticateUser", username, { role: role });

        // On successful auth — clear rate limit
        try { CacheService.getScriptCache().remove(rateLimitKey); } catch(e) {}

        return {
          success: true,
          token: token,
          role: role,
          username: username,
          message: "Login successful"
        };
      }
    }

    // User not found
    logSecurityEvent_("LOGIN_FAILED", "authenticateUser", username, { reason: "User not found" });
    // On failed auth — increment rate limit counter
    try {
      var attemptsData2 = CacheService.getScriptCache().get(rateLimitKey);
      var attempts2 = attemptsData2 ? JSON.parse(attemptsData2) : { count: 0, firstAttempt: Date.now() };
      attempts2.count++;
      CacheService.getScriptCache().put(rateLimitKey, JSON.stringify(attempts2), 900); // 15 min TTL
    } catch(e) { /* silent */ }
    return { success: false, message: "Invalid username or password." };

  } catch (e) {
    Logger.log("Error in authenticateUser: " + e.message);
    return { success: false, message: "A server error occurred. Please try again." };
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Validate session token
 * @param {string} token
 * @returns {Object} { valid: bool, username: string, role: string }
 */
function validateSession(token) {
  try {
    if (!token) return { valid: false };

    var props = PropertiesService.getScriptProperties();
    var sessionKey = "SESSION_" + token;
    var sessionJson = props.getProperty(sessionKey);

    if (!sessionJson) {
      return { valid: false };
    }

    var session = JSON.parse(sessionJson);
    var now = new Date().getTime();

    if (now > session.expiryTime) {
      props.deleteProperty(sessionKey);
      return { valid: false };
    }

    return {
      valid: true,
      username: session.username,
      role: session.role
    };
  } catch (e) {
    Logger.log("Error validating session: " + e.message);
    return { valid: false };
  }
}

/**
 * Logout user (invalidate session)
 * @param {string} token
 */
function logoutUser(token) {
  try {
    var session = validateSession(token);
    if (session.valid) {
      var props = PropertiesService.getScriptProperties();
      props.deleteProperty("SESSION_" + token);
      logSecurityEvent_("LOGOUT", "logoutUser", session.username, {});
      return { success: true };
    }
    return { success: false };
  } catch (e) {
    Logger.log("Error in logoutUser: " + e.message);
    return { success: false };
  }
}

/**
 * Get current session info from URL token
 * @returns {Object} { authenticated: bool, username: string, role: string }
 */
function getCurrentSessionFromUrl(token) {
  try {
    if (!token) {
      return { authenticated: false };
    }
    var session = validateSession(token);
    return {
      authenticated: session.valid,
      username: session.valid ? session.username : null,
      role: session.valid ? session.role : null,
      token: token
    };
  } catch (e) {
    return { authenticated: false };
  }
}

/**
 * Get current user info for display (called from frontend)
 * @param {string} token - Session token from URL
 * @returns {Object} { success: bool, username: string, role: string, message: string }
 */
function getCurrentUserInfo(token) {
  try {
    var session = validateSession(token);
    if (!session.valid) {
      return { success: false, message: "Session invalid or expired" };
    }

    return {
      success: true,
      username: session.username,
      role: session.role
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Add new user (ADMIN only)
 * @param {string} username
 * @param {string} password
 * @param {string} fullName
 * @param {string} role
 */
function addUser(token, username, password, fullName, role) {
  try {
    var callerSession = validateSession(token);
    if (!callerSession.valid || callerSession.role !== 'ADMIN') {
      return { success: false, message: "Requires ADMIN role." };
    }
    var ss = (typeof v2GetSpreadsheet_ === 'function') ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Users");
    if (!sheet) {
      return { success: false, message: "Users sheet not found" };
    }

    // Check if user exists
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === username.toLowerCase()) {
        return { success: false, message: "Username already exists" };
      }
    }

    // Add new user
    var salt = generateSalt_();
    var hash = hashPassword_(password, salt);
    sheet.appendRow([
      username,
      salt + ':' + hash,
      fullName,
      role,
      true,
      new Date()
    ]);

    logSecurityEvent_("USER_CREATED", "addUser", username, { role: role });
    return { success: true, message: "User " + username + " created" };

  } catch (e) {
    Logger.log("Error adding user: " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Change user password
 * @param {string} username
 * @param {string} oldPassword
 * @param {string} newPassword
 */
function changePassword(username, oldPassword, newPassword) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Users");
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === username.toLowerCase()) {
        // Verify old password
        if (!verifyPassword(oldPassword, String(data[i][1]))) {
          return { success: false, message: "Current password is incorrect" };
        }

        // Update password with new salt
        var newSalt = generateSalt_();
        var newHash = hashPassword_(newPassword, newSalt);
        sheet.getRange(i + 1, 2).setValue(newSalt + ':' + newHash);
        logSecurityEvent_("PASSWORD_CHANGED", "changePassword", username, {});
        return { success: true, message: "Password updated" };
      }
    }

    return { success: false, message: "User not found" };

  } catch (e) {
    Logger.log("Error changing password: " + e.message);
    return { success: false, message: e.message };
  }
}


// ============================================================================
// SESSION CLEANUP — purge expired SESSION_* keys from ScriptProperties
// Install as a time-based trigger: every 6 hours
// ============================================================================

/**
 * Deletes all expired SESSION_* keys from ScriptProperties.
 * Prevents quota exhaustion (~500KB limit).
 * Should be installed as a time-based trigger running every 6 hours.
 */
function purgeExpiredSessions() {
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var now = new Date().getTime();
    var deleted = 0;

    Object.keys(all).forEach(function(key) {
      if (key.indexOf('SESSION_') !== 0) return;
      try {
        var session = JSON.parse(all[key]);
        if (session && session.expiryTime && session.expiryTime < now) {
          props.deleteProperty(key);
          deleted++;
        }
      } catch(e) {
        // Malformed session entry — delete it
        props.deleteProperty(key);
        deleted++;
      }
    });

    // Quota guard: warn if approaching 400KB
    var totalSize = JSON.stringify(props.getProperties()).length;
    if (totalSize > 400000) {
      Logger.log("⚠️ ScriptProperties size: " + totalSize + " bytes — approaching 500KB limit");
    }

    Logger.log("✅ purgeExpiredSessions: deleted " + deleted + " expired sessions. Props size: " + totalSize + " bytes");
    return deleted;
  } catch(e) {
    Logger.log("Error in purgeExpiredSessions: " + e.message);
    return 0;
  }
}

/**
 * Installs the session cleanup trigger (run once from GAS editor).
 * Safe to run multiple times — removes duplicate triggers first.
 */
function installSessionCleanupTrigger() {
  // Remove existing triggers for this function
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'purgeExpiredSessions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Install new 6-hour trigger
  ScriptApp.newTrigger('purgeExpiredSessions')
    .timeBased()
    .everyHours(6)
    .create();
  Logger.log("✅ Session cleanup trigger installed (every 6 hours)");
}
