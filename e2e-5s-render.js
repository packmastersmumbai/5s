// PackMasters 5S — E2E smoke-test render checks
// Run: node e2e-5s-render.js
const { launch, loginAdmin, findAppFrame, gotoAction, makeRunner, EXEC } = require('./e2e-lib-5s');

// Re-acquire the sandbox frame after a page navigation (URL changes, old frame detaches).
// Expects the live app content (not the GAS outer wrapper, not login form).
async function reAcquireFrame(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 25000);
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      // The real app runs in a googleusercontent.com sandbox iframe
      if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
      try {
        const info = await f.evaluate(() => {
          const txt = document.body ? document.body.innerText : '';
          return {
            hasLoginForm: !!document.getElementById('loginForm'),
            isReportAbuse: txt.includes('Report abuse'),
            isSignIn: txt.includes('Sign in') || txt.includes('SIGN IN'),
            txtLen: txt.length
          };
        });
        if (!info.hasLoginForm && !info.isReportAbuse && info.txtLen > 50) return f;
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function main() {
  const runner = makeRunner('PackMasters 5S Render Smoke Tests');
  let browser, ctx, page, frame, errors;

  // ── LAUNCH & LOGIN ───────────────────────────────────────────────────────
  try {
    browser = await launch();
    ({ ctx, page, frame, errors } = await loginAdmin(browser));
  } catch (e) {
    console.error('FATAL: could not launch/login —', e.message);
    process.exit(2);
  }

  await runner.check('Login succeeds (post-login home screen reached, no login form)', async () => {
    const loginVisible = await frame.evaluate(() => {
      const f = document.getElementById('loginForm');
      return f ? f.offsetParent !== null : false;
    }).catch(() => null);
    if (loginVisible) return 'login form still visible';

    const txt = await frame.evaluate(() => document.body.innerText).catch(() => '');
    if (txt.length > 80 && !txt.includes('SIGN IN')) return true;
    return 'unexpected post-login content: ' + txt.substring(0, 100);
  });

  // ── SESSION PERSISTENCE DISCOVERY ───────────────────────────────────────
  // The 5S app uses a per-session token in URLs (e.g. ?token=uuid).
  // URL nav WITH token keeps auth; URL nav WITHOUT token redirects to login.
  let sessionMode = 'token-url-nav';  // discovered below

  // ── INSIGHTS PAGE ────────────────────────────────────────────────────────
  let insightsBottomNavCount = 'N/A';

  const insightsNavMode = await gotoAction(page, frame, 'insights');
  sessionMode = insightsNavMode;
  console.log('  [info] Insights nav mode:', insightsNavMode);
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 20000);

  await runner.check('Insights: page reached and has content', async () => {
    if (!frame) return 'frame unavailable after nav to insights';
    const txt = await frame.evaluate(() => document.body.innerText.substring(0,200)).catch(e => 'ERR:'+e.message);
    if (txt.includes('Analytics') || txt.includes('Insights') || txt.includes('%')) return true;
    return 'unexpected content: ' + txt.substring(0,100);
  });

  await runner.check('Insights: KPI value renders (numeric % or KPI element)', async () => {
    if (!frame) return 'frame unavailable';
    // Wait up to 15s for KPI data to load
    for (let i = 0; i < 30; i++) {
      const result = await frame.evaluate(() => {
        const body = document.body.innerText || '';
        const hasPct = /\d+(\.\d+)?%/.test(body);
        const hasKpi = !!(document.querySelector('.kpi-strip') ||
                          document.querySelector('.kpi-card') ||
                          document.querySelector('.kpi-value') ||
                          document.querySelector('[class*="kpi"]') ||
                          document.querySelector('.plant-avg') ||
                          document.querySelector('[class*="score"]'));
        return { hasPct, hasKpi };
      }).catch(() => ({ hasPct: false, hasKpi: false }));
      if (result.hasPct || result.hasKpi) return true;
      await page.waitForTimeout(500);
    }
    const txt = await frame.evaluate(() => document.body.innerText.substring(0,200)).catch(() => '');
    return 'no KPI value found. page: ' + txt.replace(/\n/g,' ').substring(0,150);
  });

  await runner.check('Insights: EXACTLY ONE .bottom-nav element (double-nav bug fix)', async () => {
    if (!frame) return 'frame unavailable';
    const count = await frame.evaluate(() =>
      document.querySelectorAll('.bottom-nav').length
    ).catch(() => -1);
    insightsBottomNavCount = count;
    if (count === 1) return true;
    return '.bottom-nav count = ' + count + ' (expected 1)';
  });

  await runner.check('Insights: no uncaught page errors', async () => {
    const pageErrs = errors.filter(e => e.startsWith('PAGEERR:'));
    if (pageErrs.length === 0) return true;
    return 'page errors: ' + pageErrs.join('; ');
  });

  // ── ACTION LIST ──────────────────────────────────────────────────────────
  const alNavMode = await gotoAction(page, frame, 'actionlist');
  console.log('  [info] ActionList nav mode:', alNavMode);
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 20000);

  await runner.check('Action List: at least one action card renders', async () => {
    if (!frame) return 'frame unavailable after nav to actionlist';
    for (let i = 0; i < 30; i++) {
      const count = await frame.evaluate(() =>
        document.querySelectorAll('.action-card, .capa-card, .action-item, [class*="action-card"], [class*="capa-item"], [class*="action-item"]').length
      ).catch(() => 0);
      if (count > 0) return true;
      await page.waitForTimeout(500);
    }
    // Also accept: "No actions" message (valid empty state)
    const txt = await frame.evaluate(() => document.body.innerText).catch(() => '');
    if (/no.*(action|capa|item)/i.test(txt) || txt.includes('empty') || txt.includes('No open')) {
      return 'no action cards (empty state); page: ' + txt.replace(/\n/g,' ').substring(0,100);
    }
    return 'no action cards found; page: ' + txt.replace(/\n/g,' ').substring(0,150);
  });

  await runner.check('Action List: #recordDetailModal exists in DOM', async () => {
    if (!frame) return 'frame unavailable';
    const exists = await frame.evaluate(() =>
      !!document.getElementById('recordDetailModal')
    ).catch(() => false);
    return exists === true ? true : '#recordDetailModal not found in DOM';
  });

  // ── RED TAG FORM ─────────────────────────────────────────────────────────
  // Route: ?v2=1&action=raiseredtag  (from routing switch in 20_EnhancedWebApp.js line 104)
  let zoneOptionCount = 'N/A';

  const rtNavMode = await gotoAction(page, frame, 'raiseredtag');
  console.log('  [info] RedTag nav mode:', rtNavMode);
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 20000);

  await runner.check('Red Tag Form: zone <select> has >= 20 options (live getAllZoneIds)', async () => {
    if (!frame) return 'frame unavailable after nav to raiseredtag';
    // Wait up to 20s for zone select to populate
    for (let i = 0; i < 40; i++) {
      const count = await frame.evaluate(() => {
        const sel = document.querySelector('select#zone, select[name="zone"], select');
        return sel ? sel.options.length : 0;
      }).catch(() => 0);
      if (count >= 20) { zoneOptionCount = count; return true; }
      if (count > 0) { zoneOptionCount = count; }
      await page.waitForTimeout(500);
    }
    const txt = await frame.evaluate(() => document.body.innerText.substring(0,200)).catch(() => '');
    return 'zone select has ' + zoneOptionCount + ' options (expected >= 20); page: ' + txt.replace(/\n/g,' ').substring(0,100);
  });

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  const { pass, total } = runner.report();
  console.log('\n[META] session persistence mode: ' + sessionMode + ' (token extracted from nav links after login; URL nav with token keeps auth)');
  console.log('[META] .bottom-nav count on Insights: ' + insightsBottomNavCount);
  console.log('[META] zone <select> option count (Red Tag Form): ' + zoneOptionCount);
  const consoleErrs = errors.filter(e => !e.startsWith('PAGEERR:'));
  const pageErrs = errors.filter(e => e.startsWith('PAGEERR:'));
  console.log('[META] console errors captured: ' + consoleErrs.length + (consoleErrs.length ? ' — ' + consoleErrs.slice(0,3).join('; ') : ''));
  console.log('[META] page errors captured: ' + pageErrs.length + (pageErrs.length ? ' — ' + pageErrs.slice(0,3).join('; ') : ''));

  await browser.close();
  process.exit(pass === total ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
