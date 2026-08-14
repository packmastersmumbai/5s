/**
 * ============================================================================
 * 25_Authentication.js — PackMasters 5S v2.0
 * Session management for the web app.
 * ============================================================================
 *
 * Login itself lives in 25b_PinAuth.js (PIN keypad). This file owns only the
 * session half of the contract that PIN auth writes into:
 *
 *   validateSession(token)   — SESSION_<token> lookup + expiry check
 *   logoutUser(token)        — drops the session property
 *   getCurrentUserInfo(token)— username/name/role for a valid token
 *
 * The old username/password stack (setupUsersSheet, authenticateUser, addUser,
 * changePassword, password hashing) was removed 2026-08-14 — it was reachable
 * only from the retired LoginPage.html, and setupUsersSheet() actively wrote a
 * 6-column Users schema that PIN login cannot read. See _unused/README.md.
 * ============================================================================
 */


// LOGIN FUNCTIONALITY
// ============================================================================


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




// ============================================================================
// SESSION CLEANUP — purge expired SESSION_* keys from ScriptProperties
// Install as a time-based trigger: every 6 hours
// ============================================================================


