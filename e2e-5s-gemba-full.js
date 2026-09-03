/* Complete a real Gemba walk end to end, then inspect the record it leaves.
   The question is not "do the screens render" but "would an auditor accept
   this as evidence a walk happened and was acted on". */
const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');
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
// A 1x1 PNG, so the finding has real evidence without needing a camera.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AD/2Q==';

(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAction(page, frame, 'gembawalk');

  const fr = await appFrame(page, '#gwStart');
  if (!fr) { console.log('FAIL frame'); await browser.close(); process.exit(1); }

  if (await fr.locator('.gw-zc').count()) await fr.locator('.gw-zc').first().click();
  await fr.locator('#gwTypes .gw-chip').first().click();      // Health & Safety

  // Identity must come from the session, not a free-text box.
  const who = await fr.locator('.gw-who b').textContent().catch(() => '');
  console.log('walking as (from session):', JSON.stringify((who || '').trim()));
  if (!who) await fr.locator('#gwName').fill('Audit Reviewer');
  await fr.locator('#gwStart').click();
  await fr.locator('.gw-q-t').waitFor({ state: 'visible', timeout: 20000 });

  const total = parseInt((await fr.locator('#gwHdCount').textContent()).split('/')[1], 10);
  console.log('questions:', total);

  // Walk the whole set. Fail Q2 and Q5 with real findings; answer the rest.
  const FAIL_AT = [2, 5];
  for (let i = 1; i <= total; i++) {
    const isAsk = (await fr.locator('#gwSay').count()) > 0;
    if (isAsk) {
      await fr.locator('#gwSay').fill('Operator said the guard rattles at speed and it has been reported once.');
    } else if (FAIL_AT.indexOf(i) > -1) {
      await fr.locator('.gw-no').click();
      await fr.locator('.gw-sheet').waitFor({ state: 'visible', timeout: 10000 });
      await fr.locator('#gwfNote').fill('Q' + i + ': two 200L drums on bare floor at the north bay, no drip tray, slight residue around the base.');
      // Inject a photo directly: a file chooser cannot be driven headlessly here.
      await fr.evaluate(function (b64) {
        var f = window.findings[window._photoTarget];
        f.photoUrls = f.photoUrls || []; f.photosB64 = f.photosB64 || [];
        f.photoUrls.push('data:image/png;base64,' + b64);
        f.photosB64.push(b64);
        window.renderFindingPhotos();
      }, PNG);
      await fr.locator('#gwfOwner').fill('Mr. Santosh Maurya');
      await fr.locator('#gwfDue').fill('2026-09-17');
      await fr.locator('#gwfPri').selectOption('HIGH');
      await fr.locator('.gw-sheet button', { hasText: 'Save finding' }).click();
      await page.waitForTimeout(700);
      const sheetGone = (await fr.locator('.gw-sheet').count()) === 0;
      console.log('  Q' + i + ' finding saved:', sheetGone);
    } else if ((await fr.locator('.gw-na').count()) > 0 && i % 7 === 0) {
      await fr.locator('.gw-na').click();
    } else {
      await fr.locator('.gw-yes').click();
    }
    await page.waitForTimeout(250);
    await fr.locator('#gwNext').click();
    await page.waitForTimeout(450);
  }

  // Review screen
  await fr.locator('.gw-sum-pct').waitFor({ state: 'visible', timeout: 15000 });
  const pct = (await fr.locator('.gw-sum-pct').textContent() || '').trim();
  const tiles = await fr.locator('.gw-tile b').allTextContents();
  const legs = await fr.locator('.gw-sq b').allTextContents();
  const findings = await fr.locator('.gw-find').count();
  console.log('review: pct=' + pct + ' tiles=' + JSON.stringify(tiles) +
              ' sqcdpLegs=' + JSON.stringify(legs) + ' findings=' + findings);
  await page.screenshot({ path: path.join(OUT, 'gwf-review.png'), fullPage: true });

  const ackDefault = await fr.locator('#gwAck').inputValue().catch(() => '(no ack field)');
  console.log('reviewed-with default:', JSON.stringify(ackDefault));
  await fr.locator('#gwObs').fill('Walked north bay and filling line with the shift in-charge. Two containment issues; operator flagged a guard rattle already reported.');
  await fr.locator('#gwNext').click();

  // Submitted state
  await fr.locator('.gw-done-id').waitFor({ state: 'visible', timeout: 45000 });
  const walkId = (await fr.locator('.gw-done-id').textContent() || '').trim();
  const doneMsg = (await fr.locator('.gw-done p').textContent() || '').trim();
  console.log('WALK ID:', walkId);
  console.log('done message:', doneMsg);
  await page.screenshot({ path: path.join(OUT, 'gwf-done.png') });

  console.log('\nWALK_ID=' + walkId);
  await browser.close();
})();
