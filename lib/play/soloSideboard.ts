import { createHash } from 'node:crypto'
import { withTransaction, type TxClient } from '../db'
import { generateShareId } from '../utils'
import { getAllCards } from '../../src/utils/cardData'
import { PtpPlayError } from '../../src/services/play/playState'
import { loadSupport } from '../../src/services/play/native/savedDeck'
import { nativeConfig } from '../../src/services/play/native/runtimeClient'
import { practiceDeck } from '../../src/services/play/native/localPractice'
import { sideboardErrors, selectionFromDeck, type SideboardCard, type SideboardSelection, type SideboardData } from '../../src/services/play/solo/sideboard'
import type { SoloOpponentSnapshot } from '../../src/services/play/solo/savedOpponent'
import { advanceSolo, launchSoloGame, ownedRun, parsed } from './soloEvent'
import { reconcileSoloGames } from './soloRecords'

type Support = Awaited<ReturnType<typeof loadSupport>>
function fail(code: string, message: string): never { throw new PtpPlayError(409, code, message) }

export async function convertSoloToBo3(runId: string, userId: string) {
  await ownedRun(runId, userId)
  await reconcileSoloGames(runId)
  await withTransaction(async tx => {
    const run = await tx.queryRow('SELECT * FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2 FOR UPDATE', [runId,userId])
    if (!run) throw new PtpPlayError(404,'run_not_found','Practice game not found.')
    if (run.best_of_three) return
    if (!parsed(run.prepared)?.singleGame) fail('not_practice','This event already uses best of three.')
    const games = await tx.queryRows('SELECT id,result FROM ptp_solo_ai_games WHERE run_id=$1', [runId])
    if (games.length !== 1 || !games[0]?.result) fail('game_incomplete','Finish the first game before converting to best of three.')
    await tx.query('UPDATE ptp_solo_ai_runs SET best_of_three=true WHERE id=$1', [runId])
    await tx.query('UPDATE ptp_solo_ai_matches SET winner=NULL WHERE run_id=$1', [runId])
    await advanceSolo(tx,runId)
  })
  return {launchUrl: `/runs/${runId}/sideboard`}
}

async function sideboardContext(tx: TxClient, runId: string, userId: string) {
  const run = await tx.queryRow('SELECT * FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2 FOR UPDATE', [runId,userId])
  if (!run) throw new PtpPlayError(404,'run_not_found','Match not found.')
  const game = await tx.queryRow(`SELECT g.*,m.round FROM ptp_solo_ai_games g JOIN ptp_solo_ai_matches m ON m.id=g.match_id
    WHERE g.run_id=$1 AND m.player1='human' AND m.winner IS NULL AND g.result IS NULL ORDER BY m.round,g.game_no LIMIT 1`, [runId])
  if (!game) fail('no_next_game','There is no next game to sideboard for.')
  if (Number(game.game_no) === 1 && Number(game.round) === 1) fail('first_game','Start the first game from the match page.')
  const last = await tx.queryRow(`SELECT deck_snapshots FROM ptp_solo_ai_games g JOIN ptp_solo_ai_matches m ON m.id=g.match_id
    WHERE g.run_id=$1 AND m.player1='human' AND g.result IS NOT NULL ORDER BY m.round DESC,g.game_no DESC LIMIT 1`, [runId])
  const previous = (parsed(last?.deck_snapshots)?.[0] ?? parsed(run.prepared).human) as SoloOpponentSnapshot
  const current = (parsed(game.deck_snapshots)?.[0] ?? previous) as SoloOpponentSnapshot
  const root = await tx.queryRow('SELECT * FROM card_pools WHERE id=$1 AND user_id=$2 FOR UPDATE', [current.sourcePoolId,userId])
  if (!root || root.parent_pool_id) fail('source_missing','The original owned pool is unavailable.')
  const support = await loadSupport(nativeConfig(process.env,true).supportPath)
  const revision = parsed(run.prepared).engineRevision
  if (revision !== support.engineRevision && !support.compatibleRevisions.includes(revision)) fail('engine_revision_mismatch','This match requires its original engine revision.')
  let available = root
  if (current.provenance === 'server-sealed') {
    const evidence = await tx.queryRow('SELECT cards FROM ptp_native_pool_evidence WHERE source_pool_id=$1 AND owner_user_id=$2',[root.id,userId])
    if (!evidence) fail('source_missing','The original sealed pool is unavailable.')
    available = {...root,cards:evidence.cards}
  } else if (current.provenance === 'server-draft') {
    const picks = await tx.queryRow('SELECT drafted_cards,drafted_leaders FROM pod_players WHERE pod_id=$1 AND user_id=$2',[root.pod_id,userId])
    if (!picks || !Array.isArray(parsed(picks.drafted_cards)) || !Array.isArray(parsed(picks.drafted_leaders))) fail('source_missing','The original draft picks are unavailable.')
    available = {...root,cards:[...parsed(picks.drafted_leaders),...parsed(picks.drafted_cards)]}
  }
  return {run,game,current,root:available,support}
}

function poolCards(root: Record<string, any>, support: Support) {
  const originals = parsed(root.cards)
  if (!Array.isArray(originals)) fail('source_missing','The original pool cards are unavailable.')
  const canonical = new Map(getAllCards().map(c => [c.id,c]))
  const grouped = new Map<string, SideboardCard>()
  const add = (raw: {id: string}, freeBase = false) => {
    const mapped = support.catalog.get(raw.id), card = canonical.get(raw.id)
    if (!card) return
    if (card.type === 'Base' && card.rarity === 'Common' && card.set !== root.set_code) return
    const engineId = mapped?.engineId ?? card.id
    const found = grouped.get(engineId)
    if (found) { if (!freeBase) found.count++; return }
    grouped.set(engineId, {id:card.id,engineId,name:card.name,subtitle:card.subtitle??'',
      type:mapped?.type??card.type,imageUrl:card.imageUrl,cost:Number(card.cost)||0,count:1,supported:!!mapped&&support.policy.supportedCardIds.has(engineId)})
  }
  originals.forEach((c: {id: string}) => add(c))
  for (const card of canonical.values()) {
    const mapped = support.catalog.get(card.id)
    if (card.set === root.set_code && mapped?.type === 'Base' && mapped.rarity === 'Common' && support.policy.unrestrictedBaseIds.has(mapped.engineId)) add(card,true)
  }
  return [...grouped.values()].sort((a,b)=>(a.cost??0)-(b.cost??0)||a.name.localeCompare(b.name))
}

function selectionFromState(state: unknown, cards: SideboardCard[], support: Support): SideboardSelection {
  const saved = parsed(state), positions = saved?.cardPositions ?? {}
  const engineId = (key: string) => support.catalog.get(positions[key]?.card?.id)?.engineId ?? ''
  const counts = new Map<string,number>()
  for (const pos of Object.values(positions) as any[]) {
    if (pos.section !== 'deck' || pos.enabled === false || pos.visible === false) continue
    const id = support.catalog.get(pos.card?.id)?.engineId
    if (id) counts.set(id,(counts.get(id)??0)+1)
  }
  return selectionFromDeck({leader:engineId(saved?.activeLeader),base:engineId(saved?.activeBase),deck:[...counts].map(([id,count])=>({id,count}))},cards)
}

export async function getSoloSideboard(runId: string, userId: string): Promise<SideboardData> {
  return withTransaction(async tx => {
    const {game,current,root,support} = await sideboardContext(tx,runId,userId)
    const cards = poolCards(root,support)
    const builds = await tx.queryRows('SELECT share_id,name,deck_builder_state FROM card_pools WHERE user_id=$1 AND (id=$2 OR parent_pool_id=$2) ORDER BY created_at', [userId,root.id])
    return {locked:!!game.deck_snapshots,runId,gameId:String(game.id),gameNumber:Number(game.game_no),poolShareId:String(root.share_id),
      returnUrl: `/runs/${runId}`,
      cards,selection:selectionFromDeck(current,cards),builds:builds.map(b=>({shareId:String(b.share_id),name:String(b.name??'Saved build'),selection:selectionFromState(b.deck_builder_state,cards,support)}))}
  })
}

export async function saveSoloSideboard(runId: string, gameId: string, userId: string, input: unknown, buildShareId?: string) {
  return withTransaction(async tx => {
    const {game,current,root,support} = await sideboardContext(tx,runId,userId)
    if (game.id !== gameId) fail('stale_game','The match has moved on. Open sideboarding again.')
    // An uncertain launch retry must reuse the committed snapshot and build.
    if (game.deck_snapshots) return
    if (game.requested) fail('deck_locked','This game has already started.')
    const cards = poolCards(root,support)
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_deck','Choose a deck before continuing.')
    const selection = input as SideboardSelection
    if (typeof selection.leader !== 'string' || typeof selection.base !== 'string' || !selection.deck || typeof selection.deck !== 'object' || Array.isArray(selection.deck)) fail('invalid_deck','Invalid deck selection.')
    const errors = sideboardErrors(selection,cards)
    if (errors.length) fail('invalid_deck',errors.join(' '))
    let build = await tx.queryRow('SELECT * FROM card_pools WHERE share_id=$1 AND user_id=$2 FOR UPDATE', [buildShareId??current.poolShareId,userId])
    if (!build || String(build.parent_pool_id??build.id) !== current.sourcePoolId) fail('wrong_pool','Choose a saved build from this pool.')
    const existing = selectionFromState(build.deck_builder_state,cards,support)
    const changedIdentity = existing.leader !== selection.leader || existing.base !== selection.base
    const byId = new Map(getAllCards().map(c=>[c.id,c]))
    // Match the normal deckbuilder's sections, enabled flags and layout metadata.
    const positions: Record<string,{card:ReturnType<typeof getAllCards>[number]|undefined;section:string;enabled:boolean;visible:boolean;x:number;y:number;zIndex:number}> = {}
    for (const c of cards) {
      for (let i=0;i<c.count;i++) {
        const section = ['Leader','Base'].includes(c.type) ? 'leaders-bases' : i<(selection.deck[c.id]??0) ? 'deck' : 'sideboard'
        positions[`${c.id}:${i}`] = {card:byId.get(c.id),section,enabled:section!=='sideboard',visible:true,x:0,y:0,zIndex:1}
      }
    }
    let y = 80
    const sectionLabels: {text:string;y:number}[] = [], sectionBounds: Record<string,{minX:number;maxX:number;minY:number;maxY:number}> = {}
    for (const [section,label] of [['leaders-bases','Leaders & Bases'],['deck','Deck'],['sideboard','Sideboard']] as const) {
      const group = Object.values(positions).filter(p=>p.section===section)
      const width = section==='leaders-bases'?188:140, height = section==='leaders-bases'?140:188
      const columns = section==='leaders-bases'?5:6
      sectionLabels.push({text:label,y:y-35})
      group.forEach((p,i)=>{p.x=50+(i%columns)*width;p.y=y+Math.floor(i/columns)*height})
      const bottom = y+Math.max(1,Math.ceil(group.length/columns))*height
      sectionBounds[section] = {minX:50,maxX:1000,minY:y,maxY:bottom}
      y = bottom+60
    }
    const state = {...(parsed(build.deck_builder_state)??{}),cardPositions:positions,sectionLabels,sectionBounds,canvasHeight:y,
      deckCardIds:Object.keys(positions).filter(id=>positions[id]!.section==='deck'),
      sideboardCardIds:Object.keys(positions).filter(id=>positions[id]!.section==='sideboard'),
      activeLeader:`${selection.leader}:0`,activeBase:`${selection.base}:0`}
    if (changedIdentity) {
      const name = `${byId.get(selection.leader)?.name} / ${byId.get(selection.base)?.name}`
      state.poolName = name
      build = await tx.queryRow(`INSERT INTO card_pools(user_id,share_id,set_code,set_name,pool_type,name,cards,packs,deck_builder_state,is_public,hidden,parent_pool_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) RETURNING *`,
        [userId,generateShareId(8),root.set_code,root.set_name,root.pool_type,name,JSON.stringify(parsed(root.cards)),JSON.stringify(parsed(root.packs)),JSON.stringify(state),root.is_public,root.id])
      if (!build) throw Error('Build was not saved')
    } else await tx.query('UPDATE card_pools SET deck_builder_state=$2,updated_at=NOW() WHERE id=$1', [build.id,JSON.stringify(state)])
    const {contentHash: _oldHash,...old} = current
    const snapshot = {...old,poolId:String(build.id),poolShareId:String(build.share_id),...practiceDeck(state,support)}
    const human = {...snapshot,contentHash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}
    const opponent = await tx.queryRow(`SELECT p.deck FROM ptp_solo_ai_matches m JOIN ptp_solo_ai_participants p ON p.run_id=m.run_id AND p.id=m.player2 WHERE m.id=$1`,[game.match_id])
    if (!opponent) throw Error('Opponent deck unavailable')
    await tx.query('UPDATE ptp_solo_ai_games SET deck_snapshots=$2 WHERE id=$1',[gameId,JSON.stringify([human,parsed(opponent.deck)])])
  })
}

export async function continueSoloSideboard(runId: string, gameId: string, userId: string, expiresAt: number, input: unknown, buildShareId?: string) {
  await saveSoloSideboard(runId,gameId,userId,input,buildShareId)
  return launchSoloGame(runId,userId,expiresAt,gameId)
}
