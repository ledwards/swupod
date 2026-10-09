import {queryRows, withTransaction} from '../../../../lib/db'
import {PtpPlayError} from '../playState'
import {claimPracticeMatchGameInTransaction, recordPracticeMatchGameResultInTransaction, PracticeGameClaimError} from '../../matchmaking/liveGames'
import {freezeSavedDeck} from './savedDeck'
import {nativeConfig} from './runtimeClient'
import {getMatch, launchMatch, playerLock} from './privateMatches'
import {broadcastDraftState} from '../../../lib/socketBroadcast'

/** Native and Swiss game IDs are identical: results and retries stay attached to
 * the official game slot rather than creating an unrelated exhibition match. */
export async function syncCompetitiveGames(shareId: string, userId: string) {
  const games = await queryRows(`SELECT g.id,g.pod_id,g.game_number,v.snapshot
    FROM practice_match_games g JOIN pods p ON p.id=g.pod_id
    JOIN ptp_native_matches n ON n.id=g.id
    JOIN ptp_native_match_seats s ON s.match_id=n.id AND s.seat=0
    JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id
    JOIN practice_matches m ON m.id=g.match_id
    WHERE p.share_id=$1 AND $2 IN (m.player1_id,m.player2_id)
      AND g.status NOT IN ('complete','failed','voided')`, [shareId,userId])
  let changed=false
  for(const game of games) {
    const state=await getMatch(String(game.id),userId)
    if(state.status!=='complete'||!state.result)continue
    const snapshot=typeof game.snapshot==='string'?JSON.parse(game.snapshot):game.snapshot
    const result=await withTransaction(async tx=>{
      // Both players may return simultaneously. Serialize before resolving the
      // next game slot so a duplicate cannot be attributed to game two.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))',[game.pod_id])
      const current=await tx.queryRow('SELECT status FROM practice_match_games WHERE id=$1 FOR UPDATE',[game.id])
      if(!current || ['complete','failed','voided'].includes(String(current.status)))return {changed:false}
      return recordPracticeMatchGameResultInTransaction(tx,{poolShareId:snapshot.poolShareId,
        practiceMatchGameId:String(game.id),gameNumber:Number(game.game_number),
        wayfinderMatchId:`purrgil:${game.id}`,format:'Limited',
        result:state.result==='draw'?'draw':state.result==='player1'?'win':'loss'})
    })
    changed ||= result.changed
  }
  if(changed)await broadcastDraftState(shareId)
  return {changed}
}

export async function launchCompetitiveGame(shareId:string, matchId:string, userId:string, expiresAt:number) {
  const config=nativeConfig()
  await syncCompetitiveGames(shareId,userId)
  const reserved=await withTransaction(async tx=>{
    // Take user admission locks in stable order before reserving the Swiss slot.
    const pair=await tx.queryRow(`SELECT m.* FROM practice_matches m JOIN pods p ON p.id=m.pod_id
      WHERE m.id=$1 AND p.share_id=$2 AND $3 IN (m.player1_id,m.player2_id)`,[matchId,shareId,userId])
    if(!pair)throw new PtpPlayError(404,'match_not_found','Match not found.')
    for(const id of [pair.player1_id,pair.player2_id].filter(Boolean).map(String).sort())await playerLock(tx,id)
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))',[pair.pod_id])
    let claim
    try {claim=await claimPracticeMatchGameInTransaction(tx,{shareId,matchId,userId,provider:'purrgil'})}
    catch(error){if(error instanceof PracticeGameClaimError)throw new PtpPlayError(error.status,error.code,error.message);throw error}
    const id=claim.practiceMatchGameId
    if(!id||claim.action==='already_complete'||claim.action==='manual_only')throw new PtpPlayError(409,'match_not_ready','This match has no playable game.')
    const existing=await tx.queryRow('SELECT id,status FROM ptp_native_matches WHERE id=$1',[id])
    if(existing?.status==='cancelled')throw new PtpPlayError(409,'match_cancelled','This game was cancelled.')
    if(!existing){
      const game=await tx.queryRow('SELECT * FROM practice_match_games WHERE id=$1',[id])
      if(game?.lobby_id||game?.lobby_url||game?.wayfinder_game_id)throw new PtpPlayError(409,'external_game','This game already started on Karabast.')
      const decks=[]
      for(const owner of [String(pair.player1_id),String(pair.player2_id)]){
        const active=await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL',[owner])
        if(active)throw new PtpPlayError(409,'already_playing','A player already has a game in progress. Finish that game before starting this match.')
        const pool=await tx.queryRow(`SELECT cp.share_id FROM card_pools cp JOIN built_decks b ON b.card_pool_id=cp.id
          WHERE cp.pod_id=$1 AND cp.user_id=$2 AND cp.parent_pool_id IS NULL ORDER BY b.built_at DESC LIMIT 1`,[pair.pod_id,owner])
        if(!pool)throw new PtpPlayError(409,'deck_not_ready','Both players must build their decks first.')
        decks.push(await freezeSavedDeck(tx,owner,String(pool.share_id),config.supportPath))
      }
      await tx.query(`INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,status)
        VALUES($1,$2,$1,$3,'starting')`,[id,pair.player1_id,`swiss:${id}`])
      for(const seat of [0,1])await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,$2,$3,$4)',[id,seat,seat===0?pair.player1_id:pair.player2_id,decks[seat]!.id])
      await tx.query("UPDATE practice_match_games SET lifecycle_idempotency_key=$2,updated_at=NOW() WHERE id=$1",[id,`purrgil:${id}`])
    }
    const own=await tx.queryRow(`SELECT v.snapshot->>'poolShareId' AS share_id FROM ptp_native_match_seats s
      JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 AND s.user_id=$2`,[id,userId])
    return {id,poolShareId:String(own?.share_id)}
  })
  const launch=await launchMatch(reserved.id,userId,expiresAt,{isolated:true,returnPath:`/pools/${encodeURIComponent(reserved.poolShareId)}/deck/play`,eventFormat:'swiss'})
  await withTransaction(tx=>tx.query("UPDATE practice_match_games SET status='in_progress',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1 AND status='creating'",[reserved.id]))
  await broadcastDraftState(shareId)
  return launch
}
