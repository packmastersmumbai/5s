const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');
(async () => {
  const browser = await launch();
  const { page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1500, height: 900 });
  await gotoAction(page, frame, 'actionlist');
  let fr = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    for (const c of page.frames().filter(x => /googleusercontent\.com/.test(x.url()))) {
      if (await c.evaluate(() => !!document.querySelector('.ah-filter-row')).catch(() => false)) { fr = c; break; }
    }
    if (fr) break;
  }
  if (!fr) { console.log('FAIL  frame not found'); await browser.close(); process.exit(1); }
  const vis = await fr.locator('.ah-filter-row').isVisible();
  console.log((vis ? 'PASS' : 'FAIL') + '  filter row open by default on desktop');
  await fr.locator('#ahFilterToggle').click();
  await page.waitForTimeout(600);
  const after = await fr.locator('.ah-filter-row').isVisible();
  console.log((!after ? 'PASS' : 'FAIL') + '  single click collapses it');
  await fr.locator('#ahFilterToggle').click();
  await page.waitForTimeout(600);
  const back = await fr.locator('.ah-filter-row').isVisible();
  console.log((back ? 'PASS' : 'FAIL') + '  single click reopens it');
  await browser.close();
})();
