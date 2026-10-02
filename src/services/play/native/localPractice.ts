import { createHmac } from 'node:crypto'
import { withTransaction } from '../../../../lib/db'
import type { NativeDeckVersion } from '../deckVersions'
import { PtpPlayError } from '../playState'
import { loadSupport } from './savedDeck'
import { nativeConfig, runtimeStatus, createRuntime, verifyRuntimeRevision, issueLaunch } from './runtimeClient'
import { lockPlayAdmission } from './admission'

export function localPracticeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'development' || env.PTP_NATIVE_LOCAL_TESTING !== 'true') return false
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.PTP_PUBLIC_ORIGIN ?? '').hostname) } catch { return false }
}

/** Local testing accepts older saved builds without claiming verified pool provenance. */
export function practiceDeck(saved: unknown, support: Awaited<ReturnType<typeof loadSupport>>): Pick<NativeDeckVersion, 'leader' | 'base' | 'deck'> {
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  let parsed = saved
  try { if (typeof saved === 'string') parsed = JSON.parse(saved) } catch { throw new PtpPlayError(409, 'invalid_saved_deck', 'Save your deck before testing.') }
  const state = object(parsed), positions = object(state.cardPositions)
  const card = (value: unknown) => {
    const id = object(object(value).card).id
    const found = typeof id === 'string' ? support.catalog.get(id) : undefined
    if (!found || !support.policy.supportedCardIds.has(found.engineId)) throw new PtpPlayError(409, 'unsupported_card', 'A selected card is not supported by this engine.')
    return found
  }
  const selected = (key: unknown, type: 'Leader' | 'Base') => {
    const position = typeof key === 'string' ? object(positions[key]) : {}
    const found = card(position)
    if (position.enabled === false || found.type !== type) throw new PtpPlayError(409, 'invalid_selection', `Choose a ${type.toLowerCase()} before testing.`)
    return found.engineId
  }
  const leader = selected(state.activeLeader, 'Leader'), base = selected(state.activeBase, 'Base')
  const counts = new Map<string, number>()
  let total = 0
  for (const raw of Object.values(positions)) {
    const position = object(raw)
    if (position.section !== 'deck' || position.enabled === false) continue
    const found = card(position)
    if (!['Unit', 'Event', 'Upgrade'].includes(found.type)) throw new PtpPlayError(409, 'invalid_card_type', 'Only units, events and upgrades belong in the main deck.')
    counts.set(found.engineId, (counts.get(found.engineId) ?? 0) + 1); total++
  }
  const minimum = base === 'JTL_024' ? 40 : base === 'JTL_025' ? 25 : 30
  if (total < minimum || total > 100) throw new PtpPlayError(409, 'invalid_deck_size', `Use ${minimum}–100 main-deck cards for testing.`)
  return { leader, base, deck: [...counts].map(([id, count]) => ({id, count})) }
}

/** A private, owner-bound engine game. Never enters matchmaking or competitive results. */
export async function launchLocalPractice(userId: string, poolShareId: string, requestId: string, seat: number, expiresAt: number, opponent: 'human' | 'ai' = 'human') {
  if (!localPracticeEnabled()) throw new PtpPlayError(404, 'not_found', 'Local testing is not enabled.')
  if (seat !== 0 && seat !== 1) throw new PtpPlayError(400, 'invalid_seat', 'Choose player 1 or player 2.')
  if (opponent === 'ai' && seat !== 0) throw new PtpPlayError(403, 'ai_seat', 'The AI controls player 2.')
  const config = nativeConfig()
  // Stable across retries and both windows, but another account cannot address this game.
  const matchId = localPracticeMatchId(userId,requestId,opponent)
  await withTransaction(async tx => {
    await lockPlayAdmission(tx, userId)
    try { await runtimeStatus(config, matchId); return }
    catch (error) { if (!(error instanceof PtpPlayError && error.code === 'runtime_not_found')) throw error }
    const support = await loadSupport(config.supportPath)
    const pool = await tx.queryRow('SELECT deck_builder_state FROM card_pools WHERE user_id=$1 AND share_id=$2', [userId, poolShareId])
    if (!pool) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
    const deck = practiceDeck(pool.deck_builder_state, support)
    await verifyRuntimeRevision(config, support.engineRevision)
    await createRuntime(config, matchId, [deck, deck], opponent === 'ai' ? [null, 'wip-search-v1'] : undefined)
  })
  const returnPath = `/play/test?pool=${encodeURIComponent(poolShareId)}&request=${encodeURIComponent(requestId)}${opponent === 'ai' ? '&opponent=ai' : ''}`
  return issueLaunch(config, matchId, userId, seat, expiresAt, { isolated: true, returnPath })
}

export function localPracticeMatchId(userId:string,requestId:string,opponent:'human'|'ai'='human') {
  const config=nativeConfig()
  const hex = createHmac('sha256', config.inviteKey).update(`${opponent === 'ai' ? 'local-ai-practice' : 'local-practice'}:${userId}:${requestId}`).digest('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`
}
