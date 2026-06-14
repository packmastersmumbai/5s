// PackMasters 5S — E2E test for Create modal on ActionsHub
// Run: E2E_HEADED=1 node e2e-5s-create.js
'use strict';
const { launch, loginAdmin, gotoAction, makeRunner } = require('./e2e-lib-5s');

// Re-acquire the GAS sandbox frame after navigation
async function reAcquireFrame(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 30000);
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
      try {
        const info = await f.evaluate(() => {
          const txt = document.body ? document.body.innerText : '';
          return {
            hasLoginForm: !!document.getElementById('loginForm'),
            hasActionsHub: !!(document.querySelector('.ah-type-tabs') || document.querySelector('.ah-card') || document.getElementById('ahContent') || document.querySelector('.ah-create-btn')),
            txtLen: txt.length
          };
        });
        if (!info.hasLoginForm && (info.hasActionsHub || info.txtLen > 100)) return f;
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// Wait for card list to finish loading
async function waitForCards(frame, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    try {
      const loading = await frame.evaluate(() => {
        const el = document.querySelector('.ah-loading');
        return el ? el.offsetParent !== null : false;
      });
      if (!loading) return true;
    } catch (_) {}
    await frame.page().waitForTimeout(400);
  }
  return false;
}

// Poll for a DOM toast to appear
async function waitForToast(frame, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    try {
      const toast = await frame.evaluate(() => {
        const toasts = document.querySelectorAll('.pm-toast, .toast, [class*="toast"]');
        if (toasts.length === 0) return null;
        return toasts[toasts.length - 1].textContent.trim();
      });
      if (toast) return toast;
    } catch (_) {}
    await frame.page().waitForTimeout(400);
  }
  return null;
}

// Wait for a dialog OR toast
async function waitForFeedback(frame, dialogs, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  const initLen = dialogs.length;
  while (Date.now() < deadline) {
    if (dialogs.length > initLen) return { source: 'dialog', text: dialogs[dialogs.length - 1] };
    try {
      const toast = await frame.evaluate(() => {
        const toasts = document.querySelectorAll('.pm-toast, .toast, [class*="toast"]');
        for (let i = toasts.length - 1; i >= 0; i--) {
          const t = toasts[i].textContent.trim();
          if (t) return t;
        }
        return null;
      });
      if (toast) return { source: 'toast', text: toast };
    } catch (_) {}
    await frame.page().waitForTimeout(400);
  }
  return null;
}

// Clear DOM toasts
async function clearToasts(frame) {
  await frame.evaluate(() => {
    document.querySelectorAll('.pm-toast, .toast, [class*="toast"]').forEach(t => t.remove());
  }).catch(() => {});
}

// Assert modal open state
async function isModalOpen(frame) {
  return frame.evaluate(() => {
    const m = document.getElementById('acCreateModal');
    return m ? m.classList.contains('open') : false;
  }).catch(() => false);
}

// Wait for acZone to have options (zones load async from ahZoneSelect)
async function waitForZoneOptions(frame, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    const count = await frame.evaluate(() => {
      const sel = document.getElementById('acZone');
      return sel ? sel.options.length : 0;
    }).catch(() => 0);
    if (count > 1) return true;
    await frame.page().waitForTimeout(500);
  }
  return false;
}

// Open create modal via button click
async function openModal(frame) {
  await frame.evaluate(() => {
    const btn = document.querySelector('.ah-create-btn');
    if (btn) btn.click();
    else openCreateModal();
  });
  // wait for modal open class
  for (let i = 0; i < 20; i++) {
    if (await isModalOpen(frame)) return true;
    await frame.page().waitForTimeout(300);
  }
  return false;
}

// Close modal explicitly
async function closeModal(frame) {
  await frame.evaluate(() => {
    const btn = document.querySelector('.ac-cancel');
    if (btn) btn.click();
    else closeCreateModal();
  }).catch(() => {});
  await frame.page().waitForTimeout(500);
}

const createdIds = { nc: null, task: null, redTag: null };

async function main() {
  const runner = makeRunner('Create Modal E2E');
  let browser, ctx, page, frame, errors;
  const dialogs = [];

  try {
    browser = await launch();
    ({ ctx, page, frame, errors } = await loginAdmin(browser));
  } catch (e) {
    console.error('FATAL: login failed —', e.message);
    process.exit(2);
  }

  // Register dialog handler BEFORE any submits
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });

  // Capture real page errors (ignore SW 404)
  const realErrors = [];
  page.on('pageerror', e => {
    if (!e.message.includes('sw.js') && !e.message.includes('ServiceWorker')) {
      realErrors.push('PAGEERR: ' + e.message);
    }
  });
  const consoleErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push('CONSOLE: ' + m.text());
  });

  // Navigate to ActionsHub
  console.log('Navigating to actionlist (ActionsHub)…');
  await gotoAction(page, frame, 'actionlist');
  frame = await reAcquireFrame(page, 30000);
  if (!frame) { console.error('FATAL: Could not acquire ActionsHub frame'); process.exit(2); }
  await waitForCards(frame, 20000);
  console.log('ActionsHub loaded.');

  // ── CHECK 1: Click '+ Create' -> modal opens ──────────────────────────────
  await runner.check('1. Click "+ Create" -> acCreateModal opens (gets .open class)', async () => {
    const opened = await openModal(frame);
    if (!opened) return 'acCreateModal did not get .open class after clicking + Create';
    console.log('  Modal opened.');
    // NC group should be visible by default
    const ncVisible = await frame.evaluate(() => {
      const g = document.getElementById('acGrpNC');
      return g ? (g.style.display !== 'none') : false;
    });
    if (!ncVisible) return 'acGrpNC not visible on modal open (expected NC as default type)';
    console.log('  acGrpNC visible (NC is default type).');
    return true;
  });

  // ── CHECK 2: NC create ────────────────────────────────────────────────────
  await runner.check('2. NC create — fill zone/pillar/desc -> success toast with NC-xxx; modal closes', async () => {
    // Modal should already be open from check 1; if not, reopen
    if (!(await isModalOpen(frame))) {
      const ok = await openModal(frame);
      if (!ok) return 'Could not open modal for NC create test';
    }

    // Wait for zone options to populate
    const zonesReady = await waitForZoneOptions(frame, 15000);
    if (!zonesReady) return 'Zone select (acZone) has no options after 15s — zones not loaded';
    console.log('  Zone options available.');

    // Select zone Z-01
    await frame.evaluate(() => {
      const sel = document.getElementById('acZone');
      // find Z-01 option
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === 'Z-01' || sel.options[i].text.includes('Z-01')) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });

    // Pick pillar S1 (default)
    await frame.evaluate(() => {
      document.getElementById('acNcPillar').value = 'S1';
    });

    // Fill description
    await clearToasts(frame);
    await frame.fill('#acNcDesc', 'SMOKE_TEST nc create e2e');

    const dialogsBefore = dialogs.length;
    // Click Create
    await frame.click('#acSubmitBtn');
    console.log('  Submitted NC create…');

    // Wait for feedback (GAS can take 30s)
    const fb = await waitForFeedback(frame, dialogs, 40000);
    console.log('  NC create feedback:', fb);

    if (!fb) return 'No feedback received after NC create submit (server timeout?)';

    const text = fb.text.toLowerCase();
    const isSuccess = text.includes('nc-') || text.includes('nc created') || text.includes('created');
    if (!isSuccess) return 'Expected success with NC- id but got: ' + fb.text;

    // Extract NC id
    const idMatch = fb.text.match(/NC-\d+/i);
    if (idMatch) { createdIds.nc = idMatch[0]; console.log('  Created NC id:', createdIds.nc); }

    // Modal should close
    await page.waitForTimeout(1000);
    const stillOpen = await isModalOpen(frame);
    if (stillOpen) return 'Modal did not close after NC creation success';
    console.log('  Modal closed after NC create.');

    await waitForCards(frame, 15000);
    return true;
  });

  // ── CHECK 3: Task create ──────────────────────────────────────────────────
  await runner.check('3. Task create — select Task type; fill zone/title -> success toast with TK- or Task; modal closes', async () => {
    const opened = await openModal(frame);
    if (!opened) return 'Could not open modal for Task create test';

    // Switch to TASK type
    await frame.evaluate(() => {
      const btn = document.querySelector('[data-actype="TASK"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(400);

    // Assert TASK group visible, NC hidden
    const taskVisible = await frame.evaluate(() => {
      const tg = document.getElementById('acGrpTASK');
      const ng = document.getElementById('acGrpNC');
      return {
        task: tg ? (tg.style.display !== 'none') : false,
        nc: ng ? (ng.style.display !== 'none') : false
      };
    });
    console.log('  After TASK type switch:', taskVisible);
    if (!taskVisible.task) return 'acGrpTASK not visible after selecting Task type';
    if (taskVisible.nc) return 'acGrpNC still visible after switching to Task type';

    // Wait for zones
    const zonesReady = await waitForZoneOptions(frame, 12000);
    if (!zonesReady) return 'Zone select has no options for Task create';

    // Select Z-01
    await frame.evaluate(() => {
      const sel = document.getElementById('acZone');
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === 'Z-01' || sel.options[i].text.includes('Z-01')) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });

    // Fill title
    await clearToasts(frame);
    await frame.fill('#acTaskTitle', 'SMOKE_TEST task create e2e');

    const dialogsBefore = dialogs.length;
    await frame.click('#acSubmitBtn');
    console.log('  Submitted Task create…');

    const fb = await waitForFeedback(frame, dialogs, 40000);
    console.log('  Task create feedback:', fb);

    if (!fb) return 'No feedback after Task create submit (server timeout?)';

    const text = fb.text.toLowerCase();
    const isSuccess = text.includes('tk-') || text.includes('task created') || text.includes('task') || text.includes('created');
    if (!isSuccess) return 'Expected success with TK- or Task id but got: ' + fb.text;

    const idMatch = fb.text.match(/TK-\d+/i);
    if (idMatch) { createdIds.task = idMatch[0]; console.log('  Created Task id:', createdIds.task); }
    else {
      // extract any numeric id
      const numMatch = fb.text.match(/[A-Z]+-\d+|\d{4,}/);
      if (numMatch) createdIds.task = numMatch[0];
      console.log('  Task id from toast:', createdIds.task || '(none extracted)');
    }

    await page.waitForTimeout(1000);
    const stillOpen = await isModalOpen(frame);
    if (stillOpen) return 'Modal did not close after Task creation success';
    console.log('  Modal closed after Task create.');

    await waitForCards(frame, 15000);
    return true;
  });

  // ── CHECK 4: Red Tag create ───────────────────────────────────────────────
  await runner.check('4. Red Tag create — select Red Tag type; fill zone/item -> success toast with RT- or Red Tag; modal closes', async () => {
    const opened = await openModal(frame);
    if (!opened) return 'Could not open modal for Red Tag create test';

    // Switch to RED_TAG type
    await frame.evaluate(() => {
      const btn = document.querySelector('[data-actype="RED_TAG"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(400);

    // Assert RED_TAG group visible
    const rtVisible = await frame.evaluate(() => {
      const rg = document.getElementById('acGrpRED_TAG');
      const ng = document.getElementById('acGrpNC');
      return {
        rt: rg ? (rg.style.display !== 'none') : false,
        nc: ng ? (ng.style.display !== 'none') : false
      };
    });
    console.log('  After RED_TAG type switch:', rtVisible);
    if (!rtVisible.rt) return 'acGrpRED_TAG not visible after selecting Red Tag type';
    if (rtVisible.nc) return 'acGrpNC still visible after switching to Red Tag type';

    // Wait for zones
    const zonesReady = await waitForZoneOptions(frame, 12000);
    if (!zonesReady) return 'Zone select has no options for Red Tag create';

    // Select Z-01
    await frame.evaluate(() => {
      const sel = document.getElementById('acZone');
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === 'Z-01' || sel.options[i].text.includes('Z-01')) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });

    // Fill item
    await clearToasts(frame);
    await frame.fill('#acRtItem', 'SMOKE_TEST redtag create e2e');

    const dialogsBefore = dialogs.length;
    await frame.click('#acSubmitBtn');
    console.log('  Submitted Red Tag create…');

    const fb = await waitForFeedback(frame, dialogs, 40000);
    console.log('  Red Tag create feedback:', fb);

    if (!fb) return 'No feedback after Red Tag create submit (server timeout?)';

    const text = fb.text.toLowerCase();
    const isSuccess = text.includes('rt-') || text.includes('red tag raised') || text.includes('red tag') || text.includes('raised') || text.includes('created');
    if (!isSuccess) return 'Expected success with RT- or Red Tag id but got: ' + fb.text;

    const idMatch = fb.text.match(/RT-\d+/i);
    if (idMatch) { createdIds.redTag = idMatch[0]; console.log('  Created Red Tag id:', createdIds.redTag); }
    else {
      const numMatch = fb.text.match(/[A-Z]+-\d+|\d{4,}/);
      if (numMatch) createdIds.redTag = numMatch[0];
      console.log('  Red Tag id from toast:', createdIds.redTag || '(none extracted)');
    }

    await page.waitForTimeout(1000);
    const stillOpen = await isModalOpen(frame);
    if (stillOpen) return 'Modal did not close after Red Tag creation success';
    console.log('  Modal closed after Red Tag create.');

    await waitForCards(frame, 15000);
    return true;
  });

  // ── CHECK 5: Validation — NC with empty Description ───────────────────────
  let validationMsg = null;
  await runner.check('5. Validation — NC type, zone selected, empty Description -> toast/dialog with "Description"/"required"; modal stays open', async () => {
    const opened = await openModal(frame);
    if (!opened) return 'Could not open modal for validation test';

    // Should already be NC type (reset on open); ensure it
    await frame.evaluate(() => {
      const btn = document.querySelector('[data-actype="NC"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);

    // Wait for zones
    const zonesReady = await waitForZoneOptions(frame, 12000);
    if (!zonesReady) return 'Zone select has no options for validation test';

    // Select a zone
    await frame.evaluate(() => {
      const sel = document.getElementById('acZone');
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === 'Z-01' || sel.options[i].text.includes('Z-01')) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });

    // Leave Description EMPTY (it was cleared on open)
    await clearToasts(frame);
    const dialogsBefore = dialogs.length;

    await frame.click('#acSubmitBtn');
    console.log('  Submitted with empty Description…');

    // Wait for validation toast
    const fb = await waitForFeedback(frame, dialogs, 8000);
    console.log('  Validation feedback:', fb);
    validationMsg = fb ? fb.text : '(none)';

    if (!fb) return 'No validation feedback shown when Description is empty';

    const text = fb.text.toLowerCase();
    const isValidation = text.includes('description') || text.includes('required') || text.includes('desc');
    if (!isValidation) return 'Expected "Description"/"required" in validation message but got: ' + fb.text;

    // Modal must remain open
    const stillOpen = await isModalOpen(frame);
    if (!stillOpen) return 'Modal closed after empty Description submit — validation NOT enforced';
    console.log('  Modal still open (validation enforced). Message:', fb.text);

    // Close modal cleanly
    await closeModal(frame);
    return true;
  });

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  const { pass, total } = runner.report();

  console.log('\n===== CREATED IDS =====');
  console.log('  NC      :', createdIds.nc   || '(not extracted — see toast text in check 2)');
  console.log('  Task    :', createdIds.task  || '(not extracted — see toast text in check 3)');
  console.log('  Red Tag :', createdIds.redTag || '(not extracted — see toast text in check 4)');

  console.log('\n===== VALIDATION MESSAGE OBSERVED =====');
  console.log(' ', validationMsg);

  if (realErrors.length > 0) {
    console.log('\nREAL PAGE ERRORS:');
    realErrors.forEach(e => console.log('  ', e));
  } else {
    console.log('\nNo real page errors detected.');
  }

  console.log('\nCOMMAND: E2E_HEADED=1 node e2e-5s-create.js');

  console.log('\n⚠  PURGE REMINDER:');
  console.log('   3 SMOKE_TEST records were created (NC, Task, Red Tag tagged with "SMOKE_TEST").');
  console.log('   Run this to purge them from the spreadsheet:');
  console.log('     clasp run purgeSmokeTestData');

  await browser.close();
  process.exit(pass === total ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
