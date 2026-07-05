// E2E: QuickAudit unified "Raise action" modal — single button, multi-select
// (NCR / Red Tag / Task) with a common linked record (worker page, no login).
// Run: E2E_HEADED=1 node e2e-5s-audit-create.js
'use strict';

const { launch, newAuthContext, findAppFrame, makeRunner, EXEC } = require('./e2e-lib-5s');

const QUICKAUDIT_URL = EXEC + '?v2=1&action=quickaudit&zone=Z-01';
const TIMEOUT = 30000;

async function waitForCards(frame) {
  await frame.waitForSelector('#ac-act-0', { timeout: TIMEOUT });
}
async function modalOpen(frame) {
  return frame.evaluate(() => {
    const m = document.getElementById('qaCreateModal');
    return !!m && m.className.includes('open');
  });
}
async function groupVisible(frame, id) {
  return frame.evaluate((gid) => {
    const el = document.getElementById(gid);
    return !!el && window.getComputedStyle(el).display !== 'none';
  }, id);
}
async function tick(frame, id) {
  await frame.evaluate((cid) => {
    const el = document.getElementById(cid);
    if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }, id);
}
async function setVal(frame, sel, v) {
  await frame.evaluate(({ s, val }) => {
    const el = document.querySelector(s);
    if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, { s: sel, val: v });
}
async function clickId(frame, id) {
  await frame.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); }, id);
}
async function waitDialog(page, getLast, ms) {
  const end = Date.now() + (ms || 15000);
  while (Date.now() < end) { if (getLast() !== null) return true; await page.waitForTimeout(400); }
  return false;
}

(async () => {
  const run = makeRunner('QuickAudit Raise-action Modal');
  const browser = await launch();
  const pageErrors = [];
  let lastDialog = null;
  const dialogs = [];

  try {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/sw\.js|ServiceWorker|service-worker/.test(t)) pageErrors.push('CONSOLE: ' + t);
    });
    page.on('pageerror', e => { if (!/ServiceWorker/.test(e.message)) pageErrors.push('PAGEERR: ' + e.message); });
    page.on('dialog', async d => { lastDialog = d.message(); dialogs.push(lastDialog); await d.accept(); });

    await page.goto(QUICKAUDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const frame = await findAppFrame(page);
    if (!frame) { console.error('FATAL: app frame not found'); process.exit(1); }
    await waitForCards(frame);

    // Dismiss guided tour overlay if present
    await frame.evaluate(() => {
      const skip = document.getElementById('pmTourSkip') || document.querySelector('[onclick*="skipTour"],[onclick*="closeTour"]');
      if (skip) skip.click();
      ['pmTourDim', 'pmTourTip'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    }).catch(() => {});
    await page.waitForTimeout(400);

    // ── Single button opens the unified modal ──────────────────────────────
    await run.check('Single #ac-act-0 button (old per-type buttons gone)', async () => {
      const state = await frame.evaluate(() => ({
        act: !!document.getElementById('ac-act-0'),
        old: !!document.getElementById('ac-ncr-0') || !!document.getElementById('ac-task-0') || !!document.getElementById('ac-rt-0')
      }));
      if (!state.act) return 'ac-act-0 missing';
      if (state.old) return 'old ac-ncr/task/rt buttons still present';
      return true;
    });

    await run.check('Modal opens with title "Raise action"', async () => {
      await clickId(frame, 'ac-act-0');
      await page.waitForTimeout(800);
      if (!(await modalOpen(frame))) return 'modal did not open';
      const title = await frame.evaluate(() => (document.getElementById('qaCrModalTitle') || {}).textContent || '');
      if (!/raise action/i.test(title)) return 'title was: ' + title;
      return true;
    });

    await run.check('Three type checkboxes present, none pre-ticked', async () => {
      const s = await frame.evaluate(() => {
        const all = ['qaChkNC', 'qaChkRT', 'qaChkTASK'].map(id => document.getElementById(id));
        if (all.some(e => !e)) return 'missing';
        return all.some(e => e.checked) ? 'pretick' : 'ok';
      });
      if (s === 'missing') return 'a checkbox is missing';
      if (s === 'pretick') return 'a checkbox was pre-ticked';
      return true;
    });

    await run.check('Field groups hidden until ticked', async () => {
      const anyVisible = (await groupVisible(frame, 'qaCr-NC')) || (await groupVisible(frame, 'qaCr-TASK')) || (await groupVisible(frame, 'qaCr-REDTAG'));
      return anyVisible ? 'a group is visible with nothing ticked' : true;
    });

    await run.check('Ticking NCR reveals its field group', async () => {
      await tick(frame, 'qaChkNC');
      await page.waitForTimeout(200);
      return (await groupVisible(frame, 'qaCr-NC')) ? true : 'qaCr-NC still hidden';
    });

    // ── Negative: submit with nothing ticked ───────────────────────────────
    await run.check('Submit with no type ticked → validation dialog', async () => {
      await frame.evaluate(() => { ['qaChkNC', 'qaChkRT', 'qaChkTASK'].forEach(id => { const e = document.getElementById(id); if (e) { e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true })); } }); });
      lastDialog = null;
      await clickId(frame, 'qaCrSubmit');
      if (!(await waitDialog(page, () => lastDialog, 6000))) return 'no dialog';
      return /select at least one/i.test(lastDialog) ? true : 'dialog: ' + lastDialog;
    });

    // ── Multi-select common record: NCR + Task ─────────────────────────────
    await run.check('Multi-select NCR + Task creates a common record', async () => {
      await tick(frame, 'qaChkNC');
      await tick(frame, 'qaChkTASK');
      await setVal(frame, '#qaNcDesc', 'SMOKE_TEST multi NCR e2e');
      await setVal(frame, '#qaTaskTitle', 'SMOKE_TEST multi Task e2e');
      lastDialog = null;
      await clickId(frame, 'qaCrSubmit');
      if (!(await waitDialog(page, () => lastDialog, 25000))) return 'no dialog after submit';
      const hasNcr = /ncr\s+\S/i.test(lastDialog);
      const hasTask = /task\s+\S/i.test(lastDialog);
      if (!hasNcr || !hasTask) return 'summary missing NCR or Task: ' + lastDialog;
      return true;
    });

    await run.check('Modal closes after multi-create success', async () => {
      for (let i = 0; i < 20; i++) { if (!(await modalOpen(frame))) return true; await page.waitForTimeout(300); }
      return 'modal still open';
    });

    const { pass, total } = run.report();
    if (pageErrors.length) { console.log('\nPage errors:'); pageErrors.forEach(e => console.log('  ' + e)); }
    console.log('\nDialogs:'); dialogs.forEach((d, i) => console.log('  [' + i + '] ' + d));
    console.log('\n⚠️  PURGE REMINDER: this run created 1 NCR + 1 linked Task (SMOKE_TEST … e2e).');
    console.log('   Purge via: clasp run purgeSmokeTestData  (or delete rows in NC_CAPA / Task sheets).');

    await ctx.close();
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error('FATAL:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
