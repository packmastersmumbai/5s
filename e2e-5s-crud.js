// PackMasters 5S — E2E: edit + soft-delete in ActionsHub
// Run: node e2e-5s-crud.js   (headed: E2E_HEADED=1 node e2e-5s-crud.js)
const { launch, loginAdmin, gotoAction, makeRunner } = require('./e2e-lib-5s');

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
  const runner = makeRunner('PackMasters 5S — CRUD (edit/delete)');
  let browser, ctx, page, frame;
  try {
    browser = await launch();
    ({ ctx, page, frame } = await loginAdmin(browser));
    page.on('dialog', d => d.accept());   // auto-confirm delete prompt
    await gotoAction(page, frame, 'actionlist');
    frame = await acquireAhFrame(page);
    if (!frame) throw new Error('ActionsHub frame not found');
    // ensure cards present
    for (let i = 0; i < 30 && !(await frame.evaluate(() => document.querySelector('#ahContent .ah-tr'))); i++) await page.waitForTimeout(500);
  } catch (e) { console.error('FATAL:', e.message); process.exit(2); }

  await runner.check('Edit + Delete buttons render on rows', async () => {
    const ok = await frame.evaluate(() =>
      !!document.querySelector('.ah-ibtn.edit') && !!document.querySelector('.ah-ibtn.del')).catch(() => false);
    return ok || 'edit/delete buttons missing';
  });

  await runner.check('Edit modal opens and saves', async () => {
    await frame.evaluate(() => document.querySelector('.ah-ibtn.edit').click());
    for (let i = 0; i < 20; i++) {
      const open = await frame.evaluate(() => document.getElementById('editModal').classList.contains('open')).catch(() => false);
      if (open) break; await page.waitForTimeout(300);
    }
    const hasField = await frame.evaluate(() => !!(document.getElementById('edDesc') || document.getElementById('edTitle'))).catch(() => false);
    if (!hasField) return 'edit modal fields not rendered';
    await frame.evaluate(() => {
      var el = document.getElementById('edTitle') || document.getElementById('edDesc');
      el.value = (el.value || '') + ' [e2e]';
      submitEdit();
    });
    for (let i = 0; i < 20; i++) {
      const closed = await frame.evaluate(() => !document.getElementById('editModal').classList.contains('open')).catch(() => false);
      if (closed) return true; await page.waitForTimeout(400);
    }
    return 'edit modal did not close after save';
  });

  await runner.check('Delete removes a card from the list', async () => {
    let before = 0;
    for (let i = 0; i < 30; i++) {
      before = await frame.evaluate(() => document.querySelectorAll('#ahContent .ah-tr').length).catch(() => 0);
      if (before > 0) break; await page.waitForTimeout(500);
    }
    if (!before) return 'no cards to delete (list did not repopulate)';
    await frame.evaluate(() => document.querySelector('#ahContent .ah-tr .ah-ibtn.del').click());
    for (let i = 0; i < 25; i++) {
      const after = await frame.evaluate(() => document.querySelectorAll('#ahContent .ah-tr').length).catch(() => before);
      if (after < before) return true; await page.waitForTimeout(500);
    }
    return 'card count did not decrease after delete';
  });

  const r = runner.report();
  await ctx.close(); await browser.close();
  process.exit(r.pass === r.total ? 0 : 1);
}
main();
