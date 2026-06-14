/**
 * ============================================================================
 * 25b_PinAuth.js — PackMasters 5S
 * PIN-based login (ported from TaskFlow DWM). Replaces username/password auth.
 *
 * Preserves the 5S session contract: writes SESSION_<token> to ScriptProperties
 * in the same shape authenticateUser() used, and syncs USER_ROLES, so
 * validateSession()/handleV2Route_()/params.currentRole keep working unchanged.
 *
 * Users sheet schema (0-indexed):
 *   0 username 1 pin_hash 2 salt 3 full_name 4 role 5 email
 *   6 avatar_color 7 is_active 8 last_seen_at 9 failed_attempts 10 locked_until 11 created_date
 * ============================================================================
 */

var PIN_USERS_SHEET = "Users";
var PIN_SESSION_HOURS = 8;
var PIN_MAX_ATTEMPTS = 5;
var PIN_LOCK_MINUTES = 15;

/** SHA-256 hex of pin+salt (same algorithm as DWM hashPin). */
function hashPin(pin, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(pin) + String(salt), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Active users for the login picker. id = username. */
function getUsersForLogin() {
  try {
    var sheet = v2GetSpreadsheet_().getSheetByName(PIN_USERS_SHEET);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var active = row[7];
      var isActive = (active === true || active === 1 || String(active).toUpperCase() === 'TRUE');
      if (!isActive) continue;
      out.push({
        id: String(row[0] || ''),
        name: String(row[3] || row[0] || ''),
        role: String(row[4] || 'VIEWER').toUpperCase(),
        avatarColor: String(row[6] || '#1A73E8')
      });
    }
    return out;
  } catch (e) {
    return [{ id: '__error__', name: 'Sheet error: ' + e.message, role: '', avatarColor: '#EA4335' }];
  }
}

/**
 * Validate a PIN for a user (id = username). On success creates a 5S session.
 * Returns { success:true, token, userId, name, role } or
 *         { error:'invalid_pin'|'locked'|'user_not_found', attemptsLeft?, minutesLeft? }
 */
function validatePin(userId, pin) {
  try {
    var sheet = v2GetSpreadsheet_().getSheetByName(PIN_USERS_SHEET);
    if (!sheet) return { error: 'user_not_found' };
    var data = sheet.getDataRange().getValues();
    var nowDate = new Date();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[0]) !== String(userId)) continue;

      var active = row[7];
      var isActive = (active === true || active === 1 || String(active).toUpperCase() === 'TRUE');
      if (!isActive) return { error: 'user_not_found' };

      var lockedUntil = row[10] ? new Date(row[10]) : null;
      if (lockedUntil && lockedUntil > nowDate) {
        return { error: 'locked', minutesLeft: Math.ceil((lockedUntil - nowDate) / 60000) };
      }

      var inputHash = hashPin(pin, row[2]);
      if (inputHash !== String(row[1])) {
        var attempts = (parseInt(row[9], 10) || 0) + 1;
        if (attempts >= PIN_MAX_ATTEMPTS) {
          var lockTime = new Date(nowDate.getTime() + PIN_LOCK_MINUTES * 60 * 1000);
          sheet.getRange(i + 1, 10, 1, 2).setValues([[attempts, lockTime.toISOString()]]);
        } else {
          sheet.getRange(i + 1, 10).setValue(attempts);
        }
        if (typeof logSecurityEvent_ === 'function') {
          logSecurityEvent_("PIN_LOGIN_FAILED", "validatePin", String(row[0]), { attempts: attempts });
        }
        return { error: 'invalid_pin', attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - attempts) };
      }

      // Success — reset lockout, stamp last_seen
      sheet.getRange(i + 1, 9).setValue(nowDate);          // last_seen_at
      sheet.getRange(i + 1, 10, 1, 2).setValues([[0, '']]); // failed_attempts, locked_until

      var username = String(row[0]);
      var role = String(row[4] || 'VIEWER').toUpperCase();
      var token = Utilities.getUuid();

      var props = PropertiesService.getScriptProperties();
      props.setProperty("SESSION_" + token, JSON.stringify({
        username: username,
        role: role,
        loginTime: nowDate.getTime(),
        expiryTime: nowDate.getTime() + (PIN_SESSION_HOURS * 60 * 60 * 1000)
      }));
      var userRoles = JSON.parse(props.getProperty("USER_ROLES") || "{}");
      userRoles[username] = [role];
      props.setProperty("USER_ROLES", JSON.stringify(userRoles));

      if (typeof logSecurityEvent_ === 'function') {
        logSecurityEvent_("PIN_LOGIN_SUCCESS", "validatePin", username, { role: role });
      }

      return {
        success: true, token: token, userId: username,
        name: String(row[3] || username), role: role
      };
    }
    return { error: 'user_not_found' };
  } catch (e) {
    Logger.log("validatePin error: " + e.message);
    throw new Error('validatePin: ' + e.message);
  }
}

/**
 * Seed the Users sheet with the PIN roster (mirrors DWM users, 5S roles).
 * Safe to re-run — deletes and recreates. PINs are hashed; plaintext never stored.
 */
function seedUsers() {
  var ss = v2GetSpreadsheet_();
  var existing = ss.getSheetByName(PIN_USERS_SHEET);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(PIN_USERS_SHEET);
  sheet.setTabColor("#FF9800");

  var headers = ["username", "pin_hash", "salt", "full_name", "role", "email",
                 "avatar_color", "is_active", "last_seen_at", "failed_attempts",
                 "locked_until", "created_date"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // username, full_name, role, email, avatarColor, tempPin
  // PINs mirror DWM exactly (recovered from DWM users sheet salt+hash).
  var roster = [
    ["admin",   "Admin",   "ADMIN",     "",                       "#1A73E8", "1234"],
    ["tbm",     "TBM",     "ADMIN",     "tu55h4r@gmail.com",      "#1A73E8", "0000"],
    ["bbm",     "BBM",     "ADMIN",     "",                       "#7C3AED", "9999"],
    ["rajesh",  "Rajesh",  "ZONE_LEAD", "",                       "#10B981", "4444"],
    ["khushi",  "Khushi",  "MANAGER",   "khushi009810@gmail.com", "#34A853", "1111"],
    ["shikha",  "Shikha",  "MANAGER",   "",                       "#EC4899", "7777"],
    ["anuj",    "Anuj",    "ZONE_LEAD", "pathakanuj142@gmail.com","#9334E6", "2222"],
    ["santosh", "Santosh", "ZONE_LEAD", "",                       "#EA4335", "3333"]
  ];

  var now = new Date();
  var rows = roster.map(function (u) {
    var salt = Utilities.getUuid();
    return [u[0], hashPin(u[5], salt), salt, u[1], u[2], u[3], u[4], true, "", 0, "", now];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setColumnWidth(2, 60); sheet.setColumnWidth(3, 60); // hide-ish hash/salt
  Logger.log("Seeded " + rows.length + " PIN users.");
  return { ok: true, count: rows.length, users: roster.map(function (u) { return u[0] + " (" + u[2] + ")"; }) };
}
