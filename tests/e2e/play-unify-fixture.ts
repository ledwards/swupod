import {type Page, type BrowserContext} from '@playwright/test'
import {readFileSync} from 'node:fs'
import jwt from 'jsonwebtoken'

// Signed-in alpha tester with every play API mocked; no database or engine needed.
const cards = JSON.parse(readFileSync('src/data/cards.json', 'utf8')).cards
const leaders = cards.filter((c: any) => c.set === 'SOR' && c.type === 'Leader' && c.variantType === 'Normal').slice(0, 4)
const user = {id: '00000000-0000-4000-8000-000000000001', discord_id: '1', email: null, username: 'Alpha tester', avatar_url: null, is_admin: false, is_alpha_tester: true, is_beta_tester: true, auth_version: 1}
// The dev server signs with the development fallback secret when JWT_SECRET is unset.
const token = jwt.sign(user, process.env.JWT_SECRET || 'change-me-in-production', {expiresIn: '1h'})
const decks = [
 {poolShareId: 'draft-fixture', name: 'Homeworlds draft', setCode: 'SOR', poolType: 'draft', packCount: 3, mainDeckCount: 30, ready: true, hasDeck: true, leaderName: leaders[0].name, leaderImageUrl: leaders[0].imageUrl, createdAt: new Date().toISOString()},
 {poolShareId: 'sealed-fixture', name: 'Sealed six', setCode: 'SOR', poolType: 'sealed', packCount: 6, mainDeckCount: 30, ready: true, hasDeck: true, leaderName: leaders[1].name, leaderImageUrl: leaders[1].imageUrl, createdAt: new Date().toISOString()},
 {poolShareId: 'sealed-unbuilt', name: 'Unbuilt sealed', setCode: 'SOR', poolType: 'sealed', packCount: 6, mainDeckCount: 0, ready: false, hasDeck: false, createdAt: new Date().toISOString()},
]
const contract = (format: string, limited = 'six', set = '') => ({format, limited, set, pool: 'current'})
const shared = {signedIn: true, enabled: true, ptpOrigin: '', playOrigin: '', sets: [{code: 'SOR', name: 'Spark of Rebellion'}], pools: [{id: 'current', name: 'Current'}],
 queues: [{key: 'p', contract: contract('premier'), label: 'Premier', waiting: 2}, {key: 's', contract: contract('limited', 'six', 'SOR'), label: 'SOR Sealed', waiting: 1}],
 pods: [{id: 'pod-fixture', name: 'Spark draft', set: 'SOR', players: 3, capacity: 8}], active: null, queue: null}

export async function alphaFixture(page: Page, context: BrowserContext, baseURL: string) {
 await context.addCookies([{name: 'swupod_session', value: token, url: baseURL}])
 await page.route('**/api/**', async route => {
  const url = new URL(route.request().url()), path = url.pathname, post = route.request().method() === 'POST'
  const json = (body: unknown) => route.fulfill({json: body})
  if (path === '/api/auth/session') return json({success: true, data: {user}})
  if (path === '/api/lobby') return json({enabled: true, user: {name: user.username}, activity: {activeGames: 0, queuedPlayers: 0}, capabilities: {queue: true, private: true, ai: true}, games: [], history: [], active: null, queue: null})
  if (path === '/api/lobby/shared' || path === '/api/play/native/shared') {
   if (!post) return json(shared)
   const body = route.request().postDataJSON() ?? {}
   if (body.action === 'decks') return json({decks: body.poolShareId && body.requestedOnly ? decks.filter(d => d.poolShareId === body.poolShareId) : decks})
   return json({})
  }
  if (path === '/api/lobby/decks/played') return json({decks: []})
  if (path === '/api/home/resumes') return json({resumes: []})
  if (path === '/api/entitlements') return json({beta: true, canCustomize: true})
  if (path === '/api/draft/history') return json({success: true, data: {pods: [
   {id: 'p1', shareId: 'pod-host', setCode: 'SOR', setName: 'Spark of Rebellion', status: 'waiting', isHost: true, currentPlayers: 3, maxPlayers: 8, createdAt: new Date().toISOString()},
  ]}})
  if (path === '/api/play/native/presentation') return json({enabled: true})
  return json({success: true, data: {}})
 })
 await page.routeWebSocket('**/socket.io/**', () => {})
}

