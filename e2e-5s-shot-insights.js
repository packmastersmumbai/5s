const { launch, loginAdmin, EXEC } = require('./e2e-lib-5s');
const path = require('path');
const OUT = process.env.SHOT_DIR || '.';
async function tok(page){ for(const f of page.frames()){ const t=await f.evaluate(()=>{const m=(location.href||'').match(/[?&]token=([^&]+)/);return m?decodeURIComponent(m[1]):'';}).catch(()=>''); if(t)return t;} return ''; }
(async()=>{
  const b=await launch(); const {ctx,page}=await loginAdmin(b); const T=await tok(page);
  const W = parseInt(process.env.W||'1280',10);
  await page.setViewportSize({width:W,height:1000});
  await page.goto(EXEC+'?v2=1&action=insights&token='+T,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(parseInt(process.env.WAIT||'20000',10));
  if (process.env.THEME) {
    for (const f of page.frames()) await f.evaluate(t=>document.documentElement.setAttribute('data-theme',t), process.env.THEME).catch(()=>{});
    await page.waitForTimeout(900);
  }
  await page.screenshot({path:path.join(OUT,process.env.NAME||'insights.png'),fullPage:true});
  for(const f of page.frames()){
    const d=await f.evaluate(()=>{
      if(!document.querySelector('.bn-item')) return null;
      const q=s=>document.querySelectorAll(s).length;
      return { canvases:q('canvas'), svgs:q('svg'), cards:q('.card,.ins-card,.kpi'),
        sections:q('h2,h3,.sec-h'), tables:q('table'), bodyLen:document.body.innerText.length,
        docW:document.documentElement.scrollWidth, winW:window.innerWidth,
        head:document.body.innerText.replace(/\s+/g,' ').substring(0,220) };
    }).catch(()=>null);
    if(d){ console.log(JSON.stringify(d,null,1)); break; }
  }
  await ctx.close(); await b.close();
})();
