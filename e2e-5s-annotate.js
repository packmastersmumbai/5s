// E2E: QuickAudit capture → auto-annotate (same-document canvas) → thumbnail.
// Creates NO records. Run: E2E_HEADED=1 node e2e-5s-annotate.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, newAuthContext, findAppFrame, makeRunner, EXEC } = require('./e2e-lib-5s');

const QUICKAUDIT_URL = EXEC + '?v2=1&action=quickaudit&zone=Z-01';
const TIMEOUT = 30000;

function writeTestImage() {
  const p = path.join(os.tmpdir(), 'pm5s_e2e_photo.png');
  fs.writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  return p;
}

(async () => {
  const run = makeRunner('QuickAudit Capture → Annotate');
  const browser = await launch();
  const imgPath = writeTestImage();
  const pageErrors = [];

  try {
    const { ctx } = await newAuthContext(browser);
    const page = await ctx.newPage();
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/sw\.js|ServiceWorker/.test(t)) pageErrors.push('CONSOLE: ' + t); });
    page.on('pageerror', e => pageErrors.push('PAGEERR: ' + e.message));
    page.on('dialog', async d => { await d.accept(); });

    await page.goto(QUICKAUDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const frame = await findAppFrame(page);
    if (!frame) { console.error('FATAL: app frame not found'); process.exit(1); }
    await frame.waitForSelector('#ac-cam-0', { timeout: TIMEOUT });

    // Capture through the real path — the camera icon opens the file picker.
    await run.check('Capture auto-opens the in-document annotator', async () => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        frame.evaluate(() => captureFor_(0, _CFG.criteria[0].criterionId))
      ]);
      await chooser.setFiles(imgPath);
      for (let i = 0; i < 30; i++) {
        const s = await frame.evaluate(() => {
          const ov = document.getElementById('annotatorOverlay');
          const c = document.getElementById('pmaCanvas');
          return { open: ov && getComputedStyle(ov).display !== 'none', sized: c && c.width > 0 };
        });
        if (s.open && s.sized) return true;
        await page.waitForTimeout(300);
      }
      return 'annotator did not auto-open / canvas not sized';
    });

    await run.check('Draw + Save returns annotated photo to the card thumbnail', async () => {
      await frame.evaluate(() => {
        const c = document.getElementById('pmaCanvas');
        const r = c.getBoundingClientRect();
        const mk = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
        mk('mousedown', 6, 6); mk('mousemove', 20, 18); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        PMAnnot.save();
      });
      for (let i = 0; i < 20; i++) {
        const s = await frame.evaluate(() => {
          const ov = document.getElementById('annotatorOverlay');
          const t = document.getElementById('thumb-0');
          const im = t && t.querySelector('.qa-thumb-item img');
          return { closed: !ov || ov.style.display === 'none', thumb: t && t.style.display !== 'none' && im && /^data:/.test(im.getAttribute('src') || '') };
        });
        if (s.closed && s.thumb) return true;
        await page.waitForTimeout(300);
      }
      return 'annotator did not close / thumbnail not set';
    });

    await run.check('Thumbnail opens the full-screen viewer', async () => {
      await frame.evaluate(() => openViewer_(_CFG.criteria[0].criterionId));
      const s = await frame.evaluate(() => {
        const v = document.getElementById('photoViewer');
        return { shown: v && getComputedStyle(v).display !== 'none', img: /^data:/.test((document.getElementById('viewerImg') || {}).src || '') };
      });
      return (s.shown && s.img) ? true : 'viewer did not open: ' + JSON.stringify(s);
    });

    const { pass, total } = run.report();
    if (pageErrors.length) { console.log('\nPage errors:'); pageErrors.forEach(e => console.log('  ' + e)); }
    else console.log('\nNo real page errors.');
    console.log('\n(No records created — capture/annotate/viewer only.)');

    await ctx.close(); await browser.close();
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error('FATAL:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
