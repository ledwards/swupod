import { test, expect } from '@playwright/test';
import { player, sealedDeck, board, cleanup } from './helpers';
const run = `happy_limited_${Date.now()}`;
test.afterAll(() => cleanup(run));
for (const mode of ['queue', 'private'] as const)
    test(`limited ${mode}: two saved HMW sealed decks reach the same board`, async ({ browser }) => {
        const a = await player(browser, run, 'LimitedA'), b = await player(browser, run, 'LimitedB');
        try {
            for (const p of [a, b])
                await sealedDeck(p.page, mode === 'queue' ? 6 : 8);
            if (mode === 'queue') {
                await a.page.getByRole('button', { name: /Join HMW.*queue/ }).click();
                await expect(a.page.getByRole('heading', { name: 'Finding your opponent' })).toBeVisible();
                await b.page.getByRole('button', { name: /Join HMW.*queue/ }).click();
            }
            else {
                await a.page.getByRole('button', { name: 'Create a private room' }).click();
                await b.page.goto(await a.page.getByLabel('Private game link').inputValue());
                await b.page.locator('.ph-deck-row').first().click();
                await b.page.getByRole('button', { name: 'Join private game', exact: true }).click();
            }
            const sessions = await Promise.all([board(a.page), board(b.page)]);
            expect(sessions[0].matchId).toBe(sessions[1].matchId);
            expect(sessions[0].seat).not.toBe(sessions[1].seat);
        }
        finally {
            await a.context.close();
            await b.context.close();
        }
    });
