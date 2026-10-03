import {initializeSoloEvent,launchSoloGame} from './soloEvent'
import {randomUUID} from 'node:crypto'
import {withTransaction} from '../db'
import {PtpPlayError} from '../../src/services/play/playState'
import {validateSavedDeck,loadSupport} from '../../src/services/play/native/savedDeck'
import {lockPlayAdmission} from '../../src/services/play/native/admission'
import {nativeConfig} from '../../src/services/play/native/runtimeClient'
import {localPracticeEnabled} from '../../src/services/play/native/localPractice'
import {prepareSoloGeneration} from '../../src/services/sealed/soloGeneration'
import {AI_POLICY,chooseDraftOpponent,buildSoloOpponent,type BotPool,type PreparedSolo} from '../../src/services/play/solo/opponent'
import {BOT_DECK_BUILDER_VERSION} from '../../src/utils/botDeckConstruction'
import type {NativeDeckVersion} from '../../src/services/play/deckVersions'
const parse=(value:unknown):any=>typeof value==='string'?JSON.parse(value):value

/** Preparation is durable before deck construction. Retries cannot reroll a pool. */
export async function launchSoloAi(userId:string,poolShareId:string,requestId:string,expiresAt:number,entitlement:{is_admin?:boolean;is_beta_tester?:boolean}) {
  // Initial rollout is local only. Remove this gate only after the launch checklist.
  if(!localPracticeEnabled())throw new PtpPlayError(503,'solo_not_enabled','Solo AI is not enabled in this environment yet.')
  const config=nativeConfig(),support=await loadSupport(config.supportPath)
  const run=await withTransaction(async tx=>{
    await lockPlayAdmission(tx,userId)
    const existing=await tx.queryRow('SELECT * FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND request_id=$2',[userId,requestId])
    if(existing){
      if(existing.pool_share_id!==poolShareId)throw new PtpPlayError(409,'request_reused','This request belongs to another deck.')
      return existing
    }
    const rate=await tx.queryRow("SELECT COUNT(*)::int AS count FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'",[userId])
    if(Number(rate?.count)>=3)throw new PtpPlayError(429,'solo_rate_limit','Please wait before preparing another opponent.')
    const saved=await validateSavedDeck(tx,userId,poolShareId,config.supportPath,true,support,true)
    const source=await tx.queryRow('SELECT * FROM card_pools WHERE id=$1',[saved.sourcePoolId])
    if(!source)throw new PtpPlayError(404,'source_missing','The original pool is unavailable.')
    const id=randomUUID()
    let bot:BotPool
    let bots:BotPool[]|undefined
    let humanSeat=1
    if(saved.snapshot.poolType==='draft'){
      const pod=await tx.queryRow('SELECT * FROM pods WHERE id=$1',[source.pod_id])
      if(parse(pod?.settings)?.isSolo!==true)throw new PtpPlayError(409,'not_solo','Play vs AI requires a solo draft.')
      const rows=await tx.queryRows('SELECT p.*,u.username FROM pod_players p LEFT JOIN users u ON u.id=p.user_id WHERE p.pod_id=$1 ORDER BY p.seat_number',[source.pod_id])
      const human=rows.find(r=>r.user_id===userId&&r.is_bot!==true)
      if(!human)throw new PtpPlayError(403,'not_solo_player','You are not the human player in this draft.')
      const seat=chooseDraftOpponent(rows,Number(human.seat_number))
      humanSeat=Number(human.seat_number)
      bots=rows.filter(r=>r.is_bot===true).map(r=>{
        const leaders=parse(r.drafted_leaders),cards=parse(r.drafted_cards)
        if(!Array.isArray(leaders)||!leaders.length||!Array.isArray(cards)||cards.length<30)throw new PtpPlayError(409,'missing_bot_picks','A draft bot’s original picks are unavailable.')
        return {kind:'draft-seat' as const,participantId:String(r.id),name:String(r.username??'Draft opponent'),seat:Number(r.seat_number),cards:[...leaders,...cards],strategyName:String(r.strategy_name??'allPlayer'),mixinName:String(r.mixin_name??'highConviction'),committedLeader:parse(r.committed_leader),committedBaseColor:r.committed_base_color}
      })
      const leaders=parse(seat.drafted_leaders),cards=parse(seat.drafted_cards)
      if(!Array.isArray(leaders)||!leaders.length||!Array.isArray(cards)||cards.length<30)throw new PtpPlayError(409,'missing_bot_picks','The draft opponent’s original picks are unavailable.')
      bot={kind:'draft-seat',participantId:String(seat.id),name:String(seat.username??'Draft opponent'),seat:Number(seat.seat_number),cards:[...leaders,...cards],
        strategyName:String(seat.strategy_name??'allPlayer'),mixinName:String(seat.mixin_name??'highConviction'),committedLeader:parse(seat.committed_leader),committedBaseColor:seat.committed_base_color}
    }else{
      if(source.pod_id)throw new PtpPlayError(409,'not_solo','Play vs AI requires solo sealed.')
      // A separate server-generated box, persisted under this run's unique key.
      const generated=await prepareSoloGeneration(tx,userId,{requestId:id,setCode:saved.snapshot.setCode,packCount:saved.snapshot.packCount},entitlement)
      bot={kind:'sealed-pool',participantId:generated.generationId,name:'Sealed opponent',cards:generated.cards as BotPool['cards'],strategyName:'allPlayer',mixinName:'highConviction'}
    }
    const prepared:PreparedSolo={human:saved.snapshot,bot,...(bots?{bots,humanSeat}:{}),engineRevision:support.engineRevision,builderVersion:BOT_DECK_BUILDER_VERSION,aiPolicy:AI_POLICY}
    const row=await tx.queryRow('INSERT INTO ptp_solo_ai_runs(id,owner_user_id,request_id,pool_share_id,prepared) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,userId,requestId,poolShareId,JSON.stringify(prepared)])
    if(!row)throw Error('Solo preparation was not saved')
    return row
  })
  const prepared=parse(run.prepared) as PreparedSolo
  if(prepared.engineRevision!==support.engineRevision)throw new PtpPlayError(409,'engine_revision_mismatch','This run requires its original engine revision.')
  // Serialize construction; a crash leaves the saved pool intact for another try.
  const opponent=await withTransaction(async tx=>{
    const row=await tx.queryRow('SELECT opponent_deck FROM ptp_solo_ai_runs WHERE id=$1 FOR UPDATE',[run.id])
    if(row?.opponent_deck)return parse(row.opponent_deck) as NativeDeckVersion
    const deck=buildSoloOpponent(String(run.id),prepared,support)
    await tx.query('UPDATE ptp_solo_ai_runs SET opponent_deck=$2 WHERE id=$1',[run.id,JSON.stringify(deck)])
    return deck
  })
  await initializeSoloEvent(run,prepared,opponent,support)
  return launchSoloGame(String(run.id),userId,expiresAt)
}
