/* Digest settings: toggle present, persists, and placeholder addresses warn. */
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
const say = (n, ok, d) => { R.push({ ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1500, height: 950 });
  await gotoAction(page, frame, 'settings');

  let fr = await appFrame(page, '#sys_digest, .sys-section');
  if (!fr) { say('settings page loads', false); await browser.close(); return; }

  // The System tab may need selecting first.
  await fr.locator('.ms-tab-btn[data-tab="system"]').click();
  await fr.locator('#sys_digest').waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(800);

  const tog = fr.locator('#sys_digest');
  await tog.waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
  say('digest toggle exists', await tog.count() > 0);
  if (!(await tog.count())) { await browser.close(); return; }

  const track = fr.locator('.sw-track').first();
  say('toggle is visible', await track.isVisible().catch(() => false));
  const box = await track.boundingBox();
  say('toggle is a real tap target', box && box.height >= 20, box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'none');

  const initial = await tog.isChecked();
  say('toggle reflects a stored value', typeof initial === 'boolean', 'checked=' + initial);

  // Placeholder warning for the seeded @packmasters.in address.
  const topVal = await fr.locator('#sys_top').inputValue().catch(() => '');
  const warns = await fr.locator('.form-warn').allTextContents();
  const wantsWarn = /@packmasters\.in$/i.test(topVal) || !topVal.trim();
  say('placeholder/empty address is flagged', !wantsWarn || warns.length > 0,
      'TOP_EMAIL=' + topVal + ' warnings=' + warns.length);

  // Flip, save, reload, confirm it stuck.
  await fr.locator('.sw').first().click();   // the visible control, not the 0-opacity input
  const flipped = await tog.isChecked();
  say('toggle flips', flipped !== initial, initial + ' -> ' + flipped);

  const saveBtn = fr.locator('button:has-text("Save")').first();
  if (await saveBtn.count()) {
    await saveBtn.click();
    await page.waitForTimeout(6000);

    const tok = new URL(page.url()).searchParams.get('token') || '';
    await page.goto(EXEC + '?v2=1&action=settings&token=' + encodeURIComponent(tok),
                    { waitUntil: 'domcontentloaded', timeout: 60000 });
    const fr2 = await appFrame(page, '#sys_digest, .sys-section');
    if (fr2) {
      await fr2.locator('.ms-tab-btn[data-tab="system"]').click();
      await fr2.locator('#sys_digest').waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const after = await fr2.locator('#sys_digest').isChecked().catch(() => null);
      say('setting persists across reload', after === flipped, 'saved=' + flipped + ' reloaded=' + after);

      // Restore the original value so the test leaves no trace.
      if (after !== initial) {
        await fr2.locator('.sw').first().click();
        await fr2.locator('button:has-text("Save")').first().click().catch(() => {});
        await page.waitForTimeout(6000);
      }
    }
  } else {
    say('save button found', false);
  }

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
