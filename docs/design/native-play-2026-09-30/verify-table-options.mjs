import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const root='http://127.0.0.1:4387/',dir=new URL('./',import.meta.url),results=[];
for(const [name,engine] of Object.entries({chromium,firefox})){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root+'real-board.html');await page.waitForFunction(()=>window.boardEvidence);
 await page.locator('#settings-toggle').click();
 for(const theme of ['dejarik','imperial','cantina','cloud-city','rebel','hoth']){await page.locator(`[data-theme-choice="${theme}"]`).click();await expect(page.locator('body')).toHaveAttribute('data-theme',theme);}
 await page.locator('[data-pref=cards]').selectOption('cinematic');await page.locator('[data-pref=placement]').selectOption('center');await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await expect(page.locator('#player-center')).toBeVisible();
 await page.locator('[data-discard]').last().click();await expect(page.locator('#discard-dialog')).toBeVisible();await page.locator('#discard-dialog button').first().click();
 for(const width of [390,768,1600]){await page.setViewportSize({width,height:1000});await page.screenshot({path:new URL(`table-center-${name}-${width}.png`,dir).pathname,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Board overflow '+width)}
 for(const mode of ['draft','builder']){await page.goto(root+'workshop.html?mode='+mode);await page.waitForFunction(()=>window.workshopEvidence);await expect(page.locator('body')).toHaveAttribute('data-theme','hoth');
 if(mode==='draft'){await page.locator('[data-select]').first().click();await page.locator('#primary').click();await expect(page.locator('#tray-title')).toHaveText('1 cards drafted')}
 else{await page.locator('[data-move]').first().click();await expect(page.locator('#tray-title')).toHaveText('19 / 30 cards');await page.locator('#search').fill('Marine');await expect(page.locator('.card-piece')).toHaveCount(0);await page.locator('#search').fill('');await page.locator('[data-bulk=remove]').click();await expect(page.locator('#tray-title')).toHaveText('0 / 30 cards');await page.locator('[data-bulk=all]').click();await expect(page.locator('#primary')).toBeEnabled()}
 for(const view of ['list','arena','grid']){await page.locator('#view').selectOption(view);await expect(page.locator('#cards')).toHaveClass(new RegExp(view))}
 await page.locator('[data-inspect]').first().click();await expect(page.locator('#inspect')).toBeVisible();await page.locator('[data-close=inspect]').click();
 for(const width of [390,768,1600]){await page.setViewportSize({width,height:1000});await page.waitForLoadState('networkidle');const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}));if(m.overflow||m.broken)throw Error(mode+width+JSON.stringify(m));if(name==='chromium')await page.screenshot({path:new URL(`${mode}-${width}.png`,dir).pathname,fullPage:true})}
 }
 if(errors.length)throw Error(errors.join(';'));results.push({browser:name,checks:['six themes','saved cross-page preferences','cinematic center layout','discard inspection','draft pick','deck movement and bulk actions','three views','full-face inspection','390/768/1600 layouts'],errors});await browser.close();console.log(name+' options/workshop passed');
}
await writeFile(new URL('table-options-validation.json',dir),JSON.stringify(results,null,2));
