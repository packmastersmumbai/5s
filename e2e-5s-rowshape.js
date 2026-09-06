/* The record row after the redesign: no status column, no collapsible section
   wrapper, no filter rail, priority as an icon, photos in their own column,
   and audits showing criteria/date where owner/due used to sit. Also times how
   long the first row takes to appear, since that was the reported complaint. */
const { launch, loginAdmin, EXEC } = require('./e2e-lib-5s');

/* gotoAction() reads the session token off the frame it is handed, but after
   the first navigation that frame is detached -- so from the second page on it
   fell through to a token-less URL and every page came back unauthenticated.
   Capture the token once, then drive navigation from it directly. */
async function tokenOf(page) {
  for (const f of page.frames()) {
    const t = await f.evaluate(() => {
      const m = (location.href || '').match(/[?&]token=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
      try { return window.SESSION_TOKEN || window.TOKEN || ''; } catch (e) { return ''; }
    }).catch(() => '');
    if (t) return t;
  }
  return '';
}

async function grab(page) {
  for (const f of page.frames()) {
    const d = await f.evaluate(() => {
      if (!document.querySelector('.bn-item')) return null;
      return {
        tr: document.querySelectorAll('tbody tr').length,
        heads: Array.from(document.querySelectorAll('.ah-table thead th'))
          .map(h => h.textContent.trim()).filter(Boolean),
        sections: document.querySelectorAll('.ah-sec').length,
        rail: document.querySelectorAll('.pm5s-filter').length,
        priIcons: document.querySelectorAll('.pri-ic').length,
        priWords: document.querySelectorAll('.pri-badge').length,
        evi: document.querySelectorAll('.ah-evi').length,
        strip: !!(document.querySelector('#ahStatusTabs') &&
                  document.querySelector('#ahStatusTabs').offsetParent),
        row1: (document.querySelector('tbody tr') || {}).innerText || ''
      };
    }).catch(() => null);
    if (d) return d;
  }
  return null;
}

const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  const browser = await launch();
  const perr = [];
  const { ctx, page, frame } = await loginAdmin(browser);
  page.on('pageerror', e => perr.push(e.message.substring(0, 90)));
  const TOKEN = await tokenOf(page);
  if (!TOKEN) console.log('WARNING: no session token captured — pages will be anonymous');

  const EXPECT = { audits: 27, issues: 34, tasks: 101, walks: 11 };

  for (const p of Object.keys(EXPECT)) {
    const t0 = Date.now();
    await page.goto(EXEC + '?v2=1&action=' + p + (TOKEN ? '&token=' + TOKEN : ''),
                    { waitUntil: 'domcontentloaded', timeout: 60000 });
    let d = null, ms = 0;
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(500);
      d = await grab(page);
      if (d && d.tr > 0) { ms = Date.now() - t0; break; }
    }
    if (!ms) ms = Date.now() - t0;
    console.log('\n### ' + p + '  firstRow=' + ms + 'ms');
    if (!d) { say(p + ': renders', false, 'no frame'); continue; }

    say(p + ': has rows', d.tr === EXPECT[p], d.tr + ' (want ' + EXPECT[p] + ')');
    say(p + ': no status column', d.heads.indexOf('Status') < 0, d.heads.join('/'));
    say(p + ': no collapsible sections', d.sections === 0, 'n=' + d.sections);
    say(p + ': no filter rail', d.rail === 0, 'n=' + d.rail);
    say(p + ': priority is an icon', d.priIcons > 0 && d.priWords === 0,
        'icons=' + d.priIcons + ' words=' + d.priWords);
    say(p + ': first row loads under 10s', ms < 10000, ms + 'ms');
    if (p === 'audits') {
      say('audits: shows criteria, not owner', d.heads.indexOf('Criteria') >= 0 && d.heads.indexOf('Owner') < 0,
          d.heads.join('/'));
    } else {
      say(p + ': keeps the owner column', d.heads.indexOf('Owner') >= 0, d.heads.join('/'));
    }
    if (p === 'tasks') say('tasks: status strip shows', d.strip);
  }

  say('no page errors', perr.length === 0, perr.join(' | ') || 'none');
  await ctx.close();
  await browser.close();
  const bad = R.filter(r => !r.ok);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  if (bad.length) { bad.forEach(b => console.log('  FAILED: ' + b.n)); process.exit(1); }
})().catch(e => { console.error('CRASH', e); process.exit(1); });
