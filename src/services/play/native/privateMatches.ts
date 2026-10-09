import { lockPlayAdmission } from './admission'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { withTransaction, type TxClient } from '../../../../lib/db'
import { PtpPlayError } from '../playState'
import type { NativeDeckVersion } from '../deckVersions'
import { freezeSavedDeck, loadSupport } from './savedDeck'
import { nativeConfig, createRuntime, runtimeStatus, issueLaunch, terminalOutcome, verifyRuntimeRevision } from './runtimeClient'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const tokenFor = (id: string, key: string) => `${id}.${createHmac('sha256', key).update(id).digest('hex')}`
const parseSnapshot = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value) as NativeDeckVersion
export async function playerLock(tx: TxClient, userId: string) {
  await lockPlayAdmission(tx, userId)
  // One statement sees either the queued opponent or its committed legacy game;
  // separate reads could miss the transition between those two records.
  const existing = await tx.queryRow(`SELECT 1 AS active FROM ptp_play_matches
    WHERE (player1_user_id=$1 OR player2_user_id=$1) AND status IN ('matched','launch_ready','in_progress')
    UNION ALL SELECT 1 FROM ptp_play_queue_entries WHERE user_id=$1 AND status='queued' AND expires_at > NOW()
    UNION ALL SELECT 1 FROM open_games WHERE (player1_id=$1 OR player2_id=$1) AND status IN ('open','accepted','lobby_ready','in_progress') LIMIT 1`, [userId])
  if (existing) throw new PtpPlayError(409, 'already_playing', 'Finish your existing game or leave its queue before starting a private game.')
}
async function member(tx: TxClient, matchId: string, userId: string) {
  const row = await tx.queryRow('SELECT m.*, s.seat FROM ptp_native_matches m JOIN ptp_native_match_seats s ON s.match_id=m.id WHERE m.id=$1 AND s.user_id=$2 FOR UPDATE OF m', [matchId, userId])
  if (!row) throw new PtpPlayError(404, 'match_not_found', 'Match not found.')
  return row
}
export async function createInvitation(userId: string, poolShareId: string, requestId: string, allowMismatch: boolean) {
  const config = nativeConfig()
  return withTransaction(async tx => {
    await playerLock(tx, userId)
    let match = await tx.queryRow('SELECT * FROM ptp_native_matches WHERE creator_user_id=$1 AND request_id=$2', [userId, requestId])
    if (match && match.visibility !== 'private') throw new PtpPlayError(409, 'request_conflict', 'This request was already used for a public table.')
    if (!match) {
      const active = await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL', [userId])
      if (active) throw new PtpPlayError(409, 'already_playing', 'Resume or cancel your existing private game first.')
      const recent = await tx.queryRow("SELECT COUNT(*)::int AS count FROM ptp_native_matches WHERE creator_user_id=$1 AND created_at > NOW()-INTERVAL '1 minute'", [userId])
      if (Number(recent?.count) >= 6) throw new PtpPlayError(429, 'rate_limited', 'Please wait before creating another invitation.')
      const deck = await freezeSavedDeck(tx, userId, poolShareId, config.supportPath)
      const id = randomUUID()
      const token = tokenFor(id, config.inviteKey)
      match = await tx.queryRow('INSERT INTO ptp_native_matches (id,creator_user_id,request_id,invite_hash,allow_mismatch) VALUES ($1,$2,$3,$4,$5) RETURNING *', [id, userId, requestId, hash(token), allowMismatch])
      await tx.query('INSERT INTO ptp_native_match_seats (match_id,seat,user_id,deck_version_id) VALUES ($1,0,$2,$3)', [id, userId, deck.id])
    }
    if (!match) throw new Error('Invitation persistence failed')
    return { matchId: String(match.id), token: tokenFor(String(match.id), config.inviteKey), status: match.status, allowMismatch: match.allow_mismatch }
  })
}
export async function invitation(token: string, userId: string, poolShareId?: string, cancel = false) {
  const config = nativeConfig(process.env, true)
  return withTransaction(async tx => {
    if (poolShareId) await playerLock(tx, userId)
    const match = await tx.queryRow("SELECT * FROM ptp_native_matches WHERE invite_hash=$1 AND visibility='private' FOR UPDATE", [hash(token)])
    if (!match) throw new PtpPlayError(404, 'invitation_not_found', 'Invitation not found.')
    const own = await tx.queryRow('SELECT seat FROM ptp_native_match_seats WHERE match_id=$1 AND user_id=$2', [match.id, userId])
    if (cancel) {
      if (match.creator_user_id !== userId || match.status !== 'waiting') throw new PtpPlayError(409, 'cannot_cancel', 'Only the creator can cancel a waiting invitation.')
      await tx.query("UPDATE ptp_native_matches SET status='cancelled' WHERE id=$1", [match.id])
      await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1', [match.id])
      return { matchId: match.id, status: 'cancelled' }
    }
    if (poolShareId && !own) {
      nativeConfig() // New admission remains disabled while existing invitations can be read/cancelled.
      if (match.status !== 'waiting') throw new PtpPlayError(409, 'invitation_unavailable', 'This invitation is no longer available.')
      const active = await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL', [userId])
      if (active) throw new PtpPlayError(409, 'already_playing', 'Finish or cancel your existing private game first.')
      const deck = await freezeSavedDeck(tx, userId, poolShareId, config.supportPath)
      const host = await tx.queryRow('SELECT v.snapshot FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 AND s.seat=0', [match.id])
      const first = parseSnapshot(host?.snapshot)
      if (!match.allow_mismatch && (first.setCode !== deck.snapshot.setCode || first.poolType !== deck.snapshot.poolType || first.packCount !== deck.snapshot.packCount)) throw new PtpPlayError(409, 'format_mismatch', 'Choose a deck with the same set, format and pack count.')
      await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,1,$2,$3)', [match.id, userId, deck.id])
      await tx.query("UPDATE ptp_native_matches SET status='starting' WHERE id=$1", [match.id])
      return { matchId: match.id, status: 'starting', seat: 1, allowMismatch: match.allow_mismatch }
    }
    // Only public format compatibility, never opponent card identities.
    const hostDeck = await tx.queryRow('SELECT v.snapshot FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 AND s.seat=0', [match.id])
    const metadata = parseSnapshot(hostDeck?.snapshot)
    return { matchId: match.id, status: match.status, seat: own?.seat ?? null, allowMismatch: match.allow_mismatch, setCode: metadata.setCode, poolType: metadata.poolType, packCount: metadata.packCount }
  })
}
export async function launchMatch(matchId: string, userId: string, sessionExpiresAt: number, options?: Parameters<typeof issueLaunch>[5]) {
  const config = nativeConfig(process.env, true)
  const ready = await withTransaction(async tx => {
    const match = await member(tx, matchId, userId)
    if (!['starting', 'active'].includes(String(match.status))) throw new PtpPlayError(409, 'match_not_ready', 'Both players must join before launching.')
    const rows = await tx.queryRows('SELECT v.snapshot FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 ORDER BY s.seat', [matchId])
    if (rows.length !== 2) throw new Error('Incomplete match seats')
    return { seat: Number(match.seat), status: String(match.status), engineRevision: match.engine_revision, decks: rows.map(r => parseSnapshot(r.snapshot)) }
  })
  // An already-created runtime retains the policy/decks it launched with. A
  // support-manifest update must not lock its players out of a healthy game.
  let status: Awaited<ReturnType<typeof runtimeStatus>> | undefined
  try { status = await runtimeStatus(config, matchId) }
  catch (error) {
    if (!(error instanceof PtpPlayError && error.code === 'runtime_not_found' && ready.status === 'starting')) throw error
  }
  if (!status) {
    const support = await loadSupport(config.supportPath)
    if (ready.decks.some(deck => deck.validationVersion !== support.policy.version)) throw new PtpPlayError(409, 'support_version_changed', 'This reserved deck uses a different reviewed engine version.')
    await verifyRuntimeRevision(config, support.engineRevision)
    try { await createRuntime(config, matchId, ready.decks) }
    catch (error) {
      // Only a definitive rejection proves that this create did not happen.
      // Timeouts, conflicts and unavailable services retain both reservations.
      if (error instanceof PtpPlayError && error.code === 'runtime_rejected') {
        await withTransaction(async tx => {
          const current = await member(tx, matchId, userId)
          if (current.status !== 'starting') return
          await tx.query("UPDATE ptp_native_matches SET status='cancelled' WHERE id=$1", [matchId])
          await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1', [matchId])
        })
      }
      throw error
    }
    status = await runtimeStatus(config, matchId)
  }
  // A recovered starting match may have been created before the host saved its
  // revision. Its frozen policy embeds that revision as the leading component.
  if ((ready.engineRevision && ready.engineRevision !== status.engineRevision)
    || ready.decks.some(deck => !deck.validationVersion.startsWith(`${status.engineRevision}:`))) throw new Error('Runtime revision mismatch')
  await withTransaction(async tx => {
    const current = await member(tx, matchId, userId)
    if (!['starting','active','complete'].includes(String(current.status))) throw new PtpPlayError(409,'match_not_ready','This match is no longer available.')
    await tx.query("UPDATE ptp_native_matches SET status='active',engine_revision=$2 WHERE id=$1 AND status='starting'", [matchId, status!.engineRevision])
  })
  if (status.status === 'complete') return getMatch(matchId, userId)
  return issueLaunch(config, matchId, userId, ready.seat, sessionExpiresAt, options)
}
export async function getMatch(matchId: string, userId: string) {
  const config = nativeConfig(process.env, true)
  const existing = await withTransaction(tx => member(tx, matchId, userId))
  if (!['starting', 'active'].includes(String(existing.status))) return { matchId, visibility: existing.visibility, status: existing.status, seat: existing.seat, result: existing.result }
  let status
  try { status = await runtimeStatus(config, matchId) }
  catch (error) {
    if (existing.status === 'starting' && error instanceof PtpPlayError && error.code === 'runtime_not_found') return { matchId,visibility:existing.visibility,status:'starting',seat:existing.seat,result:null }
    throw error
  }
  const result = terminalOutcome(status)
  if (result) await withTransaction(async tx => {
    const current = await member(tx, matchId, userId)
    if (current.status === 'complete') return
    if (current.engine_revision && current.engine_revision !== status.engineRevision) throw new Error('Runtime revision mismatch')
    await tx.query("UPDATE ptp_native_matches SET status='complete',result=$2,terminal_step=$3,completed_at=NOW(),engine_revision=$4 WHERE id=$1", [matchId, result, status.step, status.engineRevision])
    await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1', [matchId])
  })
  return { matchId, visibility: existing.visibility, status: result ? 'complete' : 'active', seat: existing.seat, result }
}

export async function listNativeMatches(userId: string) {
  const config = nativeConfig(process.env, true)
  return withTransaction(async tx => {
    const rows = await tx.queryRows(`SELECT m.id,m.status,m.visibility,m.creator_user_id,m.result,m.allow_mismatch,s.seat,v.snapshot
      FROM ptp_native_matches m JOIN ptp_native_match_seats s ON s.match_id=m.id
      JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.user_id=$1
      ORDER BY m.created_at DESC LIMIT 20`, [userId])
    return { matches: rows.map(row => {
      const deck = parseSnapshot(row.snapshot)
      return { matchId: row.id,status: row.status,visibility: row.visibility,seat: row.seat,result: row.result,allowMismatch: row.allow_mismatch,
        poolShareId: deck.poolShareId,setCode: deck.setCode,poolType: deck.poolType,packCount: deck.packCount,
        token: row.visibility === 'private' && row.creator_user_id === userId && row.status === 'waiting' ? tokenFor(String(row.id),config.inviteKey) : null }
    }) }
  })
}
