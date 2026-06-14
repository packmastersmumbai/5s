// E2E: QuickAudit create modals — NCR, Task, RedTag (worker page, no login needed).
// Run: E2E_HEADED=1 node e2e-5s-audit-create.js
'use strict';

const { launch, newAuthContext, findAppFrame, makeRunner, EXEC } = require('./e2e-lib-5s');

const QUICKAUDIT_URL = EXEC + '?v2=1&action=quickaudit&zone=Z-01';
const TIMEOUT = 30000;

// ── helpers ───────────────────────────────────────────────────────────────────

async function waitForCards(frame) {
  // Wait until at least one criterion action button is in the DOM.
  await frame.waitForSelector('[id^="ac-ncr-"]', { timeout: TIMEOUT });
}

async function modalOpen(frame) {
  const cls = await frame.evaluate(() => {
    const m = document.getElementById('qaCreateModal');
    return m ? m.className : '';
  });
  return cls.includes('open');
}

async function modalClosed(frame) {
  return !(await modalOpen(frame));
}

async function groupVisible(frame, groupId) {
  return frame.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }, groupId);
}

async function modalTitle(frame) {
  return frame.evaluate(() => {
    const el = document.querySelector('#qaCreateModal .modal-title, #qaCreateModal h2, #qaCreateModal h3, #qaCreateModal .modal-header');
    return el ? el.innerText.trim() : '';
  });
}

async function clearAndType(frame, sel, value) {
  // Use evaluate to set value directly — avoids viewport/scroll issues inside the modal
  await frame.evaluate(({ s, v }) => {
    const el = document.querySelector(s);
    if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, { s: sel, v: value });
}

async function closeModalIfOpen(frame) {
  const open = await modalOpen(frame);
  if (!open) return;
  // Click backdrop or close button
  const closed = await frame.evaluate(() => {
    const btn = document.querySelector('#qaCreateModal .modal-close, #qaCreateModal [data-dismiss], #qaCreateBackdrop');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!closed) {
    // Press Escape
    await frame.press('body', 'Escape');
  }
  // Wait up to 3s for it to close
  for (let i = 0; i < 15; i++) {
    if (await modalClosed(frame)) return;
    await frame.page().waitForTimeout(200);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const run = makeRunner('QuickAudit Create Modals');
  const browser = await launch();
  const pageErrors = [];
  const dialogMessages = [];
  let lastDialog = null;

  try {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();

    // Capture console errors and page errors (ignore SW 404)
    page.on('console', m => {
      if (m.type() === 'error') {
        const txt = m.text();
        if (!txt.includes('sw.js') && !txt.includes('ServiceWorker') && !txt.includes('service-worker')) {
          pageErrors.push('CONSOLE_ERR: ' + txt);
        }
      }
    });
    page.on('pageerror', e => {
      const msg = e.message || String(e);
      if (!msg.includes('sw.js') && !msg.includes('ServiceWorker')) {
        pageErrors.push('PAGEERR: ' + msg);
      }
    });

    // Register dialog handler BEFORE any navigation
    page.on('dialog', async d => {
      lastDialog = d.message();
      dialogMessages.push(lastDialog);
      await d.accept();
    });

    // Navigate to QuickAudit (worker page — no username/password login)
    await page.goto(QUICKAUDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const frame = await findAppFrame(page);
    if (!frame) {
      console.error('FATAL: app frame not found');
      process.exit(1);
    }

    // Register same dialog handler on the frame's page (frame shares the page object, but belt+suspenders)
    // GAS iframes fire dialogs on the outer page — already handled above.

    await waitForCards(frame);

    // Dismiss any tour overlay that blocks clicks
    await frame.evaluate(() => {
      const dim  = document.getElementById('pmTourDim');
      const tip  = document.getElementById('pmTourTip');
      const skip = document.getElementById('pmTourSkip') ||
                   document.querySelector('[onclick*="skipTour"], [onclick*="closeTour"], .pm-tour-skip');
      if (skip) skip.click();
      if (tip)  tip.classList.remove('active');
      if (dim)  dim.classList.remove('active');
      // Also hide via style in case class removal isn't enough
      [dim, tip].forEach(el => { if (el) el.style.display = 'none'; });
    }).catch(() => {});
    await page.waitForTimeout(400);

    console.log('Criterion cards loaded. Beginning checks...\n');

    // ── Check 1: NCR modal ────────────────────────────────────────────────────
    await run.check('NCR modal opens on #ac-ncr-0 click', async () => {
      // Use JS click to bypass any remaining overlay and viewport issues
      await frame.evaluate(() => {
        const btn = document.getElementById('ac-ncr-0');
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);
      if (!(await modalOpen(frame))) return 'modal did not open';
      return true;
    });

    await run.check('NCR modal shows #qaCr-NC group visible', async () => {
      if (!(await groupVisible(frame, 'qaCr-NC'))) return '#qaCr-NC not visible';
      return true;
    });

    await run.check("NCR modal title references NCR/NC/Create", async () => {
      const title = await modalTitle(frame);
      if (!title.toLowerCase().match(/ncr|nc|raise|create/))
        return 'title was: ' + title;
      console.log('  NCR modal title: "' + title + '"');
      return true;
    });

    await run.check('#qaNcDesc field exists in modal', async () => {
      const val = await frame.evaluate(() => {
        const el = document.getElementById('qaNcDesc');
        return el ? el.value.trim() : null;
      });
      if (val === null) return '#qaNcDesc not found';
      // pre-fill is optional — report value but do not fail
      console.log('  #qaNcDesc current value: "' + val + '" (pre-fill: ' + (val ? 'YES' : 'NO') + ')');
      return true;
    });

    await run.check('NCR create submits successfully', async () => {
      lastDialog = null;
      await clearAndType(frame, '#qaNcDesc', 'SMOKE_TEST NCR e2e');
      await frame.evaluate(() => { const b = document.getElementById('qaCrSubmit'); if (b) b.click(); });
      // Wait for dialog (up to 15s — GAS round trip)
      for (let i = 0; i < 30; i++) {
        if (lastDialog !== null) break;
        await page.waitForTimeout(500);
      }
      if (lastDialog === null) return 'no dialog appeared after submit';
      const ok = /ncr|nc-|created/i.test(lastDialog);
      if (!ok) return 'dialog text: ' + lastDialog;
      return true;
    });

    await run.check('NCR modal closes after success', async () => {
      // Modal should auto-close after alert accepted
      for (let i = 0; i < 20; i++) {
        if (await modalClosed(frame)) return true;
        await page.waitForTimeout(300);
      }
      return 'modal still open after 6s';
    });

    console.log('  NCR success dialog: ' + (dialogMessages[0] || '(none)'));

    // ── Check 2: Task modal ───────────────────────────────────────────────────
    await run.check('Task modal opens on #ac-task-0 click', async () => {
      await frame.evaluate(() => { const b = document.getElementById('ac-task-0'); if (b) b.click(); });
      await page.waitForTimeout(1000);
      if (!(await modalOpen(frame))) return 'modal did not open';
      return true;
    });

    await run.check('Task modal shows #qaCr-TASK group visible', async () => {
      if (!(await groupVisible(frame, 'qaCr-TASK'))) return '#qaCr-TASK not visible';
      return true;
    });

    await run.check("Task modal title is 'Create Task'", async () => {
      const title = await modalTitle(frame);
      if (!title.toLowerCase().includes('task')) return 'title was: ' + title;
      return true;
    });

    await run.check('Task create submits successfully', async () => {
      lastDialog = null;
      await clearAndType(frame, '#qaTaskTitle', 'SMOKE_TEST task e2e');
      await frame.evaluate(() => { const b = document.getElementById('qaCrSubmit'); if (b) b.click(); });
      for (let i = 0; i < 30; i++) {
        if (lastDialog !== null) break;
        await page.waitForTimeout(500);
      }
      if (lastDialog === null) return 'no dialog appeared after submit';
      const ok = /task|tk-|created/i.test(lastDialog);
      if (!ok) return 'dialog text: ' + lastDialog;
      return true;
    });

    await run.check('Task modal closes after success', async () => {
      for (let i = 0; i < 20; i++) {
        if (await modalClosed(frame)) return true;
        await page.waitForTimeout(300);
      }
      return 'modal still open after 6s';
    });

    console.log('  Task success dialog: ' + (dialogMessages[1] || '(none)'));

    // ── Check 3: RedTag modal ─────────────────────────────────────────────────
    await run.check('RedTag modal opens on #ac-rt-0 click', async () => {
      await frame.evaluate(() => { const b = document.getElementById('ac-rt-0'); if (b) b.click(); });
      await page.waitForTimeout(1000);
      if (!(await modalOpen(frame))) return 'modal did not open';
      return true;
    });

    await run.check('RedTag modal shows #qaCr-REDTAG group visible', async () => {
      if (!(await groupVisible(frame, 'qaCr-REDTAG'))) return '#qaCr-REDTAG not visible';
      return true;
    });

    await run.check("RedTag modal title contains 'Red Tag'", async () => {
      const title = await modalTitle(frame);
      if (!title.toLowerCase().includes('red')) return 'title was: ' + title;
      return true;
    });

    await run.check('RedTag create submits successfully', async () => {
      lastDialog = null;
      await clearAndType(frame, '#qaRtItem', 'SMOKE_TEST redtag e2e');
      await frame.evaluate(() => { const b = document.getElementById('qaCrSubmit'); if (b) b.click(); });
      for (let i = 0; i < 30; i++) {
        if (lastDialog !== null) break;
        await page.waitForTimeout(500);
      }
      if (lastDialog === null) return 'no dialog appeared after submit';
      const ok = /red.?tag|rt-|created/i.test(lastDialog);
      if (!ok) return 'dialog text: ' + lastDialog;
      return true;
    });

    await run.check('RedTag modal closes after success', async () => {
      for (let i = 0; i < 20; i++) {
        if (await modalClosed(frame)) return true;
        await page.waitForTimeout(300);
      }
      return 'modal still open after 6s';
    });

    console.log('  RedTag success dialog: ' + (dialogMessages[2] || '(none)'));

    // ── Check 4: Negative — empty description validation ──────────────────────
    await run.check('Negative: empty NCR desc triggers validation dialog', async () => {
      lastDialog = null;
      await frame.evaluate(() => { const b = document.getElementById('ac-ncr-0'); if (b) b.click(); });
      await page.waitForTimeout(1000);
      if (!(await modalOpen(frame))) return 'modal did not open for negative test';
      // Clear the description field via JS
      await frame.evaluate(() => {
        const el = document.getElementById('qaNcDesc');
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      await frame.evaluate(() => { const b = document.getElementById('qaCrSubmit'); if (b) b.click(); });
      for (let i = 0; i < 10; i++) {
        if (lastDialog !== null) break;
        await page.waitForTimeout(400);
      }
      if (lastDialog === null) return 'no validation dialog appeared';
      const ok = /description|required|empty|fill/i.test(lastDialog);
      if (!ok) return 'unexpected dialog: ' + lastDialog;
      return true;
    });

    await run.check('Negative: modal stays open after validation failure', async () => {
      // Modal should still be open (validation didn't close it)
      if (await modalOpen(frame)) return true;
      return 'modal closed unexpectedly after validation error';
    });

    await run.check('Negative: close modal after validation', async () => {
      await closeModalIfOpen(frame);
      for (let i = 0; i < 15; i++) {
        if (await modalClosed(frame)) return true;
        await page.waitForTimeout(200);
      }
      return 'modal failed to close';
    });

    // ── Report ────────────────────────────────────────────────────────────────
    const { pass, total } = run.report();

    if (pageErrors.length) {
      console.log('\nReal page errors collected:');
      pageErrors.forEach(e => console.log('  ' + e));
    } else {
      console.log('\nNo real page errors.');
    }

    console.log('\nAll captured dialog messages:');
    dialogMessages.forEach((d, i) => console.log('  [' + i + '] ' + d));

    console.log('\n⚠️  PURGE REMINDER: This run created up to 3 smoke test records in the live spreadsheet:');
    console.log('   - 1 NCR  with description: "SMOKE_TEST NCR e2e"');
    console.log('   - 1 Task with title:        "SMOKE_TEST task e2e"');
    console.log('   - 1 Red Tag with item:      "SMOKE_TEST redtag e2e"');
    console.log('   Open the Google Sheet (NC_Log / Task_Log / RedTag_Log tabs) and DELETE those rows manually.');

    await ctx.close();
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
