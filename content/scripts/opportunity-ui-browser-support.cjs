const VIEWPORTS = [[1920,1080],[1440,900],[1280,720],[768,1024],[390,844]];
async function settleViewport(page, size) {
    await page.setViewportSize(size);
    // Observe real layout stability; background indicators may animate indefinitely.
    await page.evaluate(async () => {
        const selectors=['[data-app-sidebar]','main.tool-page','.page-body > .tool-split','.opp-cards','.opp-sheet','[data-opportunities-evidence-report]'];
        let previous='', stable=0;
        for(let frame=0;frame<120;frame++){
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const geometry=JSON.stringify(selectors.map(selector=>{const element=document.querySelector(selector);if(!element)return null;const r=element.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(value=>Math.round(value*100));}));
            stable=geometry===previous?stable+1:0;
            if(stable>=3)return;
            previous=geometry;
        }
        throw Error('Viewport layout did not settle within 120 render frames');
    });
}
module.exports = { VIEWPORTS, settleViewport };
