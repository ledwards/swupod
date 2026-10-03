import { chromium, firefox, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = new URL('./', import.meta.url);
const base = process.env.PTP_BOARD_URL || 'http://127.0.0.1:4387/real-board.html';
const source = JSON.parse(await readFile(new URL('../../../src/data/cards.json',dir),'utf8')).cards;
const manifest = JSON.parse(await readFile(new URL('real-board-data.json',dir),'utf8'));
for (const c of Object.values(manifest.cards)) {
  const original = source.find(x => x.cardId === c.cardId && x.variantType === 'Normal');
  for (const key of ['name','type','power','hp','cost','frontText','imageUrl']) {
    if (JSON.stringify(original?.[key]) !== JSON.stringify(c[key])) throw Error(`Catalog mismatch ${c.cardId}.${key}`);
  }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBack = sha(await readFile(new URL('../../../public/card-images/card-back.png',dir)));
if (sourceBack !== sha(await readFile(new URL('assets/card-back.png',dir)))) throw Error('Card back differs from PTP original');
const results = {catalogCards:Object.keys(manifest.cards).length,cardBackSha256:sourceBack,browsers:{}};
for (const [name, engine] of Object.entries({chromium,firefox})) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => !!window.boardEvidence);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-unit]')).toHaveCount(10);
    await expect(page.locator('.target')).toHaveCount(1);
    await page.locator('[data-unit="walker"]').click();
    await expect(page.locator('.detail-copy h2')).toHaveText('AT-ST');
    await page.getByRole('button',{name:'Close card inspection'}).click();
    await page.locator('[data-card="SOR-005"]:visible').click();
    await page.locator('[data-flip]').click();
    await expect(page.locator('.detail-image')).toHaveAttribute('src','assets/SOR-005-unit.png');
    await page.getByRole('button',{name:'Close card inspection'}).click();
    await page.locator('[data-unit="guard"]').click();
    await expect(page.locator('[data-unit]')).toHaveCount(8);
    await expect(page.locator('#decision-text')).toContainText('Both units were defeated');
    await page.locator('#reset').click();
    await page.locator('#primary-action').click();
    await page.locator('[data-unit="guard"]').click();
    await page.locator('#reset').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-unit]')).toHaveCount(10);
    const viewports = [[360,800],[390,844],[430,932],[768,1024],[1024,1366],[844,390],[1440,900],[1600,1000]];
    for (const [width,height] of viewports) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(60);
      const metrics = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}));
      if (metrics.scroll > width || metrics.broken) throw Error(`${name}: ${JSON.stringify(metrics)}`);
    }
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      return {requests:entries.length,transferBytes:entries.reduce((n,e)=>n+e.transferSize,0),external:entries.filter(e=>new URL(e.name).origin!==location.origin).map(e=>e.name)};
    });
    if (resources.external.length) throw Error('Unexpected external request');
    await page.locator('#primary-action').click();
    await page.screenshot({path:new URL(`real-board-${name}.png`,dir).pathname,fullPage:true});
    if (name === 'chromium') {
      await page.screenshot({path:new URL('real-board-desktop.png',dir).pathname,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:new URL('real-board-phone.png',dir).pathname,fullPage:true});
      await page.locator('#settings-toggle').click();
      await page.locator('#crowded').check();
      await page.locator('#reduce-motion').check();
      await page.getByRole('button',{name:'Close settings'}).click();
      await expect(page.locator('[data-unit]')).toHaveCount(20);
      await page.screenshot({path:new URL('real-board-phone-crowded.png',dir).pathname,fullPage:true});
      await page.locator('[data-unit="xwing-copy"]').click();
      await expect(page.locator('#card-dialog')).toBeVisible();
      await page.screenshot({path:new URL('real-board-phone-inspect.png',dir).pathname,fullPage:true});
      await page.getByRole('button',{name:'Close card inspection'}).click();
      await page.locator('[data-unit="guard"]').click();
      await expect(page.locator('[data-unit]')).toHaveCount(16);
    }
    if (errors.length) throw Error(errors.join(';'));
    results.browsers[name] = {viewports,pageErrors:errors,resources,checks:['catalog inspection','real leader flip','scripted attack','reset during animation','image loading','no horizontal page overflow']};
    console.log(`${name}: passed ${viewports.length} viewport checks and interaction assertions`);
  } finally { await browser.close(); }
}
await writeFile(new URL('real-board-validation.json',dir),JSON.stringify(results,null,2)+'\n');
