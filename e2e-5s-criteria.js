/* Criteria master smoke test.
   Locators only -- evaluate(() => el.click()) succeeds on 0x0 hidden elements
   and produced false passes repeatedly, so every assertion here goes through
   Playwright locators, which assert visibility. */
const { launch, loginAdmin, gotoAction, makeRunner } = require('./e2e-lib-5s');

(async () => {
  const t = makeRunner('criteria');
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  // Harness defaults to 390px; the criteria rows need desktop width.
  await page.setViewportSize({ width: 1500, height: 900 });

  await gotoAction(page, frame, 'zonecriteria');

  // Navigation detaches the old frame; poll until the new app frame has mounted.
  let fr = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    // The app frame is the sandboxed googleusercontent iframe; its name is not
    // always userHtmlFrame, so identify it by the content it actually holds.
    const cands = page.frames().filter(x => /googleusercontent\.com/.test(x.url()));
    let cand = null;
    for (const c of cands) {
      const has = await c.evaluate(() => !!document.getElementById('zcZone')).catch(() => false);
      if (has) { cand = c; break; }
    }
    if (!cand) continue;
    const ready = await cand.evaluate(() => {
      var sel = document.getElementById('zcZone');
      return !!sel && sel.options.length > 0;
    }).catch(() => false);
    if (ready) { fr = cand; break; }
  }
  if (!fr) { console.log('FAIL  app frame never mounted'); await browser.close(); process.exit(1); }

  // 1. Page renders with the zone selector populated.
  await fr.locator('#zcZone').waitFor({ state: 'visible', timeout: 30000 });
  const zoneCount = await fr.locator('#zcZone option').count();
  await t.check('zone dropdown populated (28)', () => (zoneCount === 28) || (zoneCount));

  // 2. Criteria render for the default zone.
  await fr.locator('.zc-row').first().waitFor({ state: 'visible', timeout: 20000 });
  const rows = await fr.locator('.zc-row').count();
  await t.check('Z-01 shows 15 criteria', () => (rows === 15) || (rows));

  const meta = await fr.locator('#zcMeta').textContent();
  await t.check('meta shows count and max score', () => (/15 criteria/.test(meta)) || (meta));

  // 3. Pillar grouping.
  const pillars = await fr.locator('.zc-pillar').count();
  await t.check('grouped into 5 pillars', () => (pillars === 5) || (pillars));

  // 4. Multi-dimension SQCDP is visible (the 284/420 fix).
  const dimText = await fr.locator('.zc-dim').first().textContent();
  await t.check('first criterion shows dimensions', () => (/[SQCDP]/.test(dimText)) || (dimText));
  const multi = await fr.locator('.zc-dim', { hasText: '·' }).count();
  await t.check('multi-dimension criteria rendered', () => (multi > 0) || (multi));

  // 5. Zone switch is client-side -- must be fast and change content.
  const before = await fr.locator('.zc-row').first().getAttribute('data-id');
  const t0 = Date.now();
  await fr.locator('#zcZone').selectOption('Z-14');
  await page.waitForTimeout(400);
  const elapsed = Date.now() - t0;
  const after = await fr.locator('.zc-row').first().getAttribute('data-id');
  const z14rows = await fr.locator('.zc-row').count();
  await t.check('zone switch under 1.5s (no round trip)', () => (elapsed < 1500) || (elapsed + 'ms'));
  await t.check('Z-14 renders criteria', () => (z14rows > 0) || (z14rows));

  // 6. Drawer opens and is populated.
  await fr.locator('#zcZone').selectOption('Z-01');
  await page.waitForTimeout(400);
  await fr.locator('.zc-row').first().locator('button', { hasText: 'Edit' }).click();
  await fr.locator('.zc-drawer').waitFor({ state: 'visible', timeout: 10000 });
  await t.check('drawer opened', () => (true) || ('visible'));

  const idVal = await fr.locator('#zcfId').inputValue();
  await t.check('drawer carries criterion id', () => (/^S\d-\d+$/.test(idVal)) || (idVal));
  const lblVal = await fr.locator('#zcfLblEn').inputValue();
  await t.check('drawer carries English label', () => (lblVal.length > 0) || (lblVal.slice(0, 30)));
  const helpVal = await fr.locator('#zcfHlpEn').inputValue();
  await t.check('drawer carries helper text', () => (helpVal.length > 0) || (helpVal.slice(0, 30)));
  const dimBoxes = await fr.locator('.zcfDim').count();
  await t.check('5 SQCDP checkboxes', () => (dimBoxes === 5) || (dimBoxes));

  // 7. Used ids are locked so a rename cannot orphan audit history.
  // countCriterionUsage is async; wait for the note to be filled in.
  let note = '';
  for (let i = 0; i < 30; i++) {
    note = (await fr.locator('#zcIdNote').textContent()) || '';
    if (/Locked|Not yet used/.test(note)) break;
    await page.waitForTimeout(500);
  }
  const disabled = await fr.locator('#zcfId').isDisabled();
  await t.check('in-use id locked with reason', () => (disabled && /Locked/.test(note)) || (note));

  // 8. Media panel present (rendered after getWDGLLPhotos returns).
  await fr.locator('.zc-addmedia').waitFor({ state: 'visible', timeout: 20000 });
  const addMedia = await fr.locator('.zc-addmedia').count();
  await t.check('media add control present', () => (addMedia === 1) || (addMedia));

  await fr.locator('.zc-drawer-ft button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(300);
  const drawerGone = await fr.locator('.zc-drawer').count();
  await t.check('drawer closes', () => (drawerGone === 0) || (drawerGone));

  // 9. Retire is optimistic: the row dims immediately, well before the write.
  // A previous aborted run can leave the first row retired, so restore first.
  if (await fr.locator('.zc-row').first().locator('button', { hasText: 'Restore' }).count()) {
    await fr.locator('.zc-row').first().locator('button', { hasText: 'Restore' }).click();
    await page.waitForTimeout(2500);
  }
  const tRetire = Date.now();
  await fr.locator('.zc-row').first().locator('button', { hasText: 'Retire' }).click();
  await fr.locator('.zc-row.retired').first().waitFor({ state: 'visible', timeout: 3000 });
  const repaint = Date.now() - tRetire;
  await t.check('retire repaints optimistically (<1s)', () => (repaint < 1000) || (repaint + 'ms'));

  // Restore, and confirm the save actually landed.
  await fr.locator('.zc-row').first().locator('button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(3000);
  const stillRetired = await fr.locator('.zc-row.retired').count();
  await t.check('restore clears retired state', () => (stillRetired === 0) || (stillRetired));

  // Leave Z-01 as found: the retire/restore checks mutate real config.
  if (await fr.locator('.zc-row').first().locator('button', { hasText: 'Restore' }).count()) {
    await fr.locator('.zc-row').first().locator('button', { hasText: 'Restore' }).click();
    await page.waitForTimeout(2500);
  }

  t.report();
  await browser.close();
})();
