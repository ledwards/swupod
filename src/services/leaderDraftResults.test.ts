import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { leaderDraftResults } from './leaderDraftResults'
const leader = {id:'leader',name:'Leader',imageUrl:'/front.png',backImageUrl:'/back.png'}
const players = [
  {user_id:'private',seat_number:5,username:'Private',drafted_leaders:[leader]},
  {user_id:'me',seat_number:2,username:'Me',drafted_leaders:JSON.stringify([leader])},
  {user_id:'bot',seat_number:7,username:'Bot',is_bot:true,drafted_leaders:[leader]},
  {user_id:'public',seat_number:8,username:'Public',is_log_public:true,drafted_leaders:[leader]},
]
describe('leader draft results', () => {
  it('preserves original seats and returns both faces for visible leaders', () => {
    const result=leaderDraftResults(players,'me','host',false)
    assert.deepEqual(result.map(p=>p.seatNumber),[2,5,7,8])
    assert.deepEqual(result.map(p=>p.leaders),[[leader],null,[leader],[leader]])
  })
  it('keeps private and bot cards out of anonymous responses', () => {
    assert.deepEqual(leaderDraftResults(players,undefined,'host',false).map(p=>p.leaders),[null,null,null,[leader]])
  })
  it('allows the host or a public draft to expose all leaders', () => {
    for(const [viewer,isPublic] of [['host',false],[undefined,true]] as const)
      assert.ok(leaderDraftResults(players,viewer,'host',isPublic).every(p=>p.leaders?.length===1))
  })
  it('distinguishes unavailable historical leaders from a private seat', () => {
    assert.deepEqual(leaderDraftResults([{...players[1],drafted_leaders:null}],'me','host',false)[0].leaders,[])
  })
})
