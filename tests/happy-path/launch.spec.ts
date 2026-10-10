import { test, expect } from '@playwright/test';
import { player, importConstructed, importLobbyDeck, board } from './helpers';
import { cleanup } from './helpers';
const run = `happy_launch_${Date.now()}`;
test.afterAll(async () => { await cleanup(run); });
test('constructed Eternal deck reaches a real AI game', async ({ browser }) => {
    const a = await player(browser, run, 'LaunchAI');
    try {
        await a.page.goto('/play');
        await importConstructed(a.page);
        await a.page.getByRole('button', { name: /Play vs AI/ }).click();
        await board(a.page);
    }
    finally {
        await a.context.close();
    }
});
test('matchmaking pairs two accounts into the same real game', async ({ browser }) => {
    const a = await player(browser, run, 'QueueA'), b = await player(browser, run, 'QueueB');
    try {
        for (const p of [a, b]) {
            await p.page.goto('/play');
            await importConstructed(p.page);
        }
        await a.page.getByRole('button', { name: 'Join Eternal queue' }).click();
        await expect(a.page.getByRole('heading', { name: 'Finding your opponent' })).toBeVisible();
        await b.page.getByRole('button', { name: 'Join Eternal queue' }).click();
        const sessions = await Promise.all([board(a.page), board(b.page)]);
        expect(sessions[0].matchId).toBe(sessions[1].matchId);
        expect(sessions[0].seat).not.toBe(sessions[1].seat);
    }
    finally {
        await a.context.close();
        await b.context.close();
    }
});
test('private invitation admits its recipient into the host game', async ({ browser }) => {
    const a = await player(browser, run, 'PrivateA'), b = await player(browser, run, 'PrivateB');
    try {
        for (const p of [a, b]) {
            await p.page.goto('/play');
            await importConstructed(p.page);
        }
        await a.page.getByRole('button', { name: 'Create a private room' }).click();
        const invite = await a.page.getByLabel('Private game link').inputValue();
        await b.page.goto(invite);
        await importLobbyDeck(b.page);
        await b.page.getByRole('button', { name: 'Join private game', exact: true }).click();
        const sessions = await Promise.all([board(a.page), board(b.page)]);
        expect(sessions[0].matchId).toBe(sessions[1].matchId);
        expect(sessions[0].seat).not.toBe(sessions[1].seat);
    }
    finally {
        await a.context.close();
        await b.context.close();
    }
});

test('homepage Constructed: choose Eternal, import a deck and launch Leebo',async({browser})=>{
 const a=await player(browser,run,'HomepageAI');
 try {
  await a.page.goto('/');
  await a.page.getByRole('button',{name:'Play',exact:true}).click();
  await a.page.getByRole('button',{name:'Eternal',exact:true}).click();
  await importLobbyDeck(a.page);
  await a.page.getByRole('radio',{name:/vs AI/}).click();
  await a.page.getByRole('button',{name:'Play vs AI',exact:true}).click();
  expect((await board(a.page)).ai).toBe(true);
 }finally{await a.context.close()}
});
