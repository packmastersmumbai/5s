// Shared E2E helpers for PackMasters 5S (Playwright CLI, GAS iframe).
// Google auth: injects OAuth Bearer token via route interception so headless
// Chromium bypasses the Google sign-in wall (GAS access: ANYONE requires Google auth).
const PW = 'C:/Users/Appex/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const https = require('https');
const qs = require('querystring');
const fs = require('fs');

const EXEC = 'https://script.google.com/macros/s/AKfycbyYsCQfJvhorJglpwmpfYNt65659sM5HWKztNK1n5tzeB5wyaovrLpMRDYg95d6yKgQHg/exec';

// OAuth creds are read at runtime from the local (gitignored) ~/.clasprc.json —
// the same account that owns the GAS deployment. NEVER hardcode secrets here.
const _clasprc = JSON.parse(fs.readFileSync(require('os').homedir() + '/.clasprc.json', 'utf8'));
const _tok = (_clasprc.tokens && _clasprc.tokens.default) || _clasprc.token || _clasprc;
const OAUTH_CLIENT_ID     = _tok.client_id;
const OAUTH_CLIENT_SECRET = _tok.client_secret;
const OAUTH_REFRESH_TOKEN = _tok.refresh_token;

let _cachedToken = null;

async function getGoogleAccessToken() {
  if (_cachedToken) return _cachedToken;
  return new Promise((resolve, reject) => {
    const body = qs.stringify({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    });
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const obj = JSON.parse(d);
        if (obj.access_token) { _cachedToken = obj.access_token; resolve(obj.access_token); }
        else reject(new Error('token refresh failed: ' + (obj.error || d)));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function launch() {
  // Headed when E2E_HEADED=1 (visible browser); slow-mo aids observation.
  const headed = process.env.E2E_HEADED === '1';
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? (parseInt(process.env.E2E_SLOWMO, 10) || 150) : 0
  });
  return browser;
}

// Poll all frames until one contains the app shell (login form OR post-login content).
async function findAppFrame(page) {
  for (let i = 0; i < 60; i++) {
    for (const f of page.frames()) {
      try {
        const found = await f.evaluate(() =>
          !!(document.getElementById('loginForm') ||
             document.getElementById('mainApp') ||
             document.querySelector('.bottom-nav') ||
             document.querySelector('.sidebar') ||
             document.querySelector('.zone-grid') ||
             document.querySelector('.kpi-strip') ||
             document.querySelector('.action-card') ||
             document.querySelector('[class*="kpi"]') ||
             document.querySelector('[class*="zone"]') ||
             (document.body && document.body.innerText.length > 100 &&
              !document.querySelector('[class*="CryPo"]') &&
              !document.querySelector('[class*="signin"]')))
        );
        if (found) return f;
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// Create a new browser context with Google OAuth token injected as Authorization header.
async function newAuthContext(browser) {
  const token = await getGoogleAccessToken();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Inject Authorization header for all google.com requests so GAS allows the session
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('google.com') || url.includes('googleapis.com') || url.includes('googleusercontent.com')) {
      route.continue({ headers: { ...route.request().headers(), 'Authorization': 'Bearer ' + token } });
    } else {
      route.continue();
    }
  });
  return { ctx, token };
}

// Login as admin. Returns { ctx, page, frame, errors[] }. Retries once on flake.
async function loginAdmin(browser) {
  let lastErr = null;
  for (let tryN = 0; tryN < 2; tryN++) {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
    try {
      await page.goto(EXEC + '?action=login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const frame = await findAppFrame(page);
      if (!frame) throw new Error('app frame not found after 30s');

      // PIN login: pick user, tap PIN digits (auto-submits on 4th).
      const pinUser = process.env.E2E_ADMIN_USER || 'admin';
      const pin = process.env.E2E_ADMIN_PIN || '1234';
      await frame.waitForSelector('.user[data-id="' + pinUser + '"]', { timeout: 20000 });
      await frame.click('.user[data-id="' + pinUser + '"]');
      for (const d of pin.split('')) {
        await frame.click('.key[data-k="' + d + '"]');
        await page.waitForTimeout(120);
      }

      // After login the GAS sandbox iframe detaches and a new one loads from googleusercontent.com.
      // Re-acquire the frame that has actual app content (not the outer GAS wrapper).
      let newFrame = null;
      for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(600);
        for (const f of page.frames()) {
          if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
          try {
            const info = await f.evaluate(() => {
              const txt = document.body ? document.body.innerText : '';
              const hasLoginForm = !!document.getElementById('loginForm');
              const hasPostLogin = !!(document.querySelector('.bottom-nav') ||
                document.querySelector('.sidebar') ||
                document.querySelector('.kpi-strip') ||
                document.querySelector('.zone-grid') ||
                document.querySelector('.action-card') ||
                document.querySelector('[class*="logout"]') ||
                txt.includes('Logout') ||
                txt.includes('OPEN CAPAS') ||
                txt.includes('RED TAGS'));
              return { txt: txt.substring(0, 50), hasLoginForm, hasPostLogin };
            });
            if (!info.hasLoginForm && info.hasPostLogin) {
              newFrame = f;
              break;
            }
          } catch (_) {}
        }
        if (newFrame) break;
      }
      if (!newFrame) throw new Error('no post-login frame found after 30s');

      return { ctx, page, frame: newFrame, errors };
    } catch (e) {
      lastErr = e;
      await ctx.close();
    }
  }
  throw new Error('loginAdmin failed after retry: ' + (lastErr && lastErr.message));
}

// Extract the session token from a post-login frame (needed for URL navigation).
async function extractSessionToken(frame) {
  return frame.evaluate(() => {
    // Token appears in nav link hrefs
    const links = Array.from(document.querySelectorAll('[href*="token="], [onclick*="token="]'));
    for (const el of links) {
      const src = el.getAttribute('href') || el.getAttribute('onclick') || '';
      const m = src.match(/token=([a-f0-9\-]{20,})/i);
      if (m) return m[1];
    }
    return null;
  }).catch(() => null);
}

// Navigate to an action using the session token (URL nav with token keeps auth).
// Falls back to click nav if token extraction fails.
async function gotoAction(page, frame, action) {
  const token = await extractSessionToken(frame);
  if (token) {
    await page.goto(EXEC + '?v2=1&action=' + action + '&token=' + token, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return 'token-url-nav';
  }
  // Fallback: try clicking a nav link
  const clicked = await frame.evaluate((act) => {
    const links = Array.from(document.querySelectorAll(
      '.sidebar a, .bottom-nav a, nav a, [href*="action="]'
    ));
    const target = links.find(el => (el.getAttribute('href') || '').includes('action=' + act));
    if (target) { target.click(); return true; }
    return false;
  }, action).catch(() => false);
  if (clicked) { await page.waitForTimeout(2000); return 'click-nav'; }
  // Last resort: bare URL nav (session will drop but still useful for public pages)
  await page.goto(EXEC + '?v2=1&action=' + action, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return 'url-nav-no-token';
}

// Simple check-runner — verbatim from DWM e2e-lib.js
function makeRunner(label) {
  const results = [];
  return {
    async check(name, fn) {
      try {
        const ok = await fn();
        results.push({ name, pass: ok === true, detail: (ok === true ? '' : String(ok)) });
      } catch (e) {
        results.push({ name, pass: false, detail: 'THREW: ' + (e && e.message || e) });
      }
    },
    results,
    report() {
      const pass = results.filter(r => r.pass).length;
      console.log('\n===== ' + label + ' =====');
      results.forEach(r => console.log((r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.detail ? '  — ' + r.detail : '')));
      console.log('----- ' + pass + '/' + results.length + ' passed -----');
      return { pass, total: results.length };
    }
  };
}

module.exports = { launch, loginAdmin, findAppFrame, gotoAction, makeRunner, getGoogleAccessToken, newAuthContext, EXEC, chromium };
