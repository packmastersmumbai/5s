/* The warm-on-PIN path: picking a name must kick off the rebuild while the
   digits are still being tapped, so the first page after sign-in reads a hot
   cache. Asserts the call actually leaves the browser, and measures the first
   page load that follows a real sign-in. */
const { launch, newAuthContext, EXEC } = require('./e2e-lib-5s');

const R = [];
const say = (n, ok, d) => { R.push({ n, ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

async function loginFrame(page) {
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(700);
    for (const f of page.frames()) {
      const ok = await f.evaluate(() => !!document.querySelector('.key[data-k="1"]')).catch(() => false);
      if (ok) return f;
    }
  }
  return null;
}

(async () => {
  const browser = await launch();
  const { ctx } = await newAuthContext(browser);
  const page = await ctx.newPage();

  /* google.script.run POSTs back to the /exec URL itself -- NOT to
     /userCodeAppPanel, which is what an earlier version of this test watched
     for, and why it reported zero calls while the warm was in fact firing.
     Count POSTs and confirm in-page that the guard flipped. */
  let calls = 0;
  page.on('request', r => { if (r.method() === 'POST') calls++; });

  await page.goto(EXEC, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fr = await loginFrame(page);
  say('PIN screen renders', !!fr);
  if (!fr) { await browser.close(); process.exit(1); }

  await fr.waitForSelector('.user', { timeout: 25000 });
  const before = calls;
  await fr.click('.user[data-id="admin"]');
  await page.waitForTimeout(3000);
  say('picking a name fires a server call', calls > before, (calls - before) + ' POST(s)');
  const flag = await fr.evaluate(() => (typeof warmed !== 'undefined') ? warmed : null).catch(() => null);
  say('the warm guard flipped', flag === true, 'warmed=' + flag);

  const warmStart = Date.now();
  for (const d of '1234') { await fr.click('.key[data-k="' + d + '"]'); await page.waitForTimeout(120); }

  /* The window the warm call gets: from name-pick to the post-login page
     actually asking for data. */
  let rows = 0, ms = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(700);
    for (const f of page.frames()) {
      const n = await f.evaluate(() => document.querySelectorAll('.bn-item').length).catch(() => 0);
      if (n > 0) { rows = n; ms = Date.now() - warmStart; break; }
    }
    if (rows) break;
  }
  say('sign-in reaches the app', rows > 0, rows + ' nav tabs in ' + ms + 'ms');

  await ctx.close();
  await browser.close();
  const bad = R.filter(r => !r.ok);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  if (bad.length) process.exit(1);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
