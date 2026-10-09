import { test, expect } from '@playwright/test';
import { player, finishDraftAndBuild, cleanup, board, origin } from './helpers';
const run = `happy_competitive_${Date.now()}`;
test.afterAll(() => cleanup(run));
test('competitive HMW draft: eight humans draft, pair and enter four real Swiss games', async ({ browser }) => {
    test.setTimeout(900000);
    const actors = [];
    try {
        for (let i = 0; i < 8; i++)
            actors.push(await player(browser, run, `Swiss${i + 1}`));
        const host = actors[0].page;
        await host.goto('/draft/new?competitive=1');
        await expect(host.locator('.setting-lock-competitive')).toHaveAttribute('aria-pressed', 'true');
        await host.getByRole('button', { name: 'Public Pod', exact: true }).click();
        await host.locator('.set-card').filter({ hasText: 'Homeworlds' }).click();
        await expect(host).toHaveURL(/\/draft\/[A-Za-z0-9_-]+$/);
        const podUrl = host.url();
        for (const actor of actors.slice(1))
            await actor.page.goto(podUrl);
        await expect(host.locator('.player-count')).toContainText('8');
        await Promise.all(actors.map(a => a.page.locator('.lobby-ready-button').click()));
        await host.getByRole('button', { name: 'Deal Packs', exact: true }).click();
        await host.getByRole('button', { name: 'Start Draft', exact: true }).click();
        await Promise.all(actors.map(a => finishDraftAndBuild(a.page, true)));
        await expect(host.getByRole('heading', { name: 'Swiss Practice', exact: true })).toBeVisible();
        await expect(host.locator('.matchmaking-roster-row[data-ready="true"]')).toHaveCount(8, {timeout:60000});
        await host.getByTestId('start-matches-button-container').getByRole('button').click();
        for (const actor of actors) {
            await expect(actor.page.locator('.match-card').first()).toBeVisible();
            await expect(actor.page.locator('.matchmaking-round-progress')).toContainText('1');
        }
        const pod=new URL(podUrl).pathname.split('/').pop()
        const pairings=await host.locator('.match-card').evaluateAll(cards=>cards.map(card=>({
          id:card.getAttribute('data-match-id'),a:card.getAttribute('data-player1-id'),b:card.getAttribute('data-player2-id')
        })))
        expect(pairings).toHaveLength(4)
        const other=pairings.find(p=>p.a!==actors[0].user.user.id&&p.b!==actors[0].user.user.id)!
        const denied=await host.request.post(`/api/draft/${pod}/match/${other.id}/native`,{headers:{origin}})
        expect(denied.status()).toBe(404)
        const sessions=new Map<string,Awaited<ReturnType<typeof board>>>()
        await Promise.all(actors.map(async actor=>{
          await actor.page.locator('.match-card--mine').getByRole('button',{name:'Play',exact:true}).click()
          sessions.set(actor.user.user.id,await board(actor.page))
        }))
        for(const pair of pairings){
          const a=sessions.get(pair.a!)!,b=sessions.get(pair.b!)!
          expect(a.matchId).toBe(b.matchId)
          expect(a.seat).not.toBe(b.seat)
        }
        expect(new Set([...sessions.values()].map(s=>s.matchId)).size).toBe(4)
        // A second launch must resume the reserved game, not create another one.
        const mine=pairings.find(p=>p.a===actors[0].user.user.id||p.b===actors[0].user.user.id)!
        const rejoin=await host.request.post(`${origin}/api/draft/${pod}/match/${mine.id}/native`,{headers:{origin}})
        expect(rejoin.ok()).toBe(true)
        await host.goto((await rejoin.json()).launchUrl)
        expect((await board(host)).matchId).toBe(sessions.get(actors[0].user.user.id)!.matchId)
    }
    finally {
        await Promise.all(actors.map(a => a.context.close()));
    }
});
