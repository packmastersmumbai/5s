/* Regression pass for: multi-select visibility, and one-click zone actions
   (audit / kaizen / records) from the home screen.
   Locators only -- evaluate(el.click()) passes on 0x0 hidden elements. */
const { launch, loginAdmin, gotoAction, EXEC } = require('./e2e-lib-5s');

async function appFrame(page, marker) {
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    for (const c of page.frames().filter(x => /googleusercontent\.com/.test(x.url()))) {
      if (await c.evaluate(m => !!document.querySelector(m), marker).catch(() => false)) return c;
    }
  }
  return null;
}
const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1500, height: 950 });

  // ── 1. MULTI-SELECT ─────────────────────────────────────────────
  await gotoAction(page, frame, 'actionlist');
  const fr = await appFrame(page, '#ahContent');
  if (!fr) { say('actions frame', false); }
  else {
    await fr.locator('.ah-table').first().waitFor({ state: 'visible', timeout: 30000 });
    const btn = fr.locator('#ahSelectToggle');
    say('Multi-select button visible', await btn.first().isVisible());

    const t0 = Date.now();
    await btn.first().click();
    await fr.locator('.ah-sel-box').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const ms = Date.now() - t0;
    const cbs = await fr.locator('.ah-sel-box').count();
    say('checkboxes appear', cbs > 0, cbs + ' boxes');
    say('checkbox really visible (not 0x0)', await fr.locator('.ah-sel-box').first().isVisible().catch(() => false));
    say('no server round-trip (<2s)', ms < 2000, ms + 'ms');

    await fr.locator('.ah-sel-box').nth(1).check().catch(() => {});
    await page.waitForTimeout(600);
    say('bulk bar visible with a row selected', await fr.locator('.ah-bulk-bar').first().isVisible().catch(() => false));
    const cnt = await fr.locator('#ahBulkCount').textContent().catch(() => '');
    say('selection count updates', /1/.test(cnt || ''), cnt);
  }

  // ── 2. ZONE ACTIONS ON HOME ─────────────────────────────────────
  // gotoAction pulls the session token out of the frame it is handed; that
  // frame is detached after the first navigation, so carry the token forward
  // from the URL we are already on.
  const tok = new URL(page.url()).searchParams.get('token') || '';
  await page.goto(EXEC + '?v2=1&action=home&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  const hf = await appFrame(page, '.zm-card');
  if (!hf) { say('home zone cards', false, 'no .zm-card'); }
  else {
    say('home lists zone cards', (await hf.locator('.zm-card').count()) > 0);

    const t1 = Date.now();
    await hf.locator('.zm-card').first().click();
    await hf.locator('.za-card').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    say('one click opens zone actions', await hf.locator('.za-card').isVisible().catch(() => false), (Date.now() - t1) + 'ms');

    const acts = await hf.locator('.za-act b').allTextContents();
    say('offers Quick Audit', acts.some(a => /quick audit/i.test(a)), JSON.stringify(acts));
    say('offers Kaizen', acts.some(a => /kaizen/i.test(a)));
    say('offers Zone Records', acts.some(a => /records/i.test(a)));

    const zid = (await hf.locator('.za-hd b').textContent() || '').trim();
    say('sheet names the zone', /^Z-\d\d$/.test(zid), zid);

    const oc = await hf.locator('.za-act').first().getAttribute('onclick');
    say('Quick Audit targets that zone', !!oc && oc.indexOf('zone=' + zid) > -1 && oc.indexOf('quickaudit') > -1);

    await hf.locator('.za-cancel').click();
    await page.waitForTimeout(400);
    say('cancel closes the sheet', (await hf.locator('.za-card').count()) === 0);
  }

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
