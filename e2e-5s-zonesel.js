/* The working zone must be visible above Home on every page and changeable by
   CLICKING, the way a user does it -- selectOption() bypasses the real control. */
const { launch, loginAdmin, gotoAction, EXEC } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';

async function appFrame(page, marker) {
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    for (const c of page.frames()) {
      if (await c.evaluate(m => !!document.querySelector(m), marker).catch(() => false)) return c;
    }
  }
  return null;
}
const R = [];
const say = (n, ok, d) => { R.push({ ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1500, height: 950 });

  await gotoAction(page, frame, 'home');
  let fr = await appFrame(page, '#pm5s-zone-btn');
  if (!fr) { say('zone control renders', false); await browser.close(); return; }

  const btn = fr.locator('#pm5s-zone-btn');
  say('zone control is present', (await btn.count()) === 1);
  say('it is visible', await btn.isVisible());

  const bBox = await btn.boundingBox();
  /* The 52px rail is retired: the zone control now lives in the top bar and
     navigation is the bottom bar. These assertions used to target
     '.sidebar-item', which no longer exists, so the run crashed rather than
     failing — a dead selector is worse than a red test. */
  const nBox = await fr.locator('.bn-item').first().boundingBox();
  say('sits above the nav bar', bBox && nBox && bBox.y < nBox.y,
      bBox && nBox ? Math.round(bBox.y) + ' < ' + Math.round(nBox.y) : 'no box');
  say('is a real tap target', bBox && bBox.height >= 32 && bBox.width >= 40,
      bBox ? Math.round(bBox.width) + 'x' + Math.round(bBox.height) : 'none');

  const vis = await fr.evaluate(() => {
    const b = document.getElementById('pm5s-zone-btn');
    const bar = b.closest('.pm5s-topbar');
    const nav = document.getElementById('pm5sNav');
    return { btnBg: getComputedStyle(b).backgroundColor,
             barBg: bar ? getComputedStyle(bar).backgroundColor : '',
             caption: !!b.querySelector('.zb-cap'),
             inTopBar: !!bar,
             navTabs: nav ? nav.querySelectorAll('.bn-item').length : 0,
             labelled: nav ? [...nav.querySelectorAll('.bn-item')]
               .every(a => !!a.getAttribute('aria-label')) : false,
             noSidebar: !document.querySelector('aside.sidebar') };
  });
  say('lives in the top bar', vis.inTopBar);
  say('stands out from the bar', vis.btnBg !== vis.barBg, vis.btnBg + ' vs ' + vis.barBg);
  say('is labelled, not a bare code', vis.caption);
  /* The rail must stay gone: two navigations for one job is what this replaced. */
  say('sidebar is retired', vis.noSidebar);
  say('bottom nav has six tabs', vis.navTabs === 6, vis.navTabs + ' tabs');
  /* Labels collapse after 3s, so the accessible name cannot come from them. */
  say('every tab keeps an accessible name', vis.labelled);

  /* The GAS host paints its own banner above the app frame. The app cannot see
     or measure it, so a control flush against the top of the rail reads as
     hidden on screen while every in-page check passes -- which is exactly how
     this shipped twice. Require real headroom instead. */
  say('clears the top edge', bBox && bBox.y >= 4,
      bBox ? Math.round(bBox.y) + 'px from top' : 'no box');

  /* It must not collide with the bottom bar. */
  const gap = (bBox && nBox) ? (nBox.y - (bBox.y + bBox.height)) : -1;
  say('is clear of the nav bar', gap >= 10, Math.round(gap) + 'px gap');

  const before = (await fr.locator('#pm5s-zone-label').textContent() || '').trim();

  // CLICK it, as a user would.
  await btn.click();
  await fr.locator('.pm5s-zp').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  say('clicking opens the picker', await fr.locator('.pm5s-zp').isVisible().catch(() => false));

  const zn = await fr.locator('.pm5s-zp-z').count();
  say('picker lists every zone', zn >= 28, zn + ' zones');
  const zBox = await fr.locator('.pm5s-zp-z').first().boundingBox();
  say('zone tiles are tappable', zBox && zBox.height >= 50,
      zBox ? Math.round(zBox.width) + 'x' + Math.round(zBox.height) : 'none');

  await page.screenshot({ path: path.join(OUT, 'zonepicker.png') });

  // Pick a zone by clicking it.
  const target = (await fr.locator('.pm5s-zp-z').nth(4).locator('b').textContent() || '').trim();
  await fr.locator('.pm5s-zp-z').nth(4).click();
  await page.waitForTimeout(10000);

  const fr2 = await appFrame(page, '#pm5s-zone-label');
  const after = fr2 ? (await fr2.locator('#pm5s-zone-label').textContent() || '').trim() : '';
  say('clicking a zone switches to it', after === target, before + ' -> ' + after + ' (wanted ' + target + ')');
  say('URL carries the zone', page.url().indexOf('zone=' + target) > -1);

  // Persist across a page opened without ?zone=
  const tok = new URL(page.url()).searchParams.get('token') || '';
  await page.goto(EXEC + '?v2=1&action=actionlist&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr3 = await appFrame(page, '#pm5s-zone-label');
  const kept = fr3 ? (await fr3.locator('#pm5s-zone-label').textContent() || '').trim() : '';
  say('zone persists without ?zone=', kept === target, 'wanted ' + target + ' got ' + (kept || '(empty)'));

  // Arriving with an explicit zone preselects it
  await page.goto(EXEC + '?v2=1&action=home&zone=Z-11&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr4 = await appFrame(page, '#pm5s-zone-label');
  const pre = fr4 ? (await fr4.locator('#pm5s-zone-label').textContent() || '').trim() : '';
  say('arriving with ?zone= preselects it', pre === 'Z-11', pre || '(empty)');

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
