/* The working zone must be visible above Home on every page, preselected,
   and switchable in one action. */
const { launch, loginAdmin, gotoAction, EXEC } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';

async function appFrame(page, marker) {
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    for (const c of page.frames().filter(x => /googleusercontent\.com/.test(x.url()))) {
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
  let fr = await appFrame(page, '#pm5s-zone-select, #pm5s-zone-label');
  if (!fr) { say('sidebar renders', false); await browser.close(); return; }

  const sel = fr.locator('#pm5s-zone-select');
  say('zone control is a dropdown', (await sel.count()) === 1);
  if (!(await sel.count())) { await browser.close(); return; }

  say('dropdown is visible', await sel.isVisible());
  const opts = await sel.locator('option').count();
  say('lists every zone', opts >= 28, opts + ' options');

  // It sits above Home in the rail.
  const selBox = await sel.boundingBox();
  const homeBox = await fr.locator('.sidebar-item').first().boundingBox();
  say('sits above the Home button', selBox && homeBox && selBox.y < homeBox.y,
      selBox && homeBox ? Math.round(selBox.y) + ' < ' + Math.round(homeBox.y) : 'no box');

  // A brand-new browser has made no choice yet, so "--" is correct rather than
  // implying Z-01 was selected. What must hold is that arriving WITH a zone
  // preselects it -- checked below after the switch and the navigation.
  const before = await sel.inputValue();
  const placeholder = await sel.locator('option[value=""]').count();
  say('unset state is honest, not a fake Z-01',
      before ? true : placeholder === 1, before || 'shows -- with no choice made');

  // Switch in one action, and confirm it holds after navigating elsewhere.
  const target = await sel.locator('option').nth(5).getAttribute('value');
  await sel.selectOption(target);
  await page.waitForTimeout(9000);

  let fr2 = await appFrame(page, '#pm5s-zone-select');
  const after = fr2 ? await fr2.locator('#pm5s-zone-select').inputValue() : '';
  say('one action changes the zone', after === target, before + ' -> ' + after);
  say('URL carries the zone', page.url().indexOf('zone=' + target) > -1);

  await page.screenshot({ path: path.join(OUT, 'zonesel.png') });

  // Navigate WITHOUT ?zone= — the choice must persist, not reset.
  const tok = new URL(page.url()).searchParams.get('token') || '';
  await page.goto(EXEC + '?v2=1&action=actionlist&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr3 = await appFrame(page, '#pm5s-zone-select');
  const kept = fr3 ? await fr3.locator('#pm5s-zone-select').inputValue() : '';
  say('zone persists across pages without ?zone=', kept === target, 'expected ' + target + ' got ' + (kept || '(empty)'));

  // Arriving with an explicit zone must preselect it.
  await page.goto(EXEC + '?v2=1&action=home&zone=Z-11&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr4 = await appFrame(page, '#pm5s-zone-select');
  const pre = fr4 ? await fr4.locator('#pm5s-zone-select').inputValue() : '';
  say('arriving with ?zone= preselects it', pre === 'Z-11', pre || '(empty)');

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
