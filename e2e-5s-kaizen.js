/* Kaizen: PDCA form structure + validation, and the board review dialog. */
const { launch, loginAdmin, gotoAction, EXEC } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';

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

  // ── FORM ────────────────────────────────────────────────────────
  await gotoAction(page, frame, 'kaizen');
  const fr = await appFrame(page, '#kzDoc');
  if (!fr) { say('kaizen form loads', false); await browser.close(); return; }

  say('four PDCA steps render', (await fr.locator('.kz-step').count()) === 4);
  const heads = await fr.locator('.kz-step-t').allTextContents();
  say('steps are named', heads.length === 4, JSON.stringify(heads));

  say('current-state field exists', (await fr.locator('#kzCurrent').count()) === 1);
  say('metric before/target exists', (await fr.locator('#kzBefore').count()) === 1 && (await fr.locator('#kzAfter').count()) === 1);
  say('benefit chips are multi-select', (await fr.locator('#kzBenefitChips .kz-chip').count()) >= 5);
  say('impact/effort sliders exist', (await fr.locator('#kzImpact').count()) === 1 && (await fr.locator('#kzEffort').count()) === 1);

  // Quadrant naming reacts to the sliders.
  await fr.locator('#kzImpact').fill('5');
  await fr.locator('#kzEffort').fill('1');
  await page.waitForTimeout(400);
  const quad = await fr.locator('#kzQuad').textContent();
  say('quadrant names a quick win', /quick win/i.test(quad || ''), (quad || '').trim().slice(0, 40));

  // Progress rail advances as steps complete.
  const before = await fr.locator('.kz-rail-seg.done').count();
  await fr.locator('#kzTitle').fill('Shadow board for gauges at Line 2');
  await fr.locator('#kzCurrent').fill('Operators walk 12 m to the crib, ~20 times a shift.');
  await fr.locator('#kzDesc').fill('Mount a shadow board with the four gauges at the workstation.');
  await fr.locator('#kzName').fill('E2E Tester');
  await page.waitForTimeout(600);
  const after = await fr.locator('.kz-rail-seg.done').count();
  say('progress rail advances', after > before, before + ' -> ' + after);

  // Photo is required: submitting without one must not send.
  await fr.locator('#kzSubmit').click();
  await page.waitForTimeout(1500);
  const invalid = await fr.locator('.kz-f.invalid').count();
  const stillOnForm = (await fr.locator('#kzDoc .kz-step').count()) === 4;
  say('before-photo is enforced', invalid > 0 && stillOnForm, invalid + ' fields flagged');

  await page.screenshot({ path: path.join(OUT, 'kz-form.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'kz-form-390.png') });
  await page.setViewportSize({ width: 1500, height: 950 });

  // ── BOARD ───────────────────────────────────────────────────────
  const tok = new URL(page.url()).searchParams.get('token') || '';
  await page.goto(EXEC + '?v2=1&action=kaizenboard&token=' + encodeURIComponent(tok),
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  let bf = await appFrame(page, '.board-wrap, .column');
  if (!bf) { say('kaizen board loads', false); }
  else {
    // A first-run guided tour overlays the board and swallows clicks; turn it
    // off the way the More sheet does, then reload.
    await bf.evaluate(() => { try { localStorage.setItem('pm5s_tours_global', 'off'); } catch (e) {} });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    bf = await appFrame(page, '.board-wrap, .column');
    if (!bf) { say('kaizen board reloads', false); await browser.close(); return; }

    say('board renders lifecycle columns', (await bf.locator('.column').count()) >= 5);

    const act = bf.locator('.card-actions button').first();
    if (await act.count()) {
      const label = (await act.textContent() || '').trim();
      say('action names the job, not the mechanism', !/^Move/i.test(label), label);

      await act.click();
      await bf.locator('.kzb-dlg').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      say('review dialog opens', await bf.locator('.kzb-dlg').isVisible().catch(() => false));
      say('dialog shows the record context', (await bf.locator('.kzb-ctx').count()) === 1);
      const flds = await bf.locator('.kzb-fld label').allTextContents();
      say('dialog captures review fields', flds.length > 0, JSON.stringify(flds));
      await page.screenshot({ path: path.join(OUT, 'kz-board.png') });
      await bf.locator('.kzb-ft button', { hasText: 'Cancel' }).click();
      await page.waitForTimeout(400);
      say('dialog closes without saving', (await bf.locator('.kzb-dlg').count()) === 0);
    } else {
      say('board has an actionable card', false);
    }
  }

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
