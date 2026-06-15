// PackMasters 5S — E2E: Audits tab (view filled audit + per-criterion photos)
// Run: node e2e-5s-audit-view.js   (headed: E2E_HEADED=1 node e2e-5s-audit-view.js)
const { launch, loginAdmin, gotoAction, findAppFrame, makeRunner } = require('./e2e-lib-5s');

async function acquireAhFrame(page, ms) {
  const deadline = Date.now() + (ms || 25000);
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
      try { if (await f.evaluate(() => !!document.querySelector('.ah-type-tabs'))) return f; } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function main() {
  const runner = makeRunner('PackMasters 5S — Audits View');
  let browser, ctx, page, frame;
  try {
    browser = await launch();
    ({ ctx, page, frame } = await loginAdmin(browser));
    await gotoAction(page, frame, 'actionlist');
    frame = await acquireAhFrame(page);
    if (!frame) throw new Error('ActionsHub frame not found after nav');
  } catch (e) { console.error('FATAL:', e.message); process.exit(2); }

  await runner.check('Audits tab exists', async () => {
    const has = await frame.evaluate(() => !!document.querySelector('.ah-type-tab[data-type="AUDITS"]')).catch(() => false);
    return has || 'no Audits tab';
  });

  await runner.check('Audits tab lists at least one filled audit', async () => {
    await frame.evaluate(() => document.querySelector('.ah-type-tab[data-type="AUDITS"]').click());
    for (let i = 0; i < 30; i++) {
      const n = await frame.evaluate(() => document.querySelectorAll('#ahContent .ah-card').length).catch(() => 0);
      if (n > 0) return true;
      await page.waitForTimeout(500);
    }
    const txt = await frame.evaluate(() => (document.getElementById('ahContent') || {}).innerText || '').catch(() => '');
    return 'no audit cards; content: ' + txt.slice(0, 120);
  });

  await runner.check('Opening an audit shows per-criterion detail rows', async () => {
    await frame.evaluate(() => document.querySelector('#ahContent .ah-card').click());
    for (let i = 0; i < 20; i++) {
      const info = await frame.evaluate(() => {
        const body = document.getElementById('recordDetailBody');
        const open = document.getElementById('recordDetailModal').classList.contains('open');
        return { open, txt: body ? body.innerText : '', imgs: body ? body.querySelectorAll('img').length : 0 };
      }).catch(() => ({ open: false }));
      if (info.open && /S\d|criteri|pillar|S1/i.test(info.txt)) return true;
      await page.waitForTimeout(400);
    }
    return 'detail modal did not render criterion rows';
  });

  await runner.check('Audit detail includes at least one photo thumbnail', async () => {
    const imgs = await frame.evaluate(() => document.getElementById('recordDetailBody').querySelectorAll('img').length).catch(() => 0);
    return imgs > 0 ? true : 'no photo thumbnail in detail (expected >=1 from Z-02 test audit)';
  });

  await runner.check('Share buttons (PDF + WhatsApp) appear in audit detail', async () => {
    for (let i = 0; i < 40; i++) {
      const info = await frame.evaluate(() => {
        var el = document.getElementById('auShare');
        if (!el) return { n: 0 };
        var as = el.querySelectorAll('a');
        var wa = Array.prototype.some.call(as, a => /wa\.me/.test(a.href));
        return { n: as.length, wa: wa };
      }).catch(() => ({ n: 0 }));
      if (info.n >= 1 && info.wa) return true;
      await page.waitForTimeout(1000);
    }
    return 'share buttons did not populate (PDF/WhatsApp)';
  });

  const r = runner.report();
  await ctx.close(); await browser.close();
  process.exit(r.pass === r.total ? 0 : 1);
}
main();
