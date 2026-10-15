const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true, channel:'chrome'});
 try {
  const page = await browser.newPage();
  await page.setContent('<div data-fixture></div>');
  await page.addStyleTag({content:fs.readFileSync('output/css/site.css','utf8')});
  for (const width of [320,1440]) {
   await page.setViewportSize({width,height:700});
   const results = await page.evaluate(() => {
    const root=document.querySelector('[data-fixture]');
    const variants=['badge','badge city-badge','badge bg-success','badge badge-inline','badge opp-badge is-up','badge flipper-roi-badge'];
    root.innerHTML=variants.map(cls=>`<div style="display:flex;align-items:stretch;height:120px"><span class="${cls}" data-city="thetford" data-tier="4" style="--badge-font-size:12px">THEtford</span></div>`).join('');
    return [...root.querySelectorAll('.badge')].map(el=>{
     const get=()=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {height:r.height,padding:parseFloat(s.paddingTop),font:parseFloat(s.fontSize),align:s.alignItems,justify:s.justifyContent};};
     const before=get();el.parentElement.style.height='200px';const after=get();
     el.style.setProperty('--badge-font-size','24px');const large=get();
     return {before,after,large};
    });
   });
   for(const {before,after,large} of results){
    assert.equal(before.height,after.height,'parent height stretched badge');
    assert.equal(before.align,'center');assert.equal(before.justify,'center');
    assert(Math.abs(large.padding-2*before.padding)<.02,'padding does not scale with font');
    assert(large.height>before.height,'badge does not scale with font');
   }
   console.log(`Badge geometry ${width}px: ${results.length} variants passed`);
  }
  await page.screenshot({path:'output/badge-component-verification.png'});
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
