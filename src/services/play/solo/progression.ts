import {pairRound1,pairSwiss,type PairingPlayer} from '../../matchmaking/pairing'
import {computeRankedStandings,type RoundForStandings} from '../../matchmaking/standings'
export type SoloParticipant={id:string;seat:number;kind:'human'|'ai';name:string}
export type SoloMatch={id:string;round:number;player1:string;player2:string;winner:string|null}
export type SoloResult='player1'|'player2'|'draw'
export function matchScore(results:readonly SoloResult[],bestOf:1|3=3){
 const wins=[results.filter(r=>r==='player1').length,results.filter(r=>r==='player2').length] as [number,number]
 const required=bestOf===1?1:2
 return {wins,winner:wins[0]>=required?'player1' as const:wins[1]>=required?'player2' as const:null}
}
export function nextPairings(participants:SoloParticipant[],matches:SoloMatch[],format:'swiss'|'elimination'='swiss'){
 const round=matches.length?Math.max(...matches.map(m=>m.round))+1:1
 const rounds=participants.length===8?3:1
 if(round>rounds||matches.some(m=>!m.winner))return []
 if(format==='elimination'&&round>1){
  const previous=matches.filter(m=>m.round===round-1)
  const pairs=[]
  for(let i=0;i<previous.length;i+=2){
   const a=previous[i]?.winner,b=previous[i+1]?.winner
   if(!a||!b)throw Error('Incomplete elimination bracket')
   pairs.push({round,player1:b==='human'?b:a,player2:b==='human'?a:b})
  }
  return pairs
 }
 const players:PairingPlayer[]=participants.map(p=>({id:p.id,seatNumber:p.seat,matchWins:matches.filter(m=>m.winner===p.id).length,
  matchLosses:matches.filter(m=>(m.player1===p.id||m.player2===p.id)&&m.winner!==p.id).length,
  hasBye:false,dropped:false,opponents:matches.filter(m=>m.player1===p.id||m.player2===p.id).map(m=>m.player1===p.id?m.player2:m.player1)}))
 return (round===1?pairRound1(players):pairSwiss(players)).map(pair=>{
  if(!pair.player2Id||pair.isBye)throw Error('Unsupported solo roster')
  const humanSecond=participants.find(p=>p.id===pair.player2Id)?.kind==='human'
  return {round,player1:humanSecond?pair.player2Id:pair.player1Id,player2:humanSecond?pair.player1Id:pair.player2Id}
 })
}
export function soloStandings(participants:SoloParticipant[],matches:SoloMatch[]){
 const rounds:RoundForStandings[]=[1,2,3].map(round=>({roundNumber:round,matches:matches.filter(m=>m.round===round).map(m=>({id:m.id,player1:{id:m.player1},player2:{id:m.player2},isBye:false,finalConfirmed:!!m.winner,matchWinner:m.winner===m.player1?'player1':m.winner===m.player2?'player2':null}))}))
 return computeRankedStandings(rounds,participants.map(p=>({id:p.id,username:p.name})))
}
