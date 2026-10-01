import { test, expect, type Page } from '@playwright/test'

// Browser contract tests with explicit API doubles. These do not claim real-engine integration.
const deck = { poolShareId: 'pool-fixture', setCode: 'SOR', setName: 'Spark of Rebellion', poolType: 'draft', name: 'Saved draft deck', leaderName: 'Luke Skywalker', baseName: 'Command Center', mainDeckCount: 30, ready: true, blocker: null, createdAt: null, updatedAt: null }
async function signedIn(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { success: true, data: { user: { id: 'test-user', username: 'Test player', email: 'test@example.invalid', is_admin: false, is_beta_tester: true } } } }))
  await page.route('**/api/auth/patron-status', route => route.fulfill({ json: { success: true, data: { isPatron: false } } }))
  await page.route('**/api/play/lobby', route => route.fulfill({ json: { success: true, data: { decks: [deck] } } }))
  await page.route('**/api/play/native/matches', route => route.fulfill({ json: { matches: [] } }))
}

test('native invite sign-in keeps invitation and selected deck', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { success: true, data: null } }))
  await page.goto('/play/native?invite=private-fixture&pool=pool-fixture')
  const href = await page.getByRole('link', { name: 'Sign in with Discord', exact: true }).getAttribute('href')
  expect(new URL(href!, 'https://example.invalid').searchParams.get('return_to')).toBe('/play/native?invite=private-fixture&pool=pool-fixture')
})

test('a lost create response retains request identity and selected deck on retry', async ({ page }) => {
  await signedIn(page)
  const ids: string[] = []
  await page.route('**/api/play/native/invitations', async route => {
    const body = route.request().postDataJSON() as { requestId: string; poolShareId: string }
    ids.push(body.requestId)
    expect(body.poolShareId).toBe(deck.poolShareId)
    if (ids.length === 1) await route.fulfill({ status: 503, json: { code: 'native_unavailable', error: 'Temporarily unavailable. Retry safely.' } })
    else await route.fulfill({ json: { matchId: 'match-fixture', token: 'private-fixture', status: 'waiting', allowMismatch: false } })
  })
  await page.route('**/api/play/native/invitations/private-fixture', route => route.fulfill({ json: { matchId: 'match-fixture', status: 'waiting', seat: 0, allowMismatch: false, setCode: 'SOR', poolType: 'draft', packCount: 3 } }))
  await page.goto('/play/native?pool=pool-fixture')
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporarily unavailable')
  await expect(page.getByRole('radio')).toBeChecked()
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for your friend' })).toBeVisible()
  await expect(page.getByLabel('Invite link', { exact: true })).toHaveValue(/\/play\/native\?invite=private-fixture$/)
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
})

test('join eligibility error remains visible after invitation polling', async ({ page }) => {
  await signedIn(page)
  let reads = 0
  await page.route('**/api/play/native/invitations/private-fixture', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 409, json: { code: 'unverified_source', error: 'A completed server draft is required.' } })
    else { reads++; await route.fulfill({ json: { matchId: 'match-fixture', status: 'waiting', seat: null, allowMismatch: true, setCode: 'SOR', poolType: 'draft', packCount: 3 } }) }
  })
  await page.goto('/play/native?invite=private-fixture&pool=pool-fixture')
  await page.getByRole('button', { name: 'Join and play', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A completed server draft is required.')
  const priorReads = reads
  await expect.poll(() => reads).toBeGreaterThan(priorReads)
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A completed server draft is required.')
  await expect(page.getByRole('radio')).toBeChecked()
})

test('rematch waits for both people and opens without an extra confirmation', async ({ page }) => {
  await signedIn(page)
  let accepted = false
  let otherAccepted = false
  let launches = 0
  await page.route('**/api/play/native/matches/finished-fixture', route => route.fulfill({ json: { matchId: 'finished-fixture', status: 'complete', seat: 1, result: 'player2' } }))
  await page.route('**/api/play/native/matches/finished-fixture/rematch', async route => {
    if (route.request().method() === 'POST') { expect(route.request().postDataJSON()).toEqual({ accept: true }); accepted = true }
    await route.fulfill({ json: { status: accepted && otherAccepted ? 'ready' : 'waiting', accepted: [otherAccepted, accepted], matchId: accepted && otherAccepted ? 'rematch-fixture' : null } })
  })
  await page.route('**/api/play/native/matches/rematch-fixture/launch', async route => { launches++; await route.fulfill({ json: { launchUrl: `${new URL(page.url()).origin}/native-test-launched` } }) })
  await page.route('**/native-test-launched', route => route.fulfill({ contentType: 'text/html', body: '<h1>Test launch accepted</h1>' }))
  await page.goto('/play/native?match=finished-fixture')
  await expect(page.getByRole('heading', { name: 'You won', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rematch', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rematch requested' })).toBeDisabled()
  expect(launches).toBe(0)
  otherAccepted = true
  await expect(page.getByRole('heading', { name: 'Test launch accepted' })).toBeVisible()
  expect(launches).toBe(1)
})

test('a completed original invitation displays the authoritative result', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/play/native/invitations/completed-invite', route => route.fulfill({ json: { matchId:'completed-match',status:'complete',seat:0,allowMismatch:false } }))
  await page.route('**/api/play/native/matches/completed-match', route => route.fulfill({ json: { matchId:'completed-match',status:'complete',seat:0,result:'player1' } }))
  await page.route('**/api/play/native/matches/completed-match/rematch', route => route.fulfill({ json: { status:'waiting',accepted:[false,false],matchId:null } }))
  await page.goto('/play/native?invite=completed-invite')
  await expect(page.getByRole('heading',{name:'You won',exact:true})).toBeVisible()
  await expect(page.getByText('Result pending',{exact:true})).toHaveCount(0)
})
