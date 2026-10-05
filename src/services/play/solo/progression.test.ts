import {test} from 'node:test'
import assert from 'node:assert/strict'
import {matchScore,nextPairings,soloStandings,type SoloParticipant,type SoloMatch} from './progression'
const roster:SoloParticipant[]=Array.from({length:8},(_,i)=>({id:i===6?'human':`bot${i}`,seat:i+1,kind:i===6?'human':'ai',name:`Seat ${i+1}`}))
test('BO3 counts wins, not draws or games played',()=>{
 assert.equal(matchScore(['player1','draw','player2']).winner,null)
 assert.deepEqual(matchScore(['player1','draw','player2','player2']),{wins:[1,2],winner:'player2'})
})
test('three Swiss rounds retain actual opponents and keep human in engine seat zero',()=>{
 const matches:SoloMatch[]=[]
 for(let round=1;round<=3;round++){
  const pairs=nextPairings(roster,matches)
  assert.equal(pairs.length,4)
  assert.equal(new Set(pairs.flatMap(p=>[p.player1,p.player2])).size,8)
  for(const [i,p] of pairs.entries()){
   assert.equal(p.round,round)
   assert.notEqual(p.player2,'human')
   assert.ok(!matches.some(m=>[m.player1,m.player2].includes(p.player1)&&[m.player1,m.player2].includes(p.player2)))
   matches.push({...p,id:`${round}-${i}`,winner:null})
  }
  assert.equal(nextPairings(roster,matches).length,0)
  for(const m of matches.filter(m=>!m.winner))m.winner=m.player1
 }
 assert.equal(nextPairings(roster,matches).length,0)
 assert.equal(soloStandings(roster,matches).reduce((sum,p)=>sum+p.wins,0),12)
})
test('sealed ends after one match; first draft opponent is opposite seat',()=>{
 const first=nextPairings(roster,[]).find(p=>p.player1==='human')!
 assert.equal(first.player2,'bot2')
 const two=roster.filter(p=>p.id==='human'||p.id==='bot2')
 const pair=nextPairings(two,[])[0]!
 assert.equal(nextPairings(two,[{...pair,id:'one',winner:'human'}]).length,0)
})
test('BO1 resolves after one win; BO3 needs two; drawn games never fabricate a winner',()=>{
 assert.equal(matchScore(['player2'],1).winner,'player2')
 assert.equal(matchScore(['player2'],3).winner,null)
 assert.equal(matchScore(['draw'],1).winner,null)
 assert.equal(matchScore(['draw','player1'],1).winner,'player1')
})
