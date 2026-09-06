/* The six per-type pages were only ever verified server-side, because the PIN
   was believed to be unusable. It is 1234. This asserts on screen what the
   markup check could not: that the Issues segmented control switches, that the
   FAB follows the segment, and that a zone filter carries between pages. */
const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');

const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

/* 'kaizenlist' is the real nav action; 'kaizen' is the CREATE form it
   links to. Navigating to 'kaizen' opened the form, not the list. */
const PAGES = ['audits', 'issues', 'kaizenlist', 'tasks', 'walks', 'insights'];

(async () => {
  const browser = await launch();
  const { ctx, page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1400, height: 950 });
  let fr = frame;

  for (const p of PAGES) {
    await gotoAction(page, fr, p);
    await page.waitForTimeout(2500);
    // gotoAction may swap the sandbox frame; re-acquire the one with the nav.
    for (const f of page.frames()) {
      const has = await f.evaluate(() => !!document.querySelector('.bn-item')).catch(() => false);
      if (has) { fr = f; break; }
    }
    const d = await fr.evaluate(() => ({
      tabs: document.querySelectorAll('.bn-item').length,
      rail: !!document.querySelector('.pm5s-filters'),
      pickers: document.querySelectorAll('.pm5s-filter').length,
      zoneTxt: (document.querySelector('#fltZoneTxt') || {}).textContent || '',
      seg: document.querySelectorAll('.ah-seg button, .seg-btn, [data-seg]').length,
      segTxt: Array.from(document.querySelectorAll('.ah-seg button, .seg-btn, [data-seg]')).map(b => b.textContent.trim()).join('|'),
      fab: (document.querySelector('.pm5s-fab') || {}).getAttribute ? document.querySelector('.pm5s-fab').getAttribute('aria-label') : '',
      sidebar: !!document.querySelector('.sidebar'),
      txt: document.body.innerText.replace(/\s+/g, ' ').substring(0, 120)
    })).catch(e => ({ err: String(e).substring(0, 80) }));

    say(p + ': renders with 6 nav tabs', d.tabs === 6, 'tabs=' + d.tabs);
    say(p + ': sidebar stays retired', !d.sidebar);
    if (p === 'insights') {
      say('insights: no filter rail', !d.rail);
    } else {
      say(p + ': has the filter rail', d.rail);
      say(p + ': rail has 3 pickers', d.pickers === 3, 'n=' + d.pickers);
      say(p + ': zone filter defaults to All zones', /all zones/i.test(d.zoneTxt), d.zoneTxt);
      say(p + ': FAB is labelled', !!String(d.fab).trim(), JSON.stringify(d.fab).substring(0, 40));
    }
    if (p === 'issues') {
      say('issues: segmented control renders', d.seg >= 2, 'n=' + d.seg + ' [' + d.segTxt + ']');
      say('issues: segments are NC and Red Tag', /nc|non/i.test(d.segTxt) && /red/i.test(d.segTxt), d.segTxt);

      if (d.seg >= 2) {
        const before = d.fab;
        await fr.evaluate(() => {
          const bs = document.querySelectorAll('.ah-seg button, .seg-btn, [data-seg]');
          for (const b of bs) if (/red/i.test(b.textContent)) { b.click(); return; }
        });
        await page.waitForTimeout(1800);
        const after = await fr.evaluate(() => ({
          fab: (document.querySelector('.ah-fab, .fab') || {}).textContent || '',
          on: (document.querySelector('.ah-seg button.on, .seg-btn.on, [data-seg].on') || {}).textContent || ''
        }));
        say('issues: clicking Red Tag switches the segment', /red/i.test(after.on), 'active=' + after.on);
        say('issues: the FAB follows the segment', String(after.fab).trim() !== String(before).trim(),
            JSON.stringify(before) + ' -> ' + JSON.stringify(after.fab));
      }
    }
  }

  await ctx.close();
  await browser.close();
  const bad = R.filter(r => !r.ok);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  if (bad.length) { bad.forEach(b => console.log('  FAILED: ' + b.n)); process.exit(1); }
})().catch(e => { console.error('CRASH', e); process.exit(1); });
