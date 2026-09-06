/* The chrome suite asserted nav, rails and FABs but never that a single ROW
   rendered -- so five empty pages passed 33/35. Assert the data itself. */
const { launch, loginAdmin, gotoAction } = require('./e2e-lib-5s');
const seen = {};
const PAGES = ['audits', 'issues', 'kaizenboard', 'tasks', 'walks'];

(async () => {
  const browser = await launch();
  const { ctx, page, frame } = await loginAdmin(browser);
  await page.setViewportSize({ width: 1400, height: 950 });
  let fr = frame;
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/404|ServiceWorker/i.test(m.text())) errs.push(m.text().substring(0, 140)); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.substring(0, 140)));

  for (const p of PAGES) {
    await gotoAction(page, fr, p);
    await page.waitForTimeout(15000);
    for (const f of page.frames()) {
      const has = await f.evaluate(() => !!document.querySelector('.bn-item')).catch(() => false);
      if (has) { fr = f; break; }
    }
    // _allItems arrives ~12s in; sampling earlier read an unpopulated list.
    const d = await fr.evaluate(() => {
      const q = s => document.querySelectorAll(s).length;
      const body = document.body.innerText.replace(/\s+/g, ' ').trim();
      return {
        rows: q('.ah-row'), cards: q('.ah-card'), items: q('.ah-item'),
        tr: q('tbody tr'), li: q('.list-item'),
        empty: /no records|nothing|no data|empty|no results/i.test(body),
        statusTxt: (document.querySelector('#fltStatusTxt') || {}).textContent || '',
        railStatusShown: !!(document.querySelector('#fltStatus') && document.querySelector('#fltStatus').offsetParent),
        stripShown: !!(document.querySelector('#ahStatusTabs') && document.querySelector('#ahStatusTabs').offsetParent),
        stripActive: (document.querySelector('.ah-status-tab.active') || {}).textContent || '',
        kpi: document.querySelectorAll('.kz-kpi, .kb-kpi, .kpi-strip .kpi').length,
        len: body.length,
        head: body.substring(0, 200)
      };
    }).catch(e => ({ err: String(e).substring(0, 100) }));
    console.log('\n### ' + p);
    console.log('   ' + JSON.stringify(d));
    seen[p] = d.tr || 0;
  }
  console.log('\nERRORS: ' + (errs.length ? errs.join('\n  ') : 'none'));
  /* Expected row counts at each page's own default filter. Issues is 0 by
     design: every NC was closed in the backlog clear-off, and Open is the
     right default there. The rest must never silently return to 0 -- an empty
     page passing a green suite is exactly what this file exists to catch. */
  var EXPECT = { audits: 27, issues: 0, kaizenboard: -1, tasks: 101, walks: 11 };
  var bad = 0;
  Object.keys(seen).forEach(function (k) {
    if (EXPECT[k] === -1) return;
    if (seen[k] !== EXPECT[k]) { console.log('FAIL ' + k + ': expected ' + EXPECT[k] + ' rows, got ' + seen[k]); bad++; }
    else console.log('PASS ' + k + ': ' + seen[k] + ' rows');
  });
  await ctx.close(); await browser.close();
  if (bad) process.exit(1);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
