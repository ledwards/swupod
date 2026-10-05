import { test, expect, type Page } from "@playwright/test";
async function auth(page: Page, alpha: boolean) {
  await page.route("**/api/play/native/presentation",r=>r.fulfill({json:{enabled:alpha}}));
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: "entry-test",
            username: "Entry Test",
            is_beta_tester: true,
            is_alpha_tester: alpha,
            is_admin: false,
          },
        },
      },
    }),
  );
  await page.route("**/api/auth/patron-status", (r) =>
    r.fulfill({ json: { success: true, data: { isPatron: false } } }),
  );
  await page.route("**/api/pools/history*", (r) =>
    r.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route("**/api/draft/history*", (r) =>
    r.fulfill({ json: { success: true, data: { pods: [] } } }),
  );
  await page.route("**/api/pods/public", (r) =>
    r.fulfill({ json: { success: true, data: { pods: [] } } }),
  );
  await page.route("**/api/play/native/public", (r) =>
    r.fulfill({ json: { entries: [], availability: null } }),
  );
}
test("alpha home renders actual entry actions without redundant navigation", async ({
  page,
}) => {
  await auth(page, true);
  await page.route("**/api/entry", (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          latest: { code: "HMW", name: "Homeworlds", public: true, prereleaseDate: "2026-10-02", releaseDate: "2026-10-09" },
          packs: [
            "/pack-images/hmw-pack-1.png",
            "/pack-images/hmw-pack-2.png",
            "/pack-images/hmw-pack-3.png",
          ],
          tableImage: "/table-environments/kashyyyk.webp",
          commons: [],
          leaders: [],
          resumes: [],
        },
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.locator('.entry-header-home img[alt="Protect the Pod"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome to Protect the Pod!" }),
  ).toHaveCount(0);
  await expect(page.locator(".entry-header-banner")).toContainText(
    "Homeworlds is live!",
  );
  await expect(page.locator(".entry-header-banner")).toContainText("Pre-Release Date: October 2, 2026");
  await expect(page.locator(".entry-header-banner")).toContainText("Release Date: October 9, 2026");
  await expect(page.locator(".entry-choices")).toHaveCSS(
    "--entry-table-image",
    'url("/table-environments/kashyyyk.webp")',
  );
  await expect(
    page.getByRole("button", { name: "Open news feed" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open release notes", exact: true })).toBeVisible();
  await expect(page.locator(".release-notes")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Sealed Build a deck from 6 or 8 packs",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Privacy", exact: true }),
  ).toBeVisible();
});
test("beta-only direct setup link returns to legacy setup", async ({ page }) => {
  await auth(page, false);
  await page.goto("/limited/sealed");
  await expect(page).toHaveURL(/\/sealed$/);
  await page.goto("/");
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome to Protect the Pod!" }),
  ).toHaveCount(0);
});
test("sealed pack count, set modal and pod visibility work at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await auth(page, true);
  await page.goto("/limited/sealed");
  await page.getByRole("button", { name: "8 packs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open 8 packs", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".entry-pack-fan img")).toHaveCount(8);
  await page.locator(".entry-set-button").click();
  await page
    .getByRole("dialog")
    .locator(".set-card")
    .filter({ hasText: "Spark of Rebellion" })
    .click();
  await expect(
    page.getByRole("button", { name: "Spark of Rebellion", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /With other players/ }).click();
  await page.getByRole("button", { name: /Private Unlisted/ }).click();
  await expect(
    page.getByRole("button", { name: /Private Unlisted/ }),
  ).toHaveClass(/btn--active/);
  await expect(
    page.getByRole("button", { name: "Create pod", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Find opponent reserves the selected deck and keeps its retry key after a failed response", async ({
  page,
}) => {
  await auth(page, true);
  await page.route("**/api/play/native/decks", (r) =>
    r.fulfill({
      json: {
        decks: [
          {
            poolShareId: "deck-1",
            name: "Saved draft",
            poolType: "draft",
            setCode: "HMW",
            packCount: 3,
            mainDeckCount: 30,
            ready: true,
            editLocked: false,
          },
        ],
      },
    }),
  );
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/api/play/native/public", (r) => {
    if (r.request().method() === "POST") {
      attempts.push(r.request().postDataJSON());
      return r.fulfill({ status: 503, json: { error: "Try again" } });
    }
    return r.fulfill({ json: { entries: [], availability: null } });
  });
  await page.goto("/limited/play");
  await page.getByRole("button", { name: /^Find opponent/ }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Try again" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Find opponent/ }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[0]?.poolShareId).toBe("deck-1");
  expect(attempts[0]?.requestId).toBe(attempts[1]?.requestId);
});

test("home shows one unfinished item and More opens the complete list", async ({
  page,
}) => {
  await auth(page, true);
  await page.route("**/api/entry", (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          latest: { code: "HMW", name: "Homeworlds", public: true, prereleaseDate: "2026-10-02", releaseDate: "2026-10-09" },
          packs: [],
          commons: [],
          leaders: [],
          resumes: Array.from({ length: 5 }, (_, i) => ({
            id: `pool-${i}`,
            label: `Unfinished deck ${i + 1}`,
            action: "Build deck",
            href: `/pool/pool-${i}/deck`,
          })),
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".entry-resume .entry-resume-row")).toHaveCount(1);
  await expect(page.locator(".entry-resume")).toContainText(
    "Unfinished deck 1",
  );
  await page.getByRole("button", { name: "More", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Unfinished games and decks",
  });
  await expect(dialog.locator(".entry-resume-row")).toHaveCount(5);
  await expect(dialog).toContainText("Unfinished deck 5");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "More", exact: true }),
  ).toBeFocused();
});


test("release notes start at zero and remember unread additions until opened", async ({ page, context }) => {
  await auth(page, false);
  let notes = "# Release Notes\n\n## 10.02.2026\n\n- First update.\n\n## 10.01.2026\n\n- Older update.";
  await page.route("**/RELEASE_NOTES.md*", route => route.fulfill({ body: notes }));
  await page.goto("/");
  await expect(page.getByRole('button', {name:'Open release notes',exact:true})).toBeVisible();
  await expect(page.locator('.release-notes')).toHaveCount(0);
  expect((await context.cookies()).some(cookie => cookie.name === 'ptp_release_notes_read_v1')).toBe(true);
  notes = notes.replace('- First update.', '- First update.\n- Second update.\n- Third update.');
  await page.reload();
  await expect(page.getByRole('button', {name:'Open release notes, 2 unread',exact:true})).toBeVisible();
  await expect(page.locator('.release-notes')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', {name:'Open release notes, 2 unread',exact:true}).click();
  await expect(page.locator('.release-notes')).toContainText('Third update.');
  await expect(page.locator('.release-notes-unread')).toHaveCount(0);
  await page.getByRole('button', {name:'Close release notes'}).click();
  await page.reload();
  await expect(page.getByRole('button', {name:'Open release notes',exact:true})).toBeVisible();
  notes = notes.replace('## 10.02.2026', '## 10.03.2026\n\n- Next day.\n\n## 10.02.2026');
  await page.reload();
  await expect(page.getByRole('button', {name:'Open release notes, 1 unread',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button', {name:'Open release notes, 1 unread',exact:true}).click();
  await expect(page.locator('.release-notes')).toBeVisible();
});


test('entry deck picker searches and combines format and set filters', async ({ page }) => {
  await auth(page, true);
  await page.route('**/api/play/native/decks', r => r.fulfill({ json: { decks: [
    { poolShareId: 'a', name: 'Rebel fleet', leaderName: 'Leia', setCode: 'SOR', poolType: 'draft', ready: true, mainDeckCount: 30, leaderBackImageUrl: '/ptp_logo400.png', leaderImageUrl: '/ptp_logo400.png' },
    { poolShareId: 'b', name: 'Wookiees', leaderName: 'Chewbacca', setCode: 'HMW', poolType: 'sealed', ready: true, mainDeckCount: 30 },
  ] } }));
  await page.goto('/limited/play');
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
  await expect(page.locator('.your-stats-pool-build-art img').first()).toHaveAttribute('src', '/expansion-art/hmw.png');
  await page.getByRole('searchbox', { name: 'Search decks' }).fill('leia');
  await expect(page.locator('.entry-library-deck')).toHaveCount(1);
  await expect(page.locator('.entry-library-deck')).toContainText('SOR · Draft');
  await page.getByRole('button', { name: 'Sealed', exact: true }).click();
  await expect(page.getByText('No decks match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Deck set', { exact: true }).selectOption('HMW');
  await expect(page.locator('.entry-library-deck')).toHaveCount(1);
  await expect(page.locator('.entry-library-deck')).toContainText('HMW · Sealed');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('complete decks toggle hides unfinished builds without displaying blocker messages', async ({ page }) => {
  await auth(page, true);
  await page.route('**/api/play/native/decks', r => r.fulfill({ json: { decks: [
    { poolShareId: 'finished', name: 'Finished older deck', poolType: 'sealed', setCode: 'HMW', mainDeckCount: 30, complete: true, ready: false, blocker: 'This older Sealed deck cannot be used for play.' },
    { poolShareId: 'unfinished', name: 'Unfinished deck', poolType: 'draft', setCode: 'HMW', mainDeckCount: 12, complete: false, ready: false, blocker: 'Add more cards.' },
  ] } }));
  await page.goto('/limited/play');
  await expect(page.getByRole('checkbox', { name: 'Complete decks only' })).toBeChecked();
  await expect(page.locator('.entry-library-deck')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Complete decks only' }).uncheck();
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
  await expect(page.getByText('Add more cards.')).toHaveCount(0);
  await expect(page.getByText('This older Sealed deck cannot be used for play.')).toHaveCount(0);
  const unfinished = page.locator('.entry-library-deck').filter({ hasText: 'Unfinished deck' });
  await expect(unfinished).toHaveClass(/is-incomplete/);
  await expect(unfinished.getByRole('button', { name: 'Edit deck' })).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Complete decks only' }).click();
  await expect(page.locator('.entry-library-deck')).toHaveCount(1);
  await expect(page.locator('.entry-library-deck')).toContainText('Finished older deck');
  await expect(page.locator('.entry-library-deck').getByRole('button', { name: 'Select Finished older deck', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Complete decks only' }).click();
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
});


test('AI deck rows omit blockers, keep editing, and filter incomplete saved decks', async ({ page }) => {
  await auth(page, true);
  const deck = { poolShareId: 'older', name: 'My older deck', setCode: 'HMW', poolType: 'sealed', leaderImageUrl: '/ptp_logo400.png', leaderBackImageUrl: '/ptp_logo400.png', mainDeckCount: 30, ready: false, complete: true, editLocked: false, blocker: 'This older Sealed deck cannot be used for play.' };
  let prepares = 0;
  await page.route('**/api/entry/ai**', r => {
    if (r.request().method() === 'POST') { prepares++; return r.fulfill({ status: 409, json: { error: deck.blocker, code: 'unverified_source' } }); }
    return r.fulfill({ json: { deck, savedDecks: [deck, { ...deck, poolShareId: 'unfinished', name: 'Work in progress', complete: false, mainDeckCount: 10 }], bots: [], opponent: null, status: null, choice: 'default' } });
  });
  await page.goto('/limited/ai?pool=older&request=old-request');
  await expect(page.getByRole('searchbox', { name: 'Search saved decks' })).toHaveCount(0);
  await expect(page.getByRole('button', {name:/^(Change deck|Hide picker)$/})).toBeEnabled();
  if (await page.getByRole('button', {name:'Change deck',exact:true}).isVisible()) await page.getByRole('button', {name:'Change deck',exact:true}).click();
  await page.getByRole('button', { name: 'My saved decks', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete decks only' })).toBeChecked();
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Complete decks only' }).uncheck();
  await expect(page.locator('.entry-library-deck')).toHaveCount(3);
  await expect(page.getByText(deck.blocker)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit deck' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Generate another opponent' })).toHaveCount(0);
  await expect(page.locator('.entry-library-deck.is-incomplete')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Complete decks only' }).click();
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Complete decks only' }).click();
  await page.getByRole('searchbox', { name: 'Search saved decks' }).fill('progress');
  await expect(page.locator('.entry-library-deck')).toHaveCount(2);
  expect(prepares).toBe(0);
});


for (const width of [1440, 390]) {
  test(`AI loading preserves the final shell and columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await auth(page, true);
    let requested = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/entry/ai**', async r => {
      requested = true;
      await pending;
      await r.fulfill({ json: { deck: { poolShareId: 'test', name: 'Saved deck', setCode: 'HMW', poolType: 'sealed', mainDeckCount: 30, ready: false, complete: true }, savedDecks: [], bots: [], status: null, opponent: null, choice: 'default' } });
    });
    await page.goto('/limited/ai?pool=test');
    await expect.poll(()=>requested).toBe(true);
    await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your deck', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI opponent', exact: true })).toBeVisible();
    await expect(page.locator('.entry-choices')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const beforeTitle = await page.getByRole('heading', { level: 1 }).boundingBox();
    const beforeColumns = await page.locator('.entry-layout').boundingBox();
    const beforeHeader = await page.locator('.entry-header').boundingBox();
    await page.screenshot({ path: `artifacts/ai-loading-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    release();
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
    expect(await page.getByRole('heading', { level: 1 }).boundingBox()).toEqual(beforeTitle);
    expect(await page.locator('.entry-header').boundingBox()).toEqual(beforeHeader);
    const afterColumns = await page.locator('.entry-layout').boundingBox();
    expect(afterColumns?.y).toBe(beforeColumns?.y);
    expect(afterColumns?.width).toBe(beforeColumns?.width);
    await page.screenshot({ path: `artifacts/ai-loaded-${width}.png` });
  });
}
for (const mode of ['draft', 'sealed', 'play', 'ai']) {
  test(`authentication loading hides alpha content on the ${mode} route`, async ({ page }) => {
    await auth(page, true);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/auth/session', async r => { await pending; await r.fulfill({ json: { success: true, data: { user: null } } }); });
    await page.goto(`/limited/${mode}`);
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(1);
    await expect(page.locator('.entry-layout')).toHaveCount(0);
    await expect(page.locator('.entry-choices')).toHaveCount(0);
    release();
  });
}

test('AI source buttons reveal only the selected picker and keep launch actions spaced', async ({ page }) => {
  await auth(page, true);
  const deck = { poolShareId: 'player', name: 'Player deck', setCode: 'HMW', poolType: 'sealed', mainDeckCount: 30, complete: true, ready: true };
  await page.route('**/api/entry/ai**', r => r.fulfill({ json: { deck, savedDecks: [{ ...deck, poolShareId: 'saved', name: 'Saved opponent' }], bots: [], status: null, choice: 'default', opponent: { runId: 'run', name: 'Generated opponent', mainDeckCount: 30 } } }));
  await page.goto('/limited/ai?pool=player&request=existing');
  const launch = page.getByRole('button', { name: 'Play vs AI Alpha', exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/limited/ai?pool=player&request=existing');
    await expect(page.getByRole('searchbox', { name: 'Search saved decks' })).toHaveCount(0);
    await expect(launch).toBeEnabled();
    await expect(page.locator('.entry-opponent-preview').getByRole('button', { name: 'Generate another opponent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate another opponent' })).toHaveText('');
    await page.screenshot({ path: `artifacts/entry-refresh-${width}.png` });
    await expect(page.getByRole('button', {name:/^(Change deck|Hide picker)$/})).toBeEnabled();
  if (await page.getByRole('button', {name:'Change deck',exact:true}).isVisible()) await page.getByRole('button', {name:'Change deck',exact:true}).click();
  await page.getByRole('button', { name: 'My saved decks', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search saved decks' })).toBeVisible();
    await expect(launch).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generate another opponent' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Generated deck', exact: true }).click();
    await expect(launch).toBeEnabled();
    await expect(page.getByRole('searchbox', { name: 'Search saved decks' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('AI saved decks default to matching set but allow selecting another set', async ({ page }) => {
  await auth(page, true);
  const deck = { poolShareId: 'player', name: 'Homeworlds deck', setCode: 'HMW', poolType: 'sealed', mainDeckCount: 30, complete: true, ready: true };
  let chosen: string | undefined;
  await page.route('**/api/entry/ai**', r => {
    if (r.request().method() === 'POST') {
      chosen = r.request().postDataJSON().opponentPoolShareId;
      return r.fulfill({ json: { runId: 'other-run', name: 'Saved opponent', mainDeckCount: 30 } });
    }
    return r.fulfill({ json: { deck, savedDecks: [deck, { ...deck, poolShareId: 'other-set', setCode: 'LAW', name: 'Lawless deck', ready: false, aiOpponentReady: true }], bots: [], status: null, choice: chosen ? `saved:${chosen}` : 'default', opponent: { runId: 'run', name: 'Generated opponent', mainDeckCount: 30 } } });
  });
  await page.goto('/limited/ai?pool=player&request=existing');
  await expect(page.getByRole('button', {name:/^(Change deck|Hide picker)$/})).toBeEnabled();
  if (await page.getByRole('button', {name:'Change deck',exact:true}).isVisible()) await page.getByRole('button', {name:'Change deck',exact:true}).click();
  await page.getByRole('button', { name: 'My saved decks', exact: true }).click();
  const matchSet = page.getByRole('combobox', { name: 'Opponent deck set' });
  await expect(matchSet).toHaveValue('HMW');
  const other = page.locator('.entry-library-deck').filter({ hasText: 'Lawless deck' });
  await expect(other).toHaveCount(0);
  await matchSet.selectOption('');
  await expect(other).toBeVisible();
  await other.getByRole('button', { name: 'Select Lawless deck', exact: true }).click();
  await expect.poll(() => chosen).toBe('other-set');
  await expect(page.getByRole('button', { name: 'Change deck', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search saved decks' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play vs AI Alpha', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Change deck', exact: true }).click();
  await expect(page.locator('aside').getByRole('searchbox', { name: 'Search saved decks' })).toBeVisible();
  await matchSet.selectOption('HMW');
  await expect(other).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play vs AI Alpha', exact: true })).toBeEnabled();
});

for (const width of [1440, 390]) {
  test(`Draft AI picker selects a draft seat, collapses, and reopens for saved decks at ${width}px`, async ({ page }) => {
    await auth(page, true);
    await page.setViewportSize({width, height:1000});
    const deck = { poolShareId:'draft-player',name:'My draft',setCode:'HMW',poolType:'draft',mainDeckCount:30,complete:true,ready:true,aiOpponentReady:true };
    const botId='d563b290-b2ef-493c-a43d-d6b6c69baf56';
    let selection='default';
    let selectedSeat: string | undefined;
    await page.route('**/api/entry/ai**',r=>{
      if(r.request().method()==='POST') {
        const body=r.request().postDataJSON();selectedSeat=body.opponentParticipantId;
        selection=body.opponentPoolShareId ? `saved:${body.opponentPoolShareId}` : `draft:${selectedSeat}`;
        return r.fulfill({json:{runId:'prepared',name:'Draft opponent',mainDeckCount:30}});
      }
      return r.fulfill({json:{deck,savedDecks:[{...deck,poolShareId:'saved-draft',name:'Saved draft'}],bots:[{id:botId,name:'Draft opponent · seat 4'}],status:null,choice:selection,opponent:{runId:'prepared',name:'Draft opponent',mainDeckCount:30}}});
    });
    await page.goto('/limited/ai?pool=draft-player&request=existing');
    await expect(page.getByRole('button',{name:'Generate another opponent'})).toHaveCount(0);
    await page.getByRole('button',{name:'Change deck'}).click();
    const picker=page.locator('#entry-opponent-picker');
    await expect(picker).toHaveCSS('scrollbar-width','none');
    await expect(picker.locator('.entry-library-deck')).toHaveCount(1);
    await expect(picker.locator('.entry-library-deck h3')).toHaveText('Draft opponent · seat 4');
    await page.locator('aside').getByRole('button',{name:'Select Draft opponent · seat 4',exact:true}).click();
    await expect.poll(()=>selectedSeat).toBe(botId);
    await expect(page.getByRole('button',{name:'Change deck'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Select Draft opponent · seat 4',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Change deck'}).click();
    await page.getByRole('button',{name:'My saved decks'}).click();
    await expect(page.getByRole('combobox',{name:'Opponent deck set'})).toHaveValue('HMW');
    await page.locator('aside .entry-library-deck').filter({hasText:'Saved draft'}).getByRole('button',{name:'Select Saved draft',exact:true}).click();
    await expect.poll(()=>selection).toBe('saved:saved-draft');
    await expect(page.getByRole('button',{name:'Change deck'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Play vs AI Alpha',exact:true})).toBeEnabled();
    await page.screenshot({path:`artifacts/entry-draft-collapsed-${width}.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('complete legacy deck is selectable for AI while multiplayer eligibility stays separate', async ({page}) => {
  await auth(page,true);
  const deck={poolShareId:'legacy',name:'Older Jar Jar deck',setCode:'HMW',poolType:'sealed',mainDeckCount:31,complete:true,ready:false,aiOpponentReady:true};
  await page.route('**/api/play/native/decks',r=>r.fulfill({json:{decks:[deck]}}));
  await page.route('**/api/entry/ai**',r=>r.fulfill({json:{deck:{...deck,ready:true},savedDecks:[],bots:[],choice:'default',status:null,opponent:{runId:'ready',name:'AI opponent',mainDeckCount:30}}}));
  await page.goto('/limited/play');
  await expect(page.getByRole('button',{name:'Select Older Jar Jar deck',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:/Find opponent/})).toBeDisabled();
  await expect(page.getByRole('button',{name:/Invite friend/})).toBeDisabled();
  await page.getByRole('button',{name:/Play vs AI/}).click();
  await expect(page).toHaveURL(/pools\/legacy\/play\/ai|runs\//);
  await expect(page.getByRole('button',{name:'Play vs AI Alpha',exact:true})).toBeEnabled();
});

for (const width of [1440, 390]) {
  test(`AI launch error stays with opponent and retries the same game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await auth(page, true);
    const attempts: any[] = [];
    await page.route('**/api/entry/ai**', r => {
      if (r.request().method() === 'POST') {
        attempts.push(r.request().postDataJSON());
        return r.fulfill({ status: 503, json: { code: 'runtime_unavailable', error: 'Game service is unavailable; your reserved match is safe to retry.' } });
      }
      return r.fulfill({ json: {
        deck: { poolShareId: 'human', name: 'My Sealed deck', poolType: 'sealed', setCode: 'HMW', mainDeckCount: 30, ready: true },
        savedDecks: [], bots: [], status: null, choice: 'default',
        opponent: { runId: 'saved-game', name: 'Cham Syndulla', mainDeckCount: 30 },
      } });
    });
    await page.goto('/limited/ai?pool=human&request=existing');
    await page.getByRole('button', { name: 'Play vs AI Alpha', exact: true }).click();
    const error = page.locator('aside.entry-panel [role="alert"]');
    await expect(error).toContainText('Couldn’t start your game');
    await expect(error).toContainText('Your deck and opponent are saved.');
    await expect(page.getByText('Game service is unavailable', { exact: false })).toHaveCount(0);
    await error.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => attempts.length).toBe(6);
    expect(attempts).toEqual(Array.from({length:6},()=>({ action: 'resume', runId: 'saved-game' })));
    await expect(error).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/entry-launch-error-${width}.png`, fullPage: true });
  });
}

test('homepage does not flash the alpha design while session is unresolved', async ({page}) => {
  await auth(page, false);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/session', async route => {
    await pending;
    await route.fulfill({json:{success:true,data:{user:null}}});
  });
  await page.goto('/');
  await expect(page.getByRole('status', {name:'Loading', exact:true})).toBeVisible();
  await expect(page.locator('.entry-header-home, .entry-choices, .landing-page')).toHaveCount(0);
  release();
  await expect(page.locator('.landing-page')).toBeVisible();
  await expect(page.locator('.entry-header-home, .entry-choices')).toHaveCount(0);
});

test('completed AI game offers a working rematch using the saved matchup', async ({ page }) => {
  await auth(page, true);
  const attempts: any[] = [];
  await page.route('**/api/entry/ai**', r => {
    if (r.request().method() === 'POST') {
      attempts.push(r.request().postDataJSON());
      return r.fulfill({ json: { launchUrl: '/rematch-test-game' } });
    }
    return r.fulfill({ json: {
      deck: { poolShareId: 'human', name: 'My deck', poolType: 'sealed', setCode: 'HMW', mainDeckCount: 30, ready: true },
      savedDecks: [], bots: [], choice: 'default',
      opponent: { runId: 'finished-run', name: 'Saved opponent', mainDeckCount: 30 },
      status: { run: { id: 'finished-run', complete: true, currentGame: null, matches: [{ games: [{ result: 'player1' }] }] } },
    } });
  });
  await page.route('**/rematch-test-game', r => r.fulfill({ body: 'Fresh game' }));
  await page.goto('/limited/ai?pool=human&request=finished');
  const rematch=page.getByRole('button', { name: 'Rematch Alpha', exact: true });
  await expect(rematch).toBeEnabled();
  await rematch.click();
  await expect(page).toHaveURL(/rematch-test-game$/);
  expect(attempts).toEqual([{ action: 'rematch', runId: 'finished-run' }]);
});

for (const width of [1440,390]) test(`AI styles preserve the opponent and survive reload at ${width}px`, async ({page}) => {
 await page.setViewportSize({width,height:1000}); await auth(page,true);
 const deck={poolShareId:'player',name:'Player deck',setCode:'HMW',poolType:'sealed',mainDeckCount:30,complete:true,ready:true};
 let style='balanced'; const posts:Record<string,unknown>[]=[]; let started=false;
 await page.route('**/api/entry/ai**',r=>{
  if(r.request().method()==='POST') { const body=r.request().postDataJSON(); posts.push(body); style=body.aiStyle; return r.fulfill({json:{aiStyle:style}}); }
  return r.fulfill({json:{deck,savedDecks:[],bots:[],choice:'default',aiStyle:style,
   opponent:{runId:'same-run',name:'Same opponent',mainDeckCount:30},
   status:started?{run:{id:'same-run',complete:false,matches:[],currentGame:{started:true}}}:null}});
 });
 await page.goto('/limited/ai?pool=player&request=existing');
 await expect(page.getByRole('button',{name:'Balanced',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Aggro',exact:true}).click();
 await expect(page.getByRole('button',{name:'Aggro',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(posts).toEqual([{action:'style',runId:'same-run',aiStyle:'aggro'}]);
 await expect(page.getByText('Same opponent',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'Aggro',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Control',exact:true}).click();
 await expect(page.getByRole('button',{name:'Control',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Control',exact:true})).toHaveClass(/btn--active/);
 await page.screenshot({path:`artifacts/ai-styles-${width}.png`,animations:'disabled'});
 started=true;await page.reload();
 await expect(page.getByRole('button',{name:'Aggro',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Control',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('a new AI game uses the remembered style when preparing its opponent', async ({page}) => {
 await auth(page,true);
 await page.addInitScript(()=>localStorage.setItem('ptp-ai-style','control'));
 let selected: string | undefined;
 const deck={poolShareId:'player',name:'Player deck',setCode:'HMW',poolType:'sealed',mainDeckCount:30,complete:true,ready:true};
 await page.route('**/api/entry/ai**',r=>{
  if(r.request().method()==='POST') { const body=r.request().postDataJSON(); expect(body.action).toBe('prepare');selected=body.aiStyle;return r.fulfill({json:{runId:'fresh',name:'New opponent',mainDeckCount:30}}); }
  return r.fulfill({json:{deck,savedDecks:[],bots:[],status:null,choice:'default',opponent:null,aiStyle:null}});
 });
 await page.goto('/limited/ai?pool=player');
 await expect(page.getByRole('button',{name:'Play vs AI Alpha',exact:true})).toBeEnabled();
 expect(selected).toBe('control');
 await expect(page.getByRole('button',{name:'Control',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('draft bracket offers a complete solo draft and resumes the saved tournament', async ({ page }) => {
  await auth(page, true)
  const pool = 'bracket-test'
  await page.route('**/api/play/native/decks*', r => r.fulfill({json:{decks:[{poolShareId:pool,name:'Draft test',setCode:'HMW',poolType:'draft',mainDeckCount:30,ready:true,complete:true,bracketEligible:true,editLocked:false}]}}))
  const matches = Array.from({length:4},(_,i)=>({id:`match${i}`,round:1,players:[{id:i===0?'human':`bot${i}`,name:i===0?'You':`DraftBot ${i}`},{id:`opponent${i}`,name:`Opponent ${i}`}],wins:[0,0],winner:null,games:[{id:`game${i}`,number:1,result:null,started:i!==0,error:null}],stalled:false}))
  const run = {matchBestOf:3,id:'run',requestId:'00000000-0000-4000-8000-000000000001',poolShareId:pool,round:1,rounds:3,complete:false,singleGame:false,eventFormat:'elimination',eliminated:false,preparing:false,currentGame:{id:'game0',number:1,started:false},standings:[],matches}
  await page.route('**/api/entry/runs/run',r=>r.fulfill({json:{pool,request:run.requestId,format:'elimination'}}))
  let prepared = false
  let prepareCount = 0
  await page.route('**/api/play/native/solo*', async r => {
    if(r.request().method()==='POST') {
      const input = r.request().postDataJSON()
      expect(input.eventFormat).toBe('elimination')
      expect(input.action).toBe('prepare')
      prepareCount++; prepared=true
      await r.fulfill({json:{runId:'run',requestId:run.requestId}})
    } else await r.fulfill({json:{run:prepared?run:null,unavailableReason:null}})
  })
  await page.goto(`/limited/play?pool=${pool}`)
  await page.getByRole('button',{name:'Play elimination bracket'}).click()
  await expect(page.getByRole('heading',{name:'Draft bracket',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Create bracket Alpha',exact:true}).click()
  await expect(page.getByRole('button',{name:/^Play game 1(?: Alpha)?$/})).toBeVisible()
  await expect(page.getByLabel('Tournament bracket').getByRole('article')).toHaveCount(4)
  await page.reload()
  await expect(page.getByRole('button',{name:/^Play game 1(?: Alpha)?$/})).toBeVisible()
  expect(prepareCount).toBe(1)
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

for (const bestOf of [1,3]) test(`solo Swiss BO${bestOf} keeps names, archetypes, records and final standings`, async ({page}) => {
  await auth(page,true)
  const names=['You','DraftBot Alpha','DraftBot Beta','DraftBot Gamma','DraftBot Delta','DraftBot Epsilon','DraftBot Zeta','DraftBot Eta']
  const players=names.map((name,i)=>({id:i===0?'human':`bot${i}`,name,archetype:i===0?'Warrior Tatooine Green 30':'Tarfful Red 30',wins:0,losses:0}))
  const matches=Array.from({length:4},(_,i)=>({id:`m${i}`,round:1,players:[players[i],players[i+4]],wins:[0,0],winner:null,games:[{id:`g${i}`,number:1,result:null,started:i!==0,error:null}],stalled:false}))
  const run:any={id:'run',requestId:'00000000-0000-4000-8000-000000000001',poolShareId:'test-pool',round:1,rounds:3,complete:false,singleGame:false,eventFormat:'swiss',matchBestOf:bestOf,eliminated:false,preparing:false,currentGame:{id:'g0',number:1,started:false},standings:players.map((p,i)=>({...p,username:p.name,rank:i+1,omwPercent:0.33})),matches}
  await page.route('**/api/entry/runs/run',r=>r.fulfill({json:{pool:'test-pool',request:run.requestId,format:'swiss'}}))
  let prepared=false
  await page.route('**/api/play/native/solo*',async r=>{
    if(r.request().method()==='POST'){
      expect(r.request().postDataJSON()).toMatchObject({action:'prepare',eventFormat:'swiss',matchBestOf:bestOf})
      prepared=true;await r.fulfill({json:{runId:'run'}})
    } else await r.fulfill({json:{run:prepared?run:null,unavailableReason:null}})
  })
  await page.goto('/limited/swiss?pool=test-pool')
  await page.getByRole('button',{name:`BO${bestOf}`,exact:true}).click()
  await page.getByRole('button',{name:/^Start Swiss rounds(?: Alpha)?$/}).click()
  await expect(page.getByRole('button',{name:/^Play game 1(?: Alpha)?$/})).toBeVisible()
  await expect(page.getByLabel('Round pairings').getByText('Warrior Tatooine Green 30')).toBeVisible()
  await page.screenshot({path:`/tmp/swiss-centered-vs-bo${bestOf}.png`,fullPage:true})
  await expect(page.getByLabel('Round pairings').getByText('DraftBot Eta (0-0)')).toBeVisible()
  await expect(page.getByLabel('Round pairings').getByText(/^(You|DraftBot .+) \(0-0\)$/)).toHaveCount(8)
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  run.complete=true;run.round=3;run.currentGame=null
  run.matches=[1,2,3].flatMap(round=>matches.map(m=>({...m,id:`${round}-${m.id}`,round,winner:m.players[0]?.id,wins:[bestOf===1?1:2,0],games:[]})))
  await page.reload()
  await expect(page.getByRole('heading',{name:'Final standings',exact:true})).toBeVisible()
  await expect(page.getByLabel('Final standings').locator('li')).toHaveCount(8)
  await page.screenshot({path:`/tmp/swiss-winners-bo${bestOf}.png`,fullPage:true})
  await expect(page.getByRole('button',{name:/Play game|Resume game/})).toHaveCount(0)
})
for (const width of [1440,390]) test(`deck surface selects without clipping at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await auth(page,true);
 await page.route('**/api/play/native/decks',r=>r.fulfill({json:{decks:['one','two'].map((id,i)=>({poolShareId:id,name:`Deck ${i+1}`,setCode:'HMW',poolType:'draft',mainDeckCount:30,complete:true,ready:true,editLocked:false,leaderName:'The Warrior',baseName:'Tusken Camp'}))}}));
 await page.goto('/play');
 const first=page.locator('.entry-library-deck').first(),second=page.locator('.entry-library-deck').nth(1);
 await expect(first).toBeVisible();await first.hover();
 const geometry=await first.evaluate(el=>{const card=el.getBoundingClientRect(),list=el.parentElement!.getBoundingClientRect();return {cardTop:card.top,listTop:list.top,cardBottom:card.bottom,listBottom:list.bottom,transform:getComputedStyle(el).transform}});
 expect(geometry.transform).toBe('none');expect(geometry.cardTop).toBeGreaterThanOrEqual(geometry.listTop);expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.listBottom);
 await second.scrollIntoViewIfNeeded();const title=await second.getByRole('heading',{name:'Deck 2'}).boundingBox();await page.mouse.click(title!.x+20,title!.y+10);await expect(second).toHaveClass(/is-selected/);await expect(first).not.toHaveClass(/is-selected/);
 await expect(page.getByRole('button',{name:'Select Saved draft',exact:true})).toHaveCount(0);
 await first.getByRole('button',{name:'Select Deck 1',exact:true}).focus();await page.keyboard.press('Enter');await expect(first).toHaveClass(/is-selected/);
 await page.screenshot({path:`/tmp/deck-surface-${width}.png`,fullPage:true});
 await second.getByRole('button',{name:'Edit deck',exact:true}).click();await expect(page).toHaveURL(/\/pools\/two\/deck/);
});
