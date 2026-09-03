/* Screenshots of the three reworked tabs, for visual review. */
const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';

(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1500, height: 950 });
  await gotoAction(page, frame, 'actionlist');

  let fr = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    for (const c of page.frames().filter(x => /googleusercontent\.com/.test(x.url()))) {
      if (await c.evaluate(() => !!document.getElementById('ahContent')).catch(() => false)) { fr = c; break; }
    }
    if (fr) break;
  }
  if (!fr) { console.log('FAIL frame'); await browser.close(); process.exit(1); }

  async function shot(name) {
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
    console.log('shot: ' + name);
  }

  await shot('01-records');

  const tabs = await fr.locator('.ah-type-tab').allTextContents();
  console.log('tabs: ' + JSON.stringify(tabs));

  for (const label of ['Summary', 'Audits']) {
    const tab = fr.locator('.ah-type-tab', { hasText: label });
    if (await tab.count()) {
      await tab.first().click();
      // Both views load async; wait for their own markup, not a fixed sleep.
      const sel = label === 'Summary' ? '.ah-sum-row' : '.au-tile';
      await fr.locator(sel).first().waitFor({ state: 'visible', timeout: 30000 });
      await shot('0' + (label === 'Summary' ? '2-summary' : '3-audits'));
    } else {
      console.log('tab not found: ' + label);
    }
  }

  await browser.close();
})();
