// PackMasters 5S — E2E Interaction Tests (modal open, red tag submit)
// Run: E2E_HEADED=1 node e2e-5s-interact.js
const { launch, loginAdmin, findAppFrame, gotoAction, makeRunner } = require('./e2e-lib-5s');

const SW_NOISE = /bad HTTP response code.*404/i;

// Re-acquire sandbox frame after URL navigation (same pattern as render sweep)
async function reAcquireFrame(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 25000);
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
      try {
        const info = await f.evaluate(() => {
          const txt = document.body ? document.body.innerText : '';
          return {
            hasLoginForm: !!document.getElementById('loginForm'),
            isReportAbuse: txt.includes('Report abuse'),
            txtLen: txt.length
          };
        });
        if (!info.hasLoginForm && !info.isReportAbuse && info.txtLen > 50) return f;
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function main() {
  const runner = makeRunner('PackMasters 5S Interaction Tests');
  let browser, ctx, page, frame, errors;

  try {
    browser = await launch();
    ({ ctx, page, frame, errors } = await loginAdmin(browser));
  } catch (e) {
    console.error('FATAL: could not launch/login —', e.message);
    process.exit(2);
  }

  // ── A) RECORD DETAIL MODAL (ActionList) ──────────────────────────────────

  const alNavMode = await gotoAction(page, frame, 'actionlist');
  console.log('  [info] ActionList nav mode:', alNavMode);
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 25000);

  // Wait for NC/CAPA cards to appear (up to 20s)
  let ncCardFound = false;
  for (let i = 0; i < 40; i++) {
    const count = await frame.evaluate(() => {
      return document.querySelectorAll('.card-clickable').length;
    }).catch(() => 0);
    if (count > 0) { ncCardFound = true; break; }
    await page.waitForTimeout(500);
  }

  await runner.check('A1: ActionList — NC/CAPA clickable card exists', async () => {
    if (!frame) return 'frame unavailable';
    if (!ncCardFound) {
      const txt = await frame.evaluate(() => document.body.innerText.substring(0, 200)).catch(() => '');
      return 'no .card-clickable found; page: ' + txt.replace(/\n/g, ' ').substring(0, 120);
    }
    return true;
  });

  let modalOpened = false;
  let detailBodyText = '';

  if (ncCardFound && frame) {
    await runner.check('A2: Click NC card body — modal gets class "open"', async () => {
      // Click first .card-clickable element
      await frame.evaluate(() => {
        const el = document.querySelector('.card-clickable');
        if (el) el.click();
      });
      // Poll up to 8s for modal to get .open class
      for (let i = 0; i < 16; i++) {
        const isOpen = await frame.evaluate(() => {
          const modal = document.getElementById('recordDetailModal');
          const backdrop = document.getElementById('rdBackdrop');
          return modal && modal.classList.contains('open') &&
                 backdrop && backdrop.classList.contains('open');
        }).catch(() => false);
        if (isOpen) { modalOpened = true; return true; }
        await page.waitForTimeout(500);
      }
      const state = await frame.evaluate(() => {
        const m = document.getElementById('recordDetailModal');
        return m ? 'classes: ' + m.className + ' display: ' + getComputedStyle(m).display : 'modal not found';
      }).catch(() => 'eval error');
      return 'modal did not get class "open" after 8s; state: ' + state;
    });

    if (modalOpened) {
      await runner.check('A3: #recordDetailBody populated with real detail (non-loading text)', async () => {
        // Wait up to 15s for google.script.run.getNcDetail to return and render
        for (let i = 0; i < 30; i++) {
          const result = await frame.evaluate(() => {
            const body = document.getElementById('recordDetailBody');
            if (!body) return { isEmpty: true, text: '' };
            const txt = body.innerText || '';
            const isLoading = txt.includes('Loading…') || txt.includes('Loading...');
            return { isEmpty: txt.trim().length < 5, isLoading, text: txt.substring(0, 200) };
          }).catch(() => ({ isEmpty: true, isLoading: true, text: '' }));

          if (!result.isEmpty && !result.isLoading) {
            detailBodyText = result.text;
            // Must contain at least one known field label or zone ID pattern
            const hasContent = /Z-\d{2}|Zone|Status|ID|Pillar|Description|Responsible|Auditor/i.test(result.text);
            if (hasContent) return true;
            return 'body populated but missing expected field labels; text: ' + result.text.replace(/\n/g, ' ');
          }
          await page.waitForTimeout(500);
        }
        const body = await frame.evaluate(() => {
          const el = document.getElementById('recordDetailBody');
          return el ? el.innerText.substring(0, 200) : '(not found)';
        }).catch(() => '');
        return 'detail body still loading/empty after 15s; content: ' + body.replace(/\n/g, ' ');
      });

      await runner.check('A4: Close modal — modal loses "open" class', async () => {
        // Click close button
        await frame.evaluate(() => {
          const btn = document.querySelector('.rd-modal__close');
          if (btn) btn.click();
        });
        await page.waitForTimeout(600);
        const isClosed = await frame.evaluate(() => {
          const modal = document.getElementById('recordDetailModal');
          const backdrop = document.getElementById('rdBackdrop');
          return modal && !modal.classList.contains('open') &&
                 backdrop && !backdrop.classList.contains('open');
        }).catch(() => false);
        return isClosed === true ? true : 'modal still has "open" class after close click';
      });
    } else {
      runner.results.push({ name: 'A3: #recordDetailBody populated with real detail (non-loading text)', pass: false, detail: 'SKIPPED — modal never opened' });
      runner.results.push({ name: 'A4: Close modal — modal loses "open" class', pass: false, detail: 'SKIPPED — modal never opened' });
    }
  } else {
    runner.results.push({ name: 'A2: Click NC card body — modal gets class "open"', pass: false, detail: 'SKIPPED — no NC cards found' });
    runner.results.push({ name: 'A3: #recordDetailBody populated with real detail (non-loading text)', pass: false, detail: 'SKIPPED — no NC cards found' });
    runner.results.push({ name: 'A4: Close modal — modal loses "open" class', pass: false, detail: 'SKIPPED — no NC cards found' });
  }

  // ── B) RED TAG SUBMIT END-TO-END ─────────────────────────────────────────

  const rtNavMode = await gotoAction(page, frame, 'raiseredtag');
  console.log('  [info] RedTag nav mode:', rtNavMode);
  await page.waitForTimeout(1000);
  frame = await reAcquireFrame(page, 25000);

  // Wait for zone select to be populated (live getAllZoneIds call)
  let zonesLoaded = false;
  for (let i = 0; i < 40; i++) {
    const count = await frame.evaluate(() => {
      const sel = document.getElementById('f-zone');
      return sel ? sel.options.length : 0;
    }).catch(() => 0);
    if (count >= 2) { zonesLoaded = true; break; }
    await page.waitForTimeout(500);
  }

  await runner.check('B1: RedTagForm — zone select populated (>= 2 options after getAllZoneIds)', async () => {
    if (!frame) return 'frame unavailable';
    if (!zonesLoaded) {
      const count = await frame.evaluate(() => {
        const sel = document.getElementById('f-zone');
        return sel ? sel.options.length : -1;
      }).catch(() => -1);
      return 'zone select has ' + count + ' options (expected >= 2)';
    }
    return true;
  });

  const ts = Date.now();
  const marker = 'E2E_TEST_RT ' + ts;
  let tagNo = null;
  let submitSuccess = false;

  if (zonesLoaded && frame) {
    await runner.check('B2: Fill form fields (zone Z-01, description, qty, category, reason, taggedBy)', async () => {
      // zone
      await frame.evaluate(() => {
        const sel = document.getElementById('f-zone');
        sel.value = 'Z-01';
      });
      // description (textarea id=f-item)
      await frame.fill('#f-item', marker);
      // qty
      await frame.fill('#f-qty', '1');
      // category
      await frame.evaluate(() => {
        const sel = document.getElementById('f-category');
        // pick first non-empty option
        for (let i = 1; i < sel.options.length; i++) {
          if (sel.options[i].value) { sel.value = sel.options[i].value; break; }
        }
      });
      // reason
      await frame.evaluate(() => {
        const sel = document.getElementById('f-reason');
        for (let i = 1; i < sel.options.length; i++) {
          if (sel.options[i].value) { sel.value = sel.options[i].value; break; }
        }
      });
      // taggedBy
      await frame.fill('#f-taggedby', 'E2E-Test-Runner');

      // Verify all required fields have values
      const valid = await frame.evaluate(() => {
        const zone     = document.getElementById('f-zone').value;
        const item     = document.getElementById('f-item').value;
        const category = document.getElementById('f-category').value;
        const reason   = document.getElementById('f-reason').value;
        const taggedBy = document.getElementById('f-taggedby').value;
        return { zone, item, category, reason, taggedBy };
      });
      if (!valid.zone || !valid.item || !valid.category || !valid.reason || !valid.taggedBy) {
        return 'some required fields empty: ' + JSON.stringify(valid);
      }
      return true;
    });

    await runner.check('B3: Submit form — success section appears with tag number', async () => {
      // Click submit button
      await frame.evaluate(() => {
        document.getElementById('submit-btn').click();
      });

      // Poll up to 30s for success-section to appear
      for (let i = 0; i < 60; i++) {
        const state = await frame.evaluate(() => {
          const succ = document.getElementById('success-section');
          const errEl = document.getElementById('rt-error');
          const btn = document.getElementById('submit-btn');
          return {
            successVisible: succ ? succ.style.display !== 'none' && succ.style.display !== '' : false,
            errorVisible: errEl ? errEl.style.display === 'block' : false,
            errorText: errEl ? errEl.textContent : '',
            btnText: btn ? btn.textContent : '',
            successMsg: succ ? document.getElementById('success-msg').textContent : ''
          };
        }).catch(() => ({ successVisible: false, errorVisible: false }));

        if (state.successVisible) {
          submitSuccess = true;
          tagNo = (state.successMsg || '').match(/Tag #([^\s,]+)/)?.[1] || '(not captured)';
          console.log('  [info] RedTag created: marker="' + marker + '" tagNo=' + tagNo);
          return true;
        }
        if (state.errorVisible) {
          return 'server returned error: ' + state.errorText;
        }
        await page.waitForTimeout(500);
      }

      const finalState = await frame.evaluate(() => {
        const btn = document.getElementById('submit-btn');
        const errEl = document.getElementById('rt-error');
        return {
          btnText: btn ? btn.textContent : '',
          btnDisabled: btn ? btn.disabled : null,
          errorText: errEl ? errEl.textContent : ''
        };
      }).catch(() => ({}));
      return 'success section never appeared after 30s; btn="' + finalState.btnText + '" error="' + finalState.errorText + '"';
    });
  } else {
    runner.results.push({ name: 'B2: Fill form fields (zone Z-01, description, qty, category, reason, taggedBy)', pass: false, detail: 'SKIPPED — zone select not populated' });
    runner.results.push({ name: 'B3: Submit form — success section appears with tag number', pass: false, detail: 'SKIPPED — zone select not populated' });
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  const { pass, total } = runner.report();

  const realPageErrors = errors.filter(e => e.startsWith('PAGEERR:') && !SW_NOISE.test(e));
  const consoleErrors  = errors.filter(e => !e.startsWith('PAGEERR:') && !SW_NOISE.test(e));

  console.log('\n[META] Modal detail body snippet:', detailBodyText ? detailBodyText.replace(/\n/g, ' ').substring(0, 120) : '(not captured)');
  console.log('[META] RedTag marker:', marker);
  console.log('[META] RedTag tagNo:', tagNo || '(none — submit did not succeed)');
  console.log('[META] real page errors:', realPageErrors.length ? realPageErrors.join(' | ') : 'none');
  console.log('[META] console errors (non-SW):', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : 'none');
  console.log('\nCommand: E2E_HEADED=1 node e2e-5s-interact.js');

  await browser.close();

  // Fail if any real page errors
  const hasPageErrors = realPageErrors.length > 0;
  process.exit((pass === total && !hasPageErrors) ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
