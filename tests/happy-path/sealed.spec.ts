import { test, expect } from '@playwright/test';
import { player, sealedDeck, board } from './helpers';
import { cleanup } from './helpers';
const run = `happy_sealed_${Date.now()}`;
test.afterAll(async () => { await cleanup(run); });
for (const packs of [6, 8])
    test(`${packs}-pack HMW sealed: open pool, build deck, launch AI`, async ({ browser }) => {
        const { page, context } = await player(browser, run, `Sealed${packs}`);
        try {
            await sealedDeck(page, packs);
            await page.getByRole('button', { name: /Play vs AI/ }).click();
            await board(page);
        }
        finally {
            await context.close();
        }
    });
