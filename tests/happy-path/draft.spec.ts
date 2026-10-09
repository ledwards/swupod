import { test, expect, type BrowserContext } from '@playwright/test';
import { player, draftDeck, board, cleanup } from './helpers';
const run = `happy_draft_${Date.now()}`;
let pool: string, cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const actor = await player(browser, run, 'DraftHuman');
    try {
        pool = await draftDeck(actor.page);
        cookies = await actor.context.cookies();
    }
    finally {
        await actor.context.close();
    }
});
test.afterAll(() => cleanup(run));
test('complete solo HMW draft and saved deck reach an AI board', async ({ page, context }) => {
    await context.addCookies(cookies);
    await page.goto(`/play?pool=${pool}`);
    await page.getByRole('button', { name: /Play vs AI/ }).click();
    expect((await board(page)).ai).toBe(true);
});
for (const format of ['bracket', 'swiss'] as const)
    test(`draft ${format}: create eight-player tournament and launch first game`, async ({ page, context }) => {
        await context.addCookies(cookies);
        await page.goto(`/pools/${pool}/play/${format}?new=1`);
        await page.getByRole('button', { name: format === 'bracket' ? /Create bracket/ : /Start Swiss rounds/ }).click();
        await expect(page).toHaveURL(/\/runs\//, { timeout: 60000 });
        await expect(page.getByRole('region', { name: format === 'bracket' ? 'Tournament bracket' : 'Standings', exact: true })).toBeVisible();
        await page.getByRole('button', { name: /Play game 1/ }).click();
        expect((await board(page)).ai).toBe(true);
    });
