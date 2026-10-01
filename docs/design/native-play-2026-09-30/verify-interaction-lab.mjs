import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4387/',dir=new URL('./',import.meta.url),report=[];
for(const [browserName,engine] of Object.entries({chromium,firefox})){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'interaction-lab.html');await page.waitForFunction(()=>window.labEvidence);await expect(page.locator('.inspect-button,.drag-handle,[data-mode=cautious]')).toHaveCount(0);
 const state=()=>page.evaluate(()=>window.labEvidence),scenario=async value=>{await page.locator('#scenario').selectOption(value)},done=async()=>await expect.poll(async()=>(await state()).commits).toBe(1);
 await page.locator('#card-marine').click();await page.locator('#card-tie').click();if((await state()).commits)throw Error('invalid target committed');await page.locator('[data-action=cancel]').click();
 await page.locator('#card-marine').click();await page.locator('#card-guard').click();await done();if((await state()).sent!==1)throw Error('duplicate');
 await page.locator('[data-mode=hybrid]').click();
 const drag=async(from,to)=>{await page.locator(from).scrollIntoViewIfNeeded();const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.mouse.up()};
 await drag('#card-marine','#card-tie');if((await state()).commits)throw Error('invalid drag committed');await drag('#card-marine','#card-guard');await done();
 await scenario('play');await drag('#card-hand0','#ground-drop');await done();await expect(page.locator('#hand #card-hand0')).toHaveCount(0);
 await page.locator('[data-mode=classic]').click();await page.locator('#card-hand0').click();await done();
 await scenario('resource');await expect(page.locator('[data-action=resource]')).toBeDisabled();await page.locator('#card-hand0').click();await page.locator('#card-hand1').click();await page.locator('#card-hand0').click({button:'right'});await expect(page.locator('#inspector')).toBeVisible();await page.getByRole('button',{name:'Close card inspection',exact:true}).click();if((await state()).selected.length!==2)throw Error('inspection mutated');await page.locator('[data-action=resource]').click();await done();
 await scenario('allocate');await expect(page.locator('[data-action=allocate]')).toBeDisabled();await page.locator('[data-adjust="0"][data-delta="1"]').click();await page.locator('[data-adjust="1"][data-delta="1"]').click({clickCount:2});await expect(page.locator('[data-action=allocate]')).toBeEnabled();await page.locator('[data-action=allocate]').click();await done();
 await scenario('leader');await page.locator('#card-luke').click();await page.locator('[data-action=leader]').click();await done();await expect(page.locator('#ground-cards #card-luke')).toBeVisible();
 await scenario('attachments');await page.locator('[data-action=expand]').click();await page.locator('[data-child="Shield token"]').click();await done();
 await scenario('initiative');await page.locator('[data-action=initiative]').click();await done();await page.locator('#reset').click();await page.locator('[data-action=pass]').click();await done();
 await scenario('reconnect');await page.locator('[data-action=send]').click();await expect.poll(async()=>(await state()).stage).toBe('uncertain');await page.locator('[data-action=reconnect]').click();await done();if((await state()).sent!==1)throw Error('resync resent command');
 await scenario('attack');await page.locator('#card-marine').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');if((await state()).source)throw Error('keyboard cancel failed');await page.locator('#card-marine').focus();await page.keyboard.press('Enter');await page.locator('#card-guard').focus();await page.keyboard.press('Enter');await done();
 await page.locator('#reset').click();await page.locator('#inspection').selectOption('pinned');await page.locator('#card-marine').focus();await page.keyboard.press('i');await expect(page.locator('#pinned-inspector')).toBeVisible();await page.locator('[data-unpin]').click();
 for(const position of ['side','center']){await page.locator('#prompt-position').selectOption(position);await expect(page.locator('#'+(position==='side'?'side':'center')+'-prompt .prompt')).toBeVisible()}
 for(const [width,height] of [[360,800],[390,844],[768,1024],[1024,768],[1500,1100]]){await page.setViewportSize({width,height});await page.waitForLoadState('networkidle');const m=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}));if(m.scroll>m.width||m.broken)throw Error(JSON.stringify(m));if(browserName==='chromium')await page.screenshot({path:new URL(`ux-lab-${width}.png`,dir).pathname,fullPage:true})}

 await page.setViewportSize({width:1500,height:1100});
 for(const [kind,selectors,budget] of [
 ['attack',['#card-marine','#card-guard'],2],
 ['play',['#card-hand0'],1],
 ['leader',['#card-luke','[data-action=leader]'],2],
 ['initiative',['[data-action=initiative]'],1],
 ['attachments',['[data-action=expand]','[data-child="Shield token"]'],2],
 ['resource',['#card-hand0','#card-hand1','[data-action=resource]'],3]
 ]){await scenario(kind);for(const selector of selectors)await page.locator(selector).click();await done();if((await state()).activations!==budget)throw Error('Click-budget regression: '+kind);await expect(page.locator('[data-action=confirm]')).toHaveCount(0)}
 if(errors.length)throw Error(errors.join(';'));report.push({browser:browserName,errors,checks:['8 scenarios','2 approaches','per-fixture click budgets','no per-card inspect or drag buttons','valid/invalid mouse drag','local cancel','keyboard attack/cancel','inspection preserves selection','pending and resync one submission','two prompt positions','5 viewports']});await browser.close();console.log(browserName+' interaction lab passed');
}
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await page.goto(base+'interaction-lab.html');await page.waitForFunction(()=>window.labEvidence);await page.locator('#card-marine').tap();await page.locator('#card-guard').tap();await expect.poll(()=>page.evaluate(()=>window.labEvidence.commits)).toBe(1);await page.locator('#reset').tap();const face=page.locator('#card-marine');await face.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',button:0,clientX:250,clientY:400});await page.waitForTimeout(450);await expect(page.locator('#inspector')).toBeVisible();await face.dispatchEvent('pointerup',{pointerId:7,pointerType:'touch',button:0});if(await page.evaluate(()=>window.labEvidence.commits))throw Error('long press committed');await browser.close();report.push({browser:'chromium touch emulation',checks:['tap attack','synthetic long press inspection without commit'],limitation:'Physical iOS gesture testing remains outstanding'});
await writeFile(new URL('interaction-lab-validation.json',dir),JSON.stringify(report,null,2));
