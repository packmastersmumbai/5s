/* Gemba walk: setup, one-question-per-screen flow, and that a "No" cannot be
   recorded without a finding (note + photo). */
const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');
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
  await page.setViewportSize({ width: 390, height: 844 });   // a walk happens on a phone
  await gotoAction(page, frame, 'gembawalk');

  const fr = await appFrame(page, '#gwBody');
  if (!fr) { say('gemba form loads', false); await browser.close(); return; }

  // ── SETUP ───────────────────────────────────────────────────────
  await fr.locator('#gwStart').waitFor({ state: 'visible', timeout: 25000 });
  say('setup renders', true);
  say('start is gated until setup is complete', await fr.locator('#gwStart').isDisabled());
  // The walk nav must not compete with "Start walk" on the setup screen.
  say('walk nav hidden during setup', !(await fr.locator('#gwNav').isVisible().catch(() => true)));

  const types = await fr.locator('#gwTypes .gw-chip').count();
  say('walk types offered with counts', types >= 4, types + ' types');
  const typeLabel = await fr.locator('#gwTypes .gw-chip').first().textContent();
  say('type shows its question count', /\d+\s*questions/i.test(typeLabel || ''), (typeLabel || '').trim());

  // Zone: locked pill when arriving with ?zone, else searchable list.
  const locked = await fr.locator('.gw-zone-locked').count();
  if (!locked) {
    say('zone list is searchable, not 28 raw chips', (await fr.locator('#gwZoneQ').count()) === 1);
    await fr.locator('.gw-zc').first().click();
  } else {
    say('zone arrives locked from context', true);
  }
  await fr.locator('#gwTypes .gw-chip').first().click();
  await fr.locator('#gwName').fill('E2E Walker');
  await page.waitForTimeout(500);
  say('start enables once zone+type+name set', !(await fr.locator('#gwStart').isDisabled()));

  await page.screenshot({ path: path.join(OUT, 'gw-setup-390.png') });

  // ── ONE QUESTION PER SCREEN ─────────────────────────────────────
  await fr.locator('#gwStart').click();
  await fr.locator('.gw-q-t').waitFor({ state: 'visible', timeout: 20000 });
  say('a question renders', true);

  const onScreen = await fr.locator('.gw-q-t').count();
  say('exactly one question on screen', onScreen === 1, onScreen + ' visible');

  const counter = await fr.locator('#gwHdCount').textContent();
  say('progress counter shows position', /^\d+\/\d+$/.test((counter || '').trim()), (counter || '').trim());
  say('progress dots render', (await fr.locator('.gw-dot').count()) > 5);

  const yesBox = await fr.locator('.gw-yes').boundingBox();
  say('answer is a thumb-sized target', yesBox && yesBox.height >= 55,
      yesBox ? Math.round(yesBox.width) + 'x' + Math.round(yesBox.height) : 'none');

  await page.screenshot({ path: path.join(OUT, 'gw-question-390.png') });

  // ── A "NO" MUST PRODUCE A FINDING ───────────────────────────────
  await fr.locator('.gw-no').click();
  await fr.locator('.gw-sheet').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  say('No opens the finding sheet immediately', await fr.locator('.gw-sheet').isVisible().catch(() => false));
  say('finding asks what was seen', (await fr.locator('#gwfNote').count()) === 1);
  say('finding asks for owner and due date',
      (await fr.locator('#gwfOwner').count()) === 1 && (await fr.locator('#gwfDue').count()) === 1);

  await page.screenshot({ path: path.join(OUT, 'gw-finding-390.png') });

  // Saving with no note and no photo must be refused.
  await fr.locator('.gw-sheet button', { hasText: 'Save finding' }).click();
  await page.waitForTimeout(600);
  const stillOpen = await fr.locator('.gw-sheet').isVisible().catch(() => false);
  const flagged = await fr.locator('.gw-f.bad').count();
  say('empty finding is refused', stillOpen && flagged >= 2, flagged + ' fields flagged');

  // Cancelling a finding must also cancel the No.
  await fr.locator('.gw-sheet button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(800);
  const noStillOn = await fr.locator('.gw-no.on').count();
  say('cancelling the finding clears the No', noStillOn === 0);

  // Answer Yes and walk forward.
  await fr.locator('.gw-yes').click();
  await page.waitForTimeout(400);
  await fr.locator('#gwNext').click();
  await page.waitForTimeout(900);
  const c2 = await fr.locator('#gwHdCount').textContent();
  say('Next advances the question', /^2\//.test((c2 || '').trim()), (c2 || '').trim());
  say('Back is enabled after the first question', !(await fr.locator('#gwPrev').isDisabled()));

  console.log('\n----- ' + R.filter(r => r.ok).length + '/' + R.length + ' passed -----');
  await browser.close();
})();
