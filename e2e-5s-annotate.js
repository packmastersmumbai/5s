// E2E: QuickAudit photo capture → annotator iframe → postMessage round-trip.
// Exercises the cross-origin GAS handshake (pm5sAnnotReady/Load/Done) that kept
// breaking. Creates NO records (no Create click). Run: E2E_HEADED=1 node e2e-5s-annotate.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, newAuthContext, findAppFrame, makeRunner, EXEC } = require('./e2e-lib-5s');

const QUICKAUDIT_URL = EXEC + '?v2=1&action=quickaudit&zone=Z-01';
const TIMEOUT = 30000;

// Minimal valid 1x1 PNG written to a temp file for the file input.
function writeTestImage() {
  const p = path.join(os.tmpdir(), 'pm5s_e2e_photo.png');
  fs.writeFileSync(p, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'));
  return p;
}

(async () => {
  const run = makeRunner('QuickAudit Annotator Round-trip');
  const browser = await launch();
  const imgPath = writeTestImage();
  const pageErrors = [];

  try {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/sw\.js|ServiceWorker/.test(t)) pageErrors.push('CONSOLE: ' + t); });
    page.on('pageerror', e => { if (!/ServiceWorker/.test(e.message)) pageErrors.push('PAGEERR: ' + e.message); });
    page.on('dialog', async d => { await d.accept(); }); // swallow any alert

    await page.goto(QUICKAUDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const frame = await findAppFrame(page);
    if (!frame) { console.error('FATAL: app frame not found'); process.exit(1); }
    await frame.waitForSelector('#ac-act-0', { timeout: TIMEOUT });

    await frame.evaluate(() => {
      const skip = document.getElementById('pmTourSkip') || document.querySelector('[onclick*="skipTour"],[onclick*="closeTour"]');
      if (skip) skip.click();
      ['pmTourDim', 'pmTourTip'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    }).catch(() => {});
    await page.waitForTimeout(400);

    // Open the Raise-action modal
    await frame.evaluate(() => { const b = document.getElementById('ac-act-0'); if (b) b.click(); });
    await page.waitForTimeout(700);

    // ── Capture a photo through the real code path (file chooser) ───────────
    await run.check('Photo capture fills modal preview + enables Annotate', async () => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        frame.evaluate(() => qaModalCamera_())
      ]);
      await chooser.setFiles(imgPath);
      // applyWatermark_ is async (img.onload) → poll for the preview + enabled Annotate
      for (let i = 0; i < 30; i++) {
        const s = await frame.evaluate(() => {
          const img = document.getElementById('qaCrPhoto');
          const ann = document.getElementById('qaCrAnnotateBtn');
          return { shown: img && img.style.display !== 'none' && /^data:/.test(img.getAttribute('src') || ''), enabled: ann && !ann.disabled };
        });
        if (s.shown && s.enabled) return true;
        await page.waitForTimeout(300);
      }
      return 'preview not shown or Annotate not enabled';
    });

    // ── Open annotator; it's same-document now (canvas in this frame) ───────
    await run.check('Annotate opens in-document annotator (canvas sized)', async () => {
      await frame.evaluate(() => { const b = document.getElementById('qaCrAnnotateBtn'); if (b) b.click(); });
      for (let i = 0; i < 30; i++) {
        const s = await frame.evaluate(() => {
          const ov = document.getElementById('annotatorOverlay');
          const c = document.getElementById('pmaCanvas');
          return { open: ov && window.getComputedStyle(ov).display !== 'none', sized: c && c.width > 0 && c.height > 0 };
        });
        if (s.open && s.sized) return true;
        await page.waitForTimeout(300);
      }
      return 'overlay did not open or canvas not sized (image failed to load)';
    });

    // ── Draw a stroke + Save → annotated image returns to the modal ─────────
    await run.check('Draw + Save returns annotated image to host', async () => {
      const before = await frame.evaluate(() => (document.getElementById('qaCrPhoto') || {}).src || '');
      await frame.evaluate(() => {
        // simulate a pen stroke across the canvas, then save
        const c = document.getElementById('pmaCanvas');
        const r = c.getBoundingClientRect();
        const mk = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
        mk('mousedown', 10, 10); mk('mousemove', 40, 40); mk('mousemove', 80, 60);
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        PMAnnot.save();
      });
      for (let i = 0; i < 20; i++) {
        const s = await frame.evaluate((prev) => {
          const ov = document.getElementById('annotatorOverlay');
          const img = document.getElementById('qaCrPhoto');
          const src = (img && img.getAttribute('src')) || '';
          return { hidden: !ov || ov.style.display === 'none', dataUrl: /^data:/.test(src), changed: src !== prev };
        }, before);
        if (s.hidden && s.dataUrl) return s.changed ? true : 'saved but photo unchanged';
        await page.waitForTimeout(300);
      }
      return 'overlay did not close / annotated photo not returned';
    });

    const { pass, total } = run.report();
    if (pageErrors.length) { console.log('\nPage errors:'); pageErrors.forEach(e => console.log('  ' + e)); }
    else console.log('\nNo real page errors.');
    console.log('\n(No records created — annotation flow only.)');

    await ctx.close();
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error('FATAL:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
