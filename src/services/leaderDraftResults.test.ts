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
  it('shows the leader and base each visible player built, with their pool for the deck image', () => {
    const built = players.map(p => ({...p, pool_share_id: `pool-${p.user_id}`, built_leader: {id: 'HMW_003', count: 1}, built_base: JSON.stringify({id: 'HMW_031', count: 1})}))
    const resolve = (id: unknown, kind: 'leader' | 'base') => ({id: String(id), name: kind})
    const result = leaderDraftResults([...built, {...players[0], user_id: 'unbuilt', seat_number: 1, is_log_public: true}], 'me', 'host', false, resolve)
    // Leaders and bases follow the draft log; the pool to open opens only for its owner.
    assert.deepEqual(result.map(p => p.deck && [p.deck.leader?.id, p.deck.base?.id, p.deck.poolShareId]), [
      null, ['HMW_003', 'HMW_031', 'pool-me'], null, ['HMW_003', 'HMW_031', null], ['HMW_003', 'HMW_031', null]])
    assert.deepEqual(result.map(p => p.isBot), [false, false, false, true, false])
  })
  it('opens every deck and pool for the host, and for every pod member once decks and pools are public', () => {
    const built = players.map(p => ({...p, pool_share_id: `pool-${p.user_id}`, built_leader: {id: 'HMW_003'}, built_base: {id: 'HMW_031'}}))
    const resolve = (id: unknown) => ({id: String(id), name: 'card'})
    const pools = (viewer: string | undefined, decksPublic: boolean) => leaderDraftResults(built, viewer, 'host', false, resolve, decksPublic).map(p => p.deck?.poolShareId ?? null)
    assert.deepEqual(pools('host', false), ['pool-me', 'pool-private', 'pool-bot', 'pool-public'])
    assert.deepEqual(pools('me', false), ['pool-me', null, null, null])
    assert.deepEqual(pools('me', true), ['pool-me', 'pool-private', 'pool-bot', 'pool-public'])
    assert.deepEqual(pools('stranger', true), [null, null, null, null], 'public is for pod members')
    assert.deepEqual(pools(undefined, true), [null, null, null, null])
  })
})
