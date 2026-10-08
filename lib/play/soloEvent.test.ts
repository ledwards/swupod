import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceSolo } from './soloEvent'
import type { TxClient } from '../db'
function fixture(singleGame: boolean, result: string | null) {
  const writes: { sql: string; params: unknown[] }[] = []
  const tx = {
    queryRow: async () => ({ prepared: { singleGame } }),
    queryRows: async (sql: string) =>
      sql.includes('participants')
        ? [
            { id: 'human', seat: 1, kind: 'human', name: 'You' },
            { id: 'bot', seat: 2, kind: 'ai', name: 'Bot' },
          ]
        : sql.includes('matches')
          ? [
              {
                id: 'match',
                round: 1,
                player1: 'human',
                player2: 'bot',
                winner: null,
              },
            ]
          : [{ id: 'game', game_no: 1, result }],
    query: async (sql: string, params: unknown[] = []) => {
      writes.push({ sql, params })
      return { rows: [], rowCount: 0, command: '', fields: [] }
    },
  } as TxClient
  return { tx, writes }
}
test('single practice game ends after a win, loss, or draw without another game', async () => {
  for (const result of ['player1', 'player2', 'draw']) {
    const { tx, writes } = fixture(true, result)
    await advanceSolo(tx, 'run')
    assert.equal(
      writes.some((w) => w.sql.includes('INSERT')),
      false
    )
    assert.equal(writes.length, result === 'draw' ? 0 : 1)
    if (result !== 'draw')
      assert.equal(writes[0]?.params[1], result === 'player1' ? 'human' : 'bot')
  }
})
test('an unfinished practice game does not create a duplicate', async () => {
  const { tx, writes } = fixture(true, null)
  await advanceSolo(tx, 'run')
  assert.equal(writes.length, 0)
})
test('existing best-of-three runs retain progression', async () => {
  const { tx, writes } = fixture(false, 'player1')
  await advanceSolo(tx, 'run')
  assert.equal(writes.filter((w) => w.sql.includes('INSERT INTO ptp_solo_ai_games')).length, 1)
})
test('elimination creates only two semifinals, keeping human launch manual and bots automatic',async()=>{
 const writes:{sql:string;params:unknown[]}[]=[]
 const participants=Array.from({length:8},(_,i)=>({id:i===0?'human':`bot${i}`,seat:i+1,kind:i===0?'human':'ai',name:`Seat ${i+1}`}))
 const matches=Array.from({length:4},(_,i)=>({id:`qf${i}`,round:1,player1:participants[i]!.id,player2:participants[i+4]!.id,winner:participants[i]!.id}))
 const tx={queryRow:async()=>({prepared:{eventFormat:'elimination'}}),queryRows:async(sql:string)=>sql.includes('participants')?participants:matches,query:async(sql:string,params:unknown[])=>{writes.push({sql,params});return {rows:[]}}} as unknown as TxClient
 await advanceSolo(tx,'run')
 const rounds=writes.filter(w=>w.sql.includes('INSERT INTO ptp_solo_ai_matches'))
 assert.equal(rounds.length,2)
 assert.deepEqual(rounds.map(w=>w.params.slice(2)),[[2,0,'human','bot1'],[2,1,'bot2','bot3']])
 const games=writes.filter(w=>w.sql.includes('INSERT INTO ptp_solo_ai_games'))
 assert.deepEqual(games.map(w=>w.params[4]),[false,true])
})
