/* The bare root must ask for a PIN; a QR '?zone=Z-XX' must open Quick Audit
   for that zone ANONYMOUSLY -- no session, no PIN, no zone list in between.
   Both halves are asserted over real HTTP against the deployed app, because
   the in-process doGet probe cannot see the sandbox, the iframes or the JS. */
const { launch, loginAdmin, newAuthContext, EXEC } = require('./e2e-lib-5s');

const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

async function appFrame(page, ms) {
  const end = Date.now() + (ms || 45000);
  while (Date.now() < end) {
    await page.waitForTimeout(700);
    for (const f of page.frames()) {
      if (!f.url().includes('googleusercontent') && !f.url().includes('script.google')) continue;
      /* The outer GAS wrapper carries 83 chars of "This application was
         created by a Google Apps Script user", which cleared a naive length
         threshold and made every content assertion read the wrapper instead
         of the app. Identify the app frame by its own markup. */
      const ok = await f.evaluate(() => {
        const b = document.body; if (!b) return false;
        if (/This application was created by a Google Apps Script user/.test(b.innerText)) return false;
        return b.innerText.trim().length > 100 || !!document.querySelector('.key,.user,.qa-item');
      }).catch(() => false);
      if (ok) return f;
    }
  }
  return null;
}

/* A fresh context per case. Reusing one would let a session cookie or a
   localStorage zone from an earlier case leak in and make an anonymous route
   look authenticated -- exactly the failure this suite exists to catch. */
async function anon(browser, qs) {
  const { ctx } = await newAuthContext(browser);
  const page = await ctx.newPage();
  await page.goto(EXEC + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr = await appFrame(page);
  /* The keypad paints at once but the user roster is fetched and arrives at
     ~4-5s. Sampling once read an empty roster and reported a missing user
     picker that is in fact present. Wait for it instead of loosening the
     assertion. */
  if (fr) await fr.waitForSelector('.user', { timeout: 20000 }).catch(() => {});
  const info = fr ? await fr.evaluate(() => ({
    txt: document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 400),
    hasKeypad: !!document.querySelector('.key[data-k="1"]'),
    hasUserPick: !!document.querySelector('.user'),
    zoneRows: document.querySelectorAll('.zs-row, .zone-row').length,
    qaItems: document.querySelectorAll('.qa-item, .qa-crit, [data-crit]').length,
    zoneLabel: (document.querySelector('#pm5s-zone-label, .qa-zone, .zone-name') || {}).textContent || '',
    title: document.title
  })) : null;
  return { ctx, page, fr, info };
}

(async () => {
  const browser = await launch();

  // ---- 1. Bare root asks for a PIN -------------------------------------
  {
    const c = await anon(browser, '');
    say('bare root renders', !!c.info, c.info ? c.info.title : 'no frame');
    if (c.info) {
      say('bare root shows the PIN keypad', c.info.hasKeypad);
      say('bare root shows the user picker', c.info.hasUserPick);
      say('bare root does NOT show the zone list', c.info.zoneRows === 0, 'rows=' + c.info.zoneRows);
    }
    await c.ctx.close();
  }

  // ---- 2. QR zone opens Quick Audit anonymously ------------------------
  for (const qs of ['?zone=Z-07', '?zone=Z-07&v=3', '?v2=1&zone=Z-07']) {
    const c = await anon(browser, qs);
    say('QR ' + qs + ' renders', !!c.info, c.info ? c.info.title : 'no frame');
    if (c.info) {
      say('QR ' + qs + ' needs NO pin', !c.info.hasKeypad);
      say('QR ' + qs + ' skips the zone list', c.info.zoneRows === 0, 'rows=' + c.info.zoneRows);
      say('QR ' + qs + ' opens the audit', /audit/i.test(c.info.title) || c.info.qaItems > 0,
          c.info.title + ' items=' + c.info.qaItems);
      say('QR ' + qs + ' is scoped to Z-07', /Z-07/.test(c.info.txt + c.info.zoneLabel),
          c.info.txt.substring(0, 90));
    }
    await c.ctx.close();
  }

  // ---- 3. A bad zone must not open a phantom audit ---------------------
  {
    const c = await anon(browser, '?zone=Z-99');
    say('bad zone does NOT open an audit', c.info && !/quick audit/i.test(c.info.title),
        c.info ? c.info.title : 'no frame');
    await c.ctx.close();
  }

  // ---- 4. An explicit type still wins over the implied quickaudit ------
  {
    const c = await anon(browser, '?zone=Z-07&type=daily');
    say('explicit type=daily is not overridden', c.info && !/quick audit/i.test(c.info.title),
        c.info ? c.info.title : 'no frame');
    await c.ctx.close();
  }

  // ---- 5. Login still works and lands on Analytics ---------------------
  {
    const { ctx, page, frame } = await loginAdmin(browser);
    const post = await frame.evaluate(() => ({
      txt: document.body.innerText.replace(/\s+/g, ' ').substring(0, 300),
      navTabs: document.querySelectorAll('.bn-item').length,
      zoneRows: document.querySelectorAll('.zs-row, .zone-row').length,
      zoneLabel: (document.querySelector('#pm5s-zone-label') || {}).textContent || ''
    }));
    say('login lands on the app', post.navTabs > 0, 'tabs=' + post.navTabs);
    say('login does NOT force a zone choice', post.zoneRows === 0, 'rows=' + post.zoneRows);
    say('landing is Analytics', /analytic|insight|score|sqcdp/i.test(post.txt), post.txt.substring(0, 80));
    await ctx.close();
  }

  await browser.close();
  const bad = R.filter(r => !r.ok);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  if (bad.length) { bad.forEach(b => console.log('  FAILED: ' + b.n)); process.exit(1); }
})().catch(e => { console.error('CRASH', e); process.exit(1); });
