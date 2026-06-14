// PackMasters 5S — E2E for merged Analytics/Insights (InsightsView) page
// Run: E2E_HEADED=1 node e2e-5s-insights.js
'use strict';
const { launch, loginAdmin, findAppFrame, gotoAction, makeRunner, EXEC, chromium } = require('./e2e-lib-5s');

// Re-acquire the sandbox frame after navigation.
async function reAcquireFrame(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 30000);
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
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
        if (!info.hasLoginForm && !info.isReportAbuse && !info.isSignIn && info.txtLen > 50) return f;
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// Wait for selector to appear in frame (polls every 500ms).
async function waitForSel(frame, sel, timeoutMs, page) {
  if (!frame) return false;
  const pageRef = page || (frame.page ? frame.page() : null);
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    try {
      const found = await frame.evaluate((s) => !!document.querySelector(s), sel);
      if (found) return true;
    } catch (_) {}
    if (pageRef) await pageRef.waitForTimeout(500);
    else await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const runner = makeRunner('PackMasters 5S — InsightsView E2E');
  let browser, ctx, page, frame, errors;

  // ── LAUNCH & LOGIN ──────────────────────────────────────────────────────────
  try {
    browser = await launch();
    ({ ctx, page, frame, errors } = await loginAdmin(browser));
  } catch (e) {
    console.error('FATAL: could not launch/login —', e.message);
    process.exit(2);
  }

  // Filter out the harmless SW 404 from pageerrors
  const pageErrors = [];
  page.on('pageerror', e => {
    if (!e.message.includes('sw.js') && !e.message.includes('ServiceWorker') && !e.message.includes('404')) {
      pageErrors.push(e.message);
    }
  });

  // ── NAVIGATE TO insights ────────────────────────────────────────────────────
  await gotoAction(page, frame, 'insights');
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 30000);

  // ── CHECK 1: Page loads; KPI strip numeric value; exactly ONE .bottom-nav ──
  let kpiText = '';
  await runner.check('1a. action=insights page loads and has Insights/Analytics content', async () => {
    if (!frame) return 'frame unavailable after nav to insights';
    const txt = await frame.evaluate(() => document.body.innerText.substring(0, 300)).catch(e => 'ERR:' + e.message);
    if (txt.includes('Analytics') || txt.includes('Insights') || txt.includes('SQCDP') || txt.includes('%')) return true;
    return 'unexpected content: ' + txt.substring(0, 100);
  });

  await runner.check('1b. KPI strip renders a numeric plant-average value', async () => {
    if (!frame) return 'frame unavailable';
    // Wait up to 20s for KPI data
    for (let i = 0; i < 40; i++) {
      const val = await frame.evaluate(() => {
        const strip = document.querySelector('.kpi-strip');
        if (!strip) return null;
        const kpiVal = strip.querySelector('.kpi-value');
        return kpiVal ? kpiVal.textContent.trim() : null;
      }).catch(() => null);
      if (val && /\d/.test(val)) { kpiText = val; return true; }
      await page.waitForTimeout(500);
    }
    const html = await frame.evaluate(() => {
      const el = document.getElementById('iv-body');
      return el ? el.innerHTML.substring(0, 400) : 'no iv-body';
    }).catch(() => '');
    return 'KPI strip not found or no numeric value after 20s. iv-body snippet: ' + html.substring(0, 200);
  });

  await runner.check('1c. Exactly ONE .bottom-nav element (no double-nav)', async () => {
    if (!frame) return 'frame unavailable';
    const count = await frame.evaluate(() => document.querySelectorAll('.bottom-nav').length).catch(() => -1);
    if (count === 1) return true;
    return 'Expected 1 .bottom-nav, found ' + count;
  });

  // ── CHECK 2: Route alias 'sqcdp' serves same Insights page ─────────────────
  let sqcdpAliasFrame = null;
  await runner.check('2. action=sqcdp alias serves same Insights page (KPI strip present)', async () => {
    await gotoAction(page, frame, 'sqcdp');
    await page.waitForTimeout(1000);
    sqcdpAliasFrame = await reAcquireFrame(page, 30000);
    if (!sqcdpAliasFrame) return 'frame unavailable after nav to sqcdp alias';
    for (let i = 0; i < 40; i++) {
      const found = await sqcdpAliasFrame.evaluate(() => !!document.querySelector('.kpi-strip')).catch(() => false);
      if (found) return true;
      await page.waitForTimeout(500);
    }
    const txt = await sqcdpAliasFrame.evaluate(() => document.body.innerText.substring(0, 200)).catch(() => '');
    return 'KPI strip not found on sqcdp alias after 20s. Content: ' + txt.substring(0, 120);
  });

  // Navigate back to insights for remaining checks
  // Use sqcdpAliasFrame as base if available (frame may be stale after alias nav)
  const navFrame = sqcdpAliasFrame || frame;
  await gotoAction(page, navFrame, 'insights');
  await page.waitForTimeout(2000);
  frame = await reAcquireFrame(page, 35000);
  console.log('  [info] frame after insights re-nav:', frame ? 'OK' : 'NULL');
  // Wait for full load
  if (frame) await waitForSel(frame, '.kpi-strip', 25000, page);

  // ── CHECK 3: SQCDP section — ALL view: plant green summary ─────────────────
  let plantSummaryText = '';
  await runner.check('3. SQCDP ALL-view: plant green summary renders (% + green count/total)', async () => {
    if (!frame) return 'frame unavailable';
    // Ensure ALL pill is active (it is by default)
    await frame.evaluate(() => {
      const allBtn = Array.from(document.querySelectorAll('.iv-filter-btn')).find(b => b.textContent.trim() === 'ALL');
      if (allBtn) allBtn.click();
    }).catch(() => {});
    // Wait for SQCDP section to load
    for (let i = 0; i < 40; i++) {
      const info = await frame.evaluate(() => {
        const sec = document.getElementById('iv-sqcdp-section');
        if (!sec) return null;
        const html = sec.innerHTML;
        const txt = sec.innerText || '';
        const hasSpinner = !!sec.querySelector('.spin');
        return { txt, hasSpinner, html: html.substring(0, 300) };
      }).catch(() => null);
      if (info && !info.hasSpinner && info.txt.length > 10) {
        // Look for plant-stat values (greenPct and greenCount/totalDimensions)
        const vals = await frame.evaluate(() => {
          const stats = Array.from(document.querySelectorAll('.plant-stat-val'));
          return stats.map(s => s.textContent.trim());
        }).catch(() => []);
        if (vals.length >= 2) {
          plantSummaryText = vals.join(' | ');
          return true;
        }
        // Might show error or partial data
        return 'SQCDP section loaded but .plant-stat-val not found. Text: ' + (info.txt || '').substring(0, 150);
      }
      await page.waitForTimeout(500);
    }
    return 'SQCDP section still loading or empty after 20s';
  });

  // ── CHECK 4: SQCDP per-zone — click Z-01 pill, assert 5 tiles ─────────────
  const tileLabels = [];
  await runner.check('4a. Zone pill Z-01 is clickable (zone filters populated)', async () => {
    if (!frame) return 'frame unavailable';
    // Wait for zone pills to build from trend data
    for (let i = 0; i < 40; i++) {
      const pills = await frame.evaluate(() =>
        Array.from(document.querySelectorAll('.iv-filter-btn')).map(b => b.textContent.trim())
      ).catch(() => []);
      if (pills.includes('Z-01')) return true;
      await page.waitForTimeout(500);
    }
    const pills = await frame.evaluate(() =>
      Array.from(document.querySelectorAll('.iv-filter-btn')).map(b => b.textContent.trim())
    ).catch(() => []);
    return 'Z-01 pill not found after 20s. Pills: ' + pills.slice(0, 10).join(', ');
  });

  await runner.check('4b. Z-01 zone: 5 SQCDP operational tiles render with value + status badge', async () => {
    if (!frame) return 'frame unavailable';
    // Click Z-01
    await frame.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.iv-filter-btn')).find(b => b.textContent.trim() === 'Z-01');
      if (btn) btn.click();
    }).catch(() => {});
    // Wait for tiles
    for (let i = 0; i < 40; i++) {
      const info = await frame.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll('.sqcdp-tile'));
        return {
          count: tiles.length,
          tiles: tiles.map(t => ({
            dim: (t.querySelector('.sqcdp-tile-dim') || {}).textContent || '',
            val: (t.querySelector('.sqcdp-tile-val') || {}).textContent || '',
            status: (t.querySelector('.sqcdp-tile-status') || {}).textContent || ''
          }))
        };
      }).catch(() => ({ count: 0, tiles: [] }));
      if (info.count >= 5) {
        info.tiles.forEach(t => tileLabels.push(t.dim + '=' + t.val + ' [' + t.status + ']'));
        if (pageErrors.length) return 'Tiles rendered but pageerrors: ' + pageErrors.join('; ');
        return true;
      }
      await page.waitForTimeout(500);
    }
    // Check if error shown
    const errEl = await frame.evaluate(() => {
      const sec = document.getElementById('iv-sqcdp-section');
      return sec ? sec.innerText.substring(0, 200) : 'no section';
    }).catch(() => '');
    return 'Expected 5 SQCDP tiles for Z-01, section says: ' + errEl;
  });

  await runner.check('4c. Switching zone Z-01 did not throw pageerrors', async () => {
    if (pageErrors.length) return 'pageerrors: ' + pageErrors.join(' | ');
    return true;
  });

  // ── CHECK 5: Pareto section — click Quality tab ─────────────────────────────
  // Reset to ALL first
  if (frame) {
    await frame.evaluate(() => {
      const allBtn = Array.from(document.querySelectorAll('.iv-filter-btn')).find(b => b.textContent.trim() === 'ALL');
      if (allBtn) allBtn.click();
    }).catch(() => {});
    await page.waitForTimeout(500);
  }

  await runner.check('5. Pareto Quality tab: renders bars or clean empty state (no pageerror)', async () => {
    if (!frame) return 'frame unavailable';
    // Find and click Quality tab
    const clicked = await frame.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.pareto-tab'));
      const qTab = tabs.find(t => t.textContent.trim() === 'Quality');
      if (qTab) { qTab.click(); return true; }
      return false;
    }).catch(() => false);
    if (!clicked) return 'Quality pareto tab not found';
    // Wait for content
    for (let i = 0; i < 60; i++) {
      const info = await frame.evaluate(() => {
        const pb = document.getElementById('iv-pareto-body');
        if (!pb) return null;
        const hasSpinner = !!pb.querySelector('.spin');
        const hasBars = pb.querySelectorAll('.pareto-bar-row').length;
        const hasEmpty = !!pb.querySelector('.pareto-empty');
        const hasError = !!pb.querySelector('.iv-error');
        return { hasSpinner, hasBars, hasEmpty, hasError, txt: pb.innerText.substring(0, 100) };
      }).catch(() => null);
      if (!info) { await page.waitForTimeout(500); continue; }
      if (info.hasSpinner) { await page.waitForTimeout(500); continue; }
      if (info.hasError) return 'Pareto error: ' + info.txt;
      if (info.hasBars > 0 || info.hasEmpty) {
        if (pageErrors.length) return 'Pareto OK but pageerrors: ' + pageErrors.join('; ');
        return true;
      }
      await page.waitForTimeout(500);
    }
    return 'Pareto body still loading or unexpected state after 30s';
  });

  // ── CHECK 6: No Plotly / ECharts / fabricated chart elements ──────────────
  await runner.check('6a. Plotly is NOT loaded on the page', async () => {
    if (!frame) return 'frame unavailable';
    const absent = await frame.evaluate(() => typeof window.Plotly === 'undefined').catch(() => null);
    if (absent === true) return true;
    return 'window.Plotly IS defined — fabricated chart library loaded';
  });

  await runner.check('6b. ECharts is NOT loaded on the page', async () => {
    if (!frame) return 'frame unavailable';
    const absent = await frame.evaluate(() => typeof window.echarts === 'undefined').catch(() => null);
    if (absent === true) return true;
    return 'window.echarts IS defined — ECharts loaded';
  });

  await runner.check('6c. No #trendChart Plotly div element', async () => {
    if (!frame) return 'frame unavailable';
    const found = await frame.evaluate(() => !!document.getElementById('trendChart')).catch(() => false);
    if (!found) return true;
    return '#trendChart element exists — old fabricated chart div present';
  });

  await runner.check('6d. No calendar-heatmap canvas (ECharts)', async () => {
    if (!frame) return 'frame unavailable';
    // Calendar heatmap from ECharts would typically be a canvas with an echarts class/attr
    const found = await frame.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      return canvases.some(c => c.getAttribute('data-zr-dom-id') || (c.parentElement && c.parentElement.getAttribute('_echarts_instance_')));
    }).catch(() => false);
    if (!found) return true;
    return 'ECharts canvas element found';
  });

  // ── CHECK 7: RESPONSIVE ────────────────────────────────────────────────────
  // Re-navigate to insights fresh for mobile check
  await gotoAction(page, frame, 'insights');
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 30000);
  await waitForSel(frame, '.kpi-strip', 20000, page);
  await page.waitForTimeout(1000); // let layout settle

  // 7a. Mobile viewport (390x844) — check page doesn't overflow
  // The lib already creates context at 390x844, so we're already mobile
  await runner.check('7a. Mobile (390x844): no horizontal page overflow (scrollWidth <= innerWidth+2)', async () => {
    if (!frame) return 'frame unavailable';
    const result = await frame.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    }).catch(() => null);
    if (!result) return 'could not evaluate scrollWidth';
    const ok = result.scrollWidth <= result.innerWidth + 2;
    const msg = 'scrollWidth=' + result.scrollWidth + ' innerWidth=' + result.innerWidth;
    return ok ? true : 'PAGE OVERFLOWS: ' + msg;
  });

  // 7b. Desktop (1200px) — open a second context/page
  let desktopFrame = null;
  let desktopCtx = null;
  let desktopSideBySide = 'not-tested';

  const { getGoogleAccessToken, newAuthContext } = require('./e2e-lib-5s');
  try {
    const tokenVal = await getGoogleAccessToken();
    desktopCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await desktopCtx.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('google.com') || url.includes('googleapis.com') || url.includes('googleusercontent.com')) {
        route.continue({ headers: { ...route.request().headers(), 'Authorization': 'Bearer ' + tokenVal } });
      } else {
        route.continue();
      }
    });
    const desktopPage = await desktopCtx.newPage();
    // Navigate directly with token from main session
    const token = await frame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('[href*="token="], [onclick*="token="]'));
      for (const el of links) {
        const src = el.getAttribute('href') || el.getAttribute('onclick') || '';
        const m = src.match(/token=([a-f0-9\-]{20,})/i);
        if (m) return m[1];
      }
      return null;
    }).catch(() => null);

    const insightsUrl = token
      ? EXEC + '?v2=1&action=insights&token=' + token
      : EXEC + '?v2=1&action=insights';
    await desktopPage.goto(insightsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await desktopPage.waitForTimeout(1000);
    desktopFrame = await reAcquireFrame(desktopPage, 30000);
    if (desktopFrame) await waitForSel(desktopFrame, '.kpi-strip', 25000, desktopPage);
    await desktopPage.waitForTimeout(2000); // layout settle
  } catch (e) {
    console.log('  [warn] desktop context setup failed:', e.message);
  }

  await runner.check('7b. Desktop (1200px): NCR blocks side-by-side (same top-Y, different X)', async () => {
    if (!desktopFrame) return 'SKIP — desktop frame unavailable';
    const rects = await desktopFrame.evaluate(() => {
      const cards = document.querySelectorAll('.ncr-row > .s-card');
      if (cards.length < 2) {
        // fallback: check by id
        const a = document.getElementById('iv-pillar-nc');
        const b = document.getElementById('iv-sqcdp-nc');
        if (!a || !b) return null;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return [{ top: ra.top, left: ra.left, width: ra.width }, { top: rb.top, left: rb.left, width: rb.width }];
      }
      return Array.from(cards).slice(0, 2).map(c => {
        const r = c.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width };
      });
    }).catch(() => null);
    if (!rects) return 'could not find .ncr-row > .s-card elements for side-by-side check';
    const [a, b] = rects;
    const sameTop = Math.abs(a.top - b.top) < 40;  // allow 40px tolerance
    const differentX = b.left > a.left + 50;
    desktopSideBySide = 'topA=' + Math.round(a.top) + ' topB=' + Math.round(b.top) + ' leftA=' + Math.round(a.left) + ' leftB=' + Math.round(b.left);
    if (sameTop && differentX) return true;
    return 'NOT side-by-side. ' + desktopSideBySide + (sameTop ? '' : ' (tops differ >40px)') + (differentX ? '' : ' (not horizontally offset)');
  });

  // ── CHECK 8: No real pageerrors throughout ──────────────────────────────────
  await runner.check('8. No real pageerrors throughout test session', async () => {
    if (pageErrors.length === 0) return true;
    return 'pageerrors: ' + pageErrors.join(' | ');
  });

  // ── CLEANUP & REPORT ────────────────────────────────────────────────────────
  if (desktopCtx) await desktopCtx.close().catch(() => {});
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});

  const { pass, total } = runner.report();

  console.log('\n── Findings ──');
  console.log('Plant green summary:', plantSummaryText || '(not captured)');
  console.log('Z-01 SQCDP tiles:', tileLabels.length ? tileLabels.join(' | ') : '(not captured)');
  console.log('Desktop side-by-side:', desktopSideBySide);
  console.log('pageErrors (non-SW):', pageErrors.length ? pageErrors.join('; ') : 'none');

  process.exit(pass === total ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
