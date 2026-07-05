// E2E: QuickAudit inline per-card create — NCR / Red Tag / Task icons, common
// linked record, no modal (worker page, no login). Run: E2E_HEADED=1 node e2e-5s-audit-create.js
'use strict';

const { launch, newAuthContext, findAppFrame, makeRunner, EXEC } = require('./e2e-lib-5s');

const QUICKAUDIT_URL = EXEC + '?v2=1&action=quickaudit&zone=Z-01';
const TIMEOUT = 30000;

async function clickId(frame, id) { await frame.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); }, id); }
async function setVal(frame, id, v) {
  await frame.evaluate(({ i, val }) => { const el = document.getElementById(i); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } }, { i: id, val: v });
}
async function createVisible(frame) { return frame.evaluate(() => { const e = document.getElementById('create-0'); return !!e && e.style.display !== 'none'; }); }
async function fieldPresent(frame, f) { return frame.evaluate((ff) => !!document.querySelector('#createfields-0 [data-f="' + ff + '"]'), f); }
async function setField(frame, f, v) { await frame.evaluate(({ ff, val }) => { const el = document.querySelector('#createfields-0 [data-f="' + ff + '"]'); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } }, { ff: f, val: v }); }
async function iconDone(frame, id) { return frame.evaluate((i) => document.getElementById(i).classList.contains('done'), id); }

(async () => {
  const run = makeRunner('QuickAudit Inline Create');
  const browser = await launch();
  const pageErrors = [];
  let lastDialog = null; const dialogs = [];

  try {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/sw\.js|ServiceWorker/.test(t)) pageErrors.push('CONSOLE: ' + t); });
    page.on('pageerror', e => pageErrors.push('PAGEERR: ' + e.message));
    page.on('dialog', async d => { lastDialog = d.message(); dialogs.push(lastDialog); await d.accept(); });

    await page.goto(QUICKAUDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const frame = await findAppFrame(page);
    if (!frame) { console.error('FATAL: app frame not found'); process.exit(1); }
    await frame.waitForSelector('#ac-ncr-0', { timeout: TIMEOUT });

    await run.check('Per-card icons present; old modal gone', async () => {
      const s = await frame.evaluate(() => ({
        icons: ['ac-cam-0', 'ac-ncr-0', 'ac-rt-0', 'ac-task-0'].every(id => !!document.getElementById(id)),
        noModal: !document.getElementById('qaCreateModal') && !document.getElementById('ac-act-0')
      }));
      if (!s.icons) return 'a per-card icon is missing';
      if (!s.noModal) return 'old modal / ac-act still present';
      return true;
    });

    await run.check('Score collapses to a chip', async () => {
      await frame.evaluate(() => setScore(_CFG.criteria[0].criterionId, 2, 0));
      const s = await frame.evaluate(() => ({
        hidden: document.getElementById('scores-0').style.display === 'none',
        chip: document.getElementById('picked-0').style.display !== 'none',
        val: document.getElementById('picked-0').textContent
      }));
      return (s.hidden && s.chip && s.val === '2') ? true : 'chip collapse failed: ' + JSON.stringify(s);
    });

    await run.check('Toggling NCR reveals its field group (desc + responsible + target)', async () => {
      await clickId(frame, 'ac-ncr-0');
      if (!(await createVisible(frame))) return 'create area not shown';
      const ok = (await fieldPresent(frame, 'nc_desc')) && (await fieldPresent(frame, 'nc_resp')) && (await fieldPresent(frame, 'nc_target'));
      return ok ? true : 'NCR fields (desc/resp/target) not all present';
    });

    await run.check('Adding Task → separate Task field appears (NCR fields kept)', async () => {
      await clickId(frame, 'ac-task-0');
      const ok = (await fieldPresent(frame, 'nc_desc')) && (await fieldPresent(frame, 'task_title'));
      return ok ? true : 'expected both nc_desc and task_title field groups';
    });

    await run.check('Optimistic: create row closes instantly, icons pending', async () => {
      await setField(frame, 'nc_desc', 'SMOKE_TEST inline e2e');
      await setField(frame, 'nc_resp', 'Auditor');
      await setField(frame, 'task_title', 'SMOKE_TEST task e2e');
      await clickId(frame, 'cbtn-0');
      await page.waitForTimeout(300);
      const s = await frame.evaluate(() => ({
        closed: document.getElementById('create-0').style.display === 'none',
        pending: document.getElementById('ac-ncr-0').classList.contains('pending') || document.getElementById('ac-ncr-0').classList.contains('done')
      }));
      return (s.closed && s.pending) ? true : 'not instant: ' + JSON.stringify(s);
    });

    await run.check('Background create completes → NCR + Task icons done', async () => {
      for (let i = 0; i < 90; i++) {
        if ((await iconDone(frame, 'ac-ncr-0')) && (await iconDone(frame, 'ac-task-0'))) return true;
        await page.waitForTimeout(500);
      }
      return 'icons not both done within 45s';
    });

    const { pass, total } = run.report();
    if (pageErrors.length) { console.log('\nPage errors:'); pageErrors.forEach(e => console.log('  ' + e)); }
    console.log('\nDialogs:'); dialogs.forEach((d, i) => console.log('  [' + i + '] ' + d));
    console.log('\n⚠️  PURGE: created 1 NCR + 1 linked Task (SMOKE_TEST inline e2e) → clasp run purgeSmokeTestData');

    await ctx.close(); await browser.close();
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error('FATAL:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
