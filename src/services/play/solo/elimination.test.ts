import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nextPairings,type SoloMatch,type SoloParticipant} from './progression'
const players:SoloParticipant[]=Array.from({length:8},(_,i)=>({id:i===4?'human':`bot${i}`,seat:i+1,kind:i===4?'human':'ai',name:`Seat ${i+1}`}))
test('elimination preserves bracket order, waits for results, and ends after a final',()=>{
 const matches:SoloMatch[]=[]
 for(const [round,count] of [[1,4],[2,2],[3,1]]){
  const pairs=nextPairings(players,matches,'elimination')
  assert.equal(pairs.length,count)
  assert.ok(pairs.every(p=>p.round===round&&p.player2!=='human'))
  if(round>1)assert.deepEqual(new Set(pairs.flatMap(p=>[p.player1,p.player2])),new Set(matches.filter(m=>m.round===round-1).map(m=>m.winner)))
  for(const [i,p] of pairs.entries())matches.push({...p,id:`${round}-${i}`,winner:null})
  assert.deepEqual(nextPairings(players,matches,'elimination'),[])
  for(const m of matches.filter(m=>!m.winner))m.winner=m.player2 // Human loses; bots must finish.
 }
 assert.equal(matches.length,7)
 assert.deepEqual(nextPairings(players,matches,'elimination'),[])
})
