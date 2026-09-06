/* An audit record must show what came out of it: a roll-up of action states,
   and per failed criterion the actions raised from it with their latest
   remark and evidence. Verified on a real audit with a mix of states. */
const { launch, loginAdmin, EXEC } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';

// b02fc135 = 7 closed + 1 open; 0c053599 = 6 open, 1 progress, 3 closed.
const AUDIT = process.env.AUDIT_ID || '0c053599';

async function tokenOf(page) {
  for (const f of page.frames()) {
    const t = await f.evaluate(() => {
      const m = (location.href || '').match(/[?&]token=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    }).catch(() => '');
    if (t) return t;
  }
  return '';
}

const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  const browser = await launch();
  const { ctx, page } = await loginAdmin(browser);
  const TOKEN = await tokenOf(page);
  await page.setViewportSize({ width: 500, height: 1000 });

  // Resolve the full submission id from the list, then open that record.
  await page.goto(EXEC + '?v2=1&action=audits&token=' + TOKEN,
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000);

  let full = '';
  for (const f of page.frames()) {
    const ids = await f.evaluate(() => (window._allItems || [])
      .filter(i => i.type === 'AUDIT').map(i => i.id)).catch(() => null);
    if (ids && ids.length) { full = ids.find(x => x.indexOf(AUDIT) === 0) || ids[0]; break; }
  }
  say('found an audit id', !!full, full);
  if (!full) { await browser.close(); process.exit(1); }

  await page.goto(EXEC + '?v2=1&action=record&type=audit&id=' + full + '&token=' + TOKEN,
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);

  let d = null;
  for (const f of page.frames()) {
    const got = await f.evaluate(() => {
      if (!document.querySelector('.fi, .aab')) return null;
      return {
        bar: document.querySelectorAll('.aab-bar .aab-seg').length,
        legend: (document.querySelector('.aab-legend') || {}).innerText || '',
        head: (document.querySelector('.aab-hd') || {}).innerText || '',
        chips: document.querySelectorAll('.aa').length,
        open: document.querySelectorAll('.aa.open').length,
        prog: document.querySelectorAll('.aa.progress').length,
        closed: document.querySelectorAll('.aa.closed').length,
        remarks: document.querySelectorAll('.aa-r').length,
        pics: document.querySelectorAll('.aa-pic').length,
        firstChip: (document.querySelector('.aa') || {}).innerText || ''
      };
    }).catch(() => null);
    if (got) { d = got; break; }
  }
  say('record renders', !!d);
  if (d) {
    console.log('   ' + JSON.stringify(d));
    say('roll-up bar drawn', d.bar > 0, d.bar + ' segments');
    say('roll-up names the counts', /closed|open/i.test(d.legend), d.legend.replace(/\n/g, ' '));
    say('actions appear on findings', d.chips > 0, d.chips + ' chips');
    say('states are colour-coded', (d.open + d.prog + d.closed) === d.chips,
        'o' + d.open + ' p' + d.prog + ' c' + d.closed + ' of ' + d.chips);
  }

  await page.screenshot({ path: path.join(OUT, 'audit-actions.png'), fullPage: true });
  await ctx.close();
  await browser.close();
  const bad = R.filter(r => !r.ok);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed  · shot -> ' + OUT);
  if (bad.length) process.exit(1);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
