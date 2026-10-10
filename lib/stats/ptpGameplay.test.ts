import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gameOutcome, snapshotState } from './ptpGameplay'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('gameOutcome reads the result from the viewer seat', () => {
  assert.equal(gameOutcome({ seat: 0, result: 'player1' }), 'win')
  assert.equal(gameOutcome({ seat: 0, result: 'player2' }), 'loss')
  assert.equal(gameOutcome({ seat: 1, result: 'player2' }), 'win')
  assert.equal(gameOutcome({ seat: 1, result: 'player1' }), 'loss')
  assert.equal(gameOutcome({ seat: 0, result: 'draw' }), 'draw')
  assert.equal(gameOutcome({ seat: 1, result: 'draw' }), 'draw')
})

test('snapshotState resolves frozen leader and base ids to normal card art', () => {
  const state = snapshotState({ poolId: 'p', poolShareId: 's', setCode: 'SOR', poolType: 'sealed', leader: 'SOR_005', base: 'SOR_020', deck: [] })
  assert.equal(state.activeLeader, 'leader')
  assert.equal(state.activeBase, 'base')
  assert.equal(state.cardPositions.leader.card?.set, 'SOR')
  assert.equal(Number(state.cardPositions.leader.card?.number), 5)
  assert.equal(state.cardPositions.leader.card?.variantType, 'Normal')
  assert.equal(Number(state.cardPositions.base.card?.number), 20)
})

test('snapshotState leaves unknown cards empty instead of guessing', () => {
  const state = snapshotState({ poolId: 'p', poolShareId: 's', setCode: 'SOR', poolType: 'sealed', leader: 'ZZZ_999', base: 'ZZZ_998', deck: [] })
  assert.equal(state.cardPositions.leader.card, undefined)
  assert.equal(state.cardPositions.base.card, undefined)
})

test('native games in Your Stats stay behind alpha access', () => {
  const route = readFileSync(join(root, 'app/api/stats/me/gameplay/route.ts'), 'utf8')
  assert.match(route, /const alpha = await requireAlphaAccess\(request\)/)
  assert.match(route, /: \['karabast'\]/)
  const replay = readFileSync(join(root, 'app/api/stats/me/gameplay/replays/[gameId]/route.ts'), 'utf8')
  assert.match(replay, /requireAlphaAccess\(request\)/)
  const dashboard = readFileSync(join(root, 'src/components/YourStats/GameplayDashboard.tsx'), 'utf8')
  assert.match(dashboard, /const nativePlay = user\?\.is_alpha_tester === true \|\| user\?\.is_admin === true/)
  assert.match(dashboard, /const filters = nativePlay \?/)
})
