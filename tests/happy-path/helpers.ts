import { expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestUser, getPool } from '../e2e/test-utils';
export const origin = 'http://localhost:3025';
export async function player(browser: Browser, run: string, name: string) {
    const user = await createTestUser(name, run, { isBetaTester: true, isPatron: true });
    const row = (await getPool().query('UPDATE users SET is_alpha_tester=true WHERE id=$1 RETURNING *', [user.user.id])).rows[0];
    const { createToken } = await import('../../lib/auth');
    user.token = createToken(row);
    const context = await browser.newContext({ baseURL: origin });
    // Next's dev HMR reconnect can reload an idle browser when an API route is
    // compiled for another player. Keep only this development socket inert;
    // application Socket.IO, HTTP requests and game traffic remain real.
    await context.routeWebSocket('**/_next/webpack-hmr*', () => {});
    await context.addCookies([{ name: user.cookieName, value: user.token, url: origin }]);
    const page = await context.newPage();
    return { page, context, user };
}
export async function importConstructed(page: Page) {
    await page.getByRole('button', { name: 'Eternal', exact: true }).click();
    await page.getByRole('button', { name: /Import a deck/ }).click();
    await page.getByLabel('Deck JSON', { exact: true }).fill(starterDeck());
    await page.getByRole('button', { name: 'Validate and use deck' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}
export async function board(page: Page) {
    await expect(page).toHaveURL(/localhost:8085/, { timeout: 90000 });
    await expect(page.locator('.table-frame')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.table-frame [aria-label^="Base damage"]:visible')).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Your player area', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Opponent player area', exact: true })).toBeVisible();
    const session = await page.request.get(new URL('api/session', page.url()).href);
    expect(session.ok()).toBe(true);
    const data = await session.json();
    expect(data.matchId).toBeTruthy();
    expect(data.mode).toBe('live');
    return data;
}
export async function buildDeck(page: Page) {
    await expect(page.locator('.canvas-card.leader:visible').first()).toBeVisible({ timeout: 60000 });
    await page.locator('.canvas-card.leader:not(.active-leader):visible').first().click();
    await page.locator('.canvas-card.base:not(.active-base):visible').first().click();
    const available = page.locator('.arena-pool-section .arena-stacked-card.is-last .resizable-card:visible, .pool-section .canvas-card:not(.leader):not(.base):visible');
    for (let i = 0; i < 30; i++) {
        await available.first().click();
        await page.mouse.move(0, 0);
    }
    const play = page.getByRole('button', { name: /Ready to Play/ });
    await expect(play).toBeEnabled();
    await play.click();
}
export async function cleanup(run: string) {
    const { getPool, closeDb } = await import('../e2e/test-utils');
    const db = await getPool().connect();
    try {
        await db.query('BEGIN');
        const users = (await db.query('SELECT id FROM users WHERE starts_with(discord_id,$1)', [`test_${run}_`])).rows.map(r => r.id);
        const pods = (await db.query('SELECT id FROM pods WHERE host_id=ANY($1::uuid[])', [users])).rows.map(r => r.id);
        const runs = (await db.query('SELECT id FROM ptp_solo_ai_runs WHERE owner_user_id=ANY($1::uuid[])', [users])).rows.map(r => r.id);
        for (const table of ['ptp_solo_ai_games', 'ptp_solo_ai_matches', 'ptp_solo_ai_participants'])
            await db.query(`DELETE FROM ${table} WHERE run_id=ANY($1::uuid[])`, [runs]);
        await db.query('DELETE FROM ptp_solo_ai_runs WHERE id=ANY($1::uuid[])', [runs]);
        const nativeIds=(await db.query('SELECT id FROM ptp_native_matches WHERE creator_user_id=ANY($1::uuid[])',[users])).rows.map(r=>r.id);
        await db.query('DELETE FROM ptp_native_game_records WHERE match_id=ANY($1::uuid[])',[nativeIds]);
        await db.query('DELETE FROM ptp_native_match_seats WHERE match_id=ANY($1::uuid[])',[nativeIds]);
        await db.query('DELETE FROM ptp_native_matches WHERE id=ANY($1::uuid[])',[nativeIds]);
        for (const table of ['ptp_solo_sealed_generations', 'ptp_native_pool_evidence', 'ptp_play_deck_versions'])
            await db.query(`DELETE FROM ${table} WHERE owner_user_id=ANY($1::uuid[])`, [users]);
        await db.query('DELETE FROM card_pools WHERE user_id=ANY($1::uuid[]) OR pod_id=ANY($2::uuid[])', [users, pods]);
        await db.query('DELETE FROM pod_players WHERE user_id=ANY($1::uuid[]) OR pod_id=ANY($2::uuid[])', [users, pods]);
        await db.query('DELETE FROM pods WHERE id=ANY($1::uuid[])', [pods]);
        await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
        await db.query('COMMIT');
    }
    catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
    finally {
        db.release();
        await closeDb();
    }
}
export async function sealedDeck(page: Page, packs: number) {
    await page.goto('/sealed');
    await page.getByRole('button', { name: `${packs} packs`, exact: true }).click();
    await page.getByRole('button', { name: 'HMW Homeworlds', exact: true }).click();
    await page.getByRole('button', { name: 'Open Packs', exact: true }).click();
    await page.locator('.skip-button').click({ timeout: 60000 });
    await page.getByRole('button', { name: /Build Deck/i }).click();
    await expect(page).toHaveURL(/\/pool[s]?\/[^/]+\/deck/, { timeout: 60000 });
    await buildDeck(page);
    await expect(page.getByRole('button', { name: /Play vs AI|Play vs Leebo/ })).toBeEnabled();
    await expect(page.locator('.sp-contract')).toContainText(`${packs} packs`);
    return new URL(page.url()).searchParams.get('pool')!;
}
export async function draftDeck(page: Page) {
    await page.goto('/draft/solo');
    await page.locator('.set-card').filter({ hasText: 'Homeworlds' }).click();
    await page.getByRole('button', { name: "I'm Ready", exact: true }).click({ timeout: 60000 });
    await page.getByRole('button', { name: 'Deal Packs', exact: true }).click();
    await page.getByRole('button', { name: 'Start Draft', exact: true }).click({ timeout: 60000 });
    await finishDraftAndBuild(page);
    await expect(page.getByRole('button', { name: /Play vs AI|Play vs Leebo/ })).toBeEnabled();
    return new URL(page.url()).searchParams.get('pool')!;
}
export async function finishDraftAndBuild(page: Page, timed = false) {
    await finishDraft(page, timed);
    await page.getByRole('button', { name: /Build Deck/i }).click();
    await buildDeck(page);
}
export async function finishDraft(page: Page, timed = false) {
    const pod = new URL(page.url()).pathname.split('/').pop();
    const state = async () => { const r = await page.request.get(`/api/draft/${pod}`); expect(r.ok()).toBe(true); const j = await r.json(); return j.data ?? j; };
    for (let picks = 0; picks < 50; picks++) {
        const current = await state();
        if (current.status === 'complete' || /\/(draft_pool|pools)\//.test(page.url()))
            break;
        const prior = current.myPlayer.draftedCards.length + current.myPlayer.draftedLeaders.length;
        const cards = page.locator('.leaders-grid .draftable-card:not(.selected):not(.disabled):not(.dimmed), .pack-grid .draftable-card:not(.selected):not(.disabled):not(.dimmed)');
        try {
            await cards.first().click({ timeout: 60000 });
            await expect(page.locator('.confirm-selection-button')).toBeEnabled({timeout: 20000});
            const [confirmed] = await Promise.all([
                page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/draft/${pod}/confirm`),
                page.locator('.confirm-selection-button').click()
            ]);
            // Competitive timers legitimately commit a staged pick before its
            // confirmation arrives. Only accept that conflict after proving
            // below that the server actually added a card to this player's pool.
            expect(confirmed.ok() || (timed && confirmed.status() === 409)).toBe(true);
        } catch(error) {
            if (!timed) throw error;
            const advanced=await state();
            if(advanced.myPlayer.draftedCards.length+advanced.myPlayer.draftedLeaders.length<=prior)throw error;
        }
        await expect.poll(async () => { const v = await state(); return v.myPlayer.draftedCards.length + v.myPlayer.draftedLeaders.length; }, { timeout: 30000 }).toBeGreaterThan(prior);
        await expect(page.locator('.confirm-selection-button')).toHaveCount(0);
    }
    const finished = await state();
    expect(finished.myPlayer.draftedLeaders).toHaveLength(3);
    expect(finished.myPlayer.draftedCards).toHaveLength(42);
    await expect(page).toHaveURL(/\/(draft_pool|pools)\//, { timeout: 60000 });
}

export function starterDeck() {
    const source = process.env.PURRGIL_SOURCE ?? resolve('../../../../purrgil/.worktrees/codex/alpha');
    const deck = JSON.parse(readFileSync(resolve(source, 'tests/integration/starter-decks.json'), 'utf8'))[0];
    return JSON.stringify({leader:{id:deck.leader},base:{id:deck.base},deck:deck.cards});
}
export async function importLobbyDeck(page:Page) {
    await page.getByRole('button', {name:'Import Deck',exact:true}).click();
    await page.getByLabel('Deck JSON',{exact:true}).fill(starterDeck());
    await page.getByRole('button', {name:'Use JSON',exact:true}).click();
}
