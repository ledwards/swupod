import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
test('database permits only pre-game AI policy changes and preserves frozen decks', {skip:!process.env.PTP_TEST_DATABASE_URL}, async()=>{
 const url=process.env.PTP_TEST_DATABASE_URL!
 assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname))
 const db=new pg.Client({connectionString:url});await db.connect();await db.query('BEGIN')
 try {
 const owner=randomUUID(),run=randomUUID(),match=randomUUID()
 await db.query('INSERT INTO users(id,username,email) VALUES($1,$2,$3)',[owner,'Synthetic style test',`${owner}@example.invalid`])
 const prepared={singleGame:true,aiPolicy:'cal-balanced-v1',human:{deck:['frozen']},bot:{cards:['frozen']}}
 await db.query('INSERT INTO ptp_solo_ai_runs(id,owner_user_id,request_id,pool_share_id,prepared) VALUES($1,$2,$3,$4,$5)',[run,owner,randomUUID(),'style-test',JSON.stringify(prepared)])
 await db.query("UPDATE ptp_solo_ai_runs SET prepared=jsonb_set(prepared,'{aiPolicy}','\"cal-aggro-v1\"') WHERE id=$1",[run])
 assert.deepEqual((await db.query('SELECT prepared FROM ptp_solo_ai_runs WHERE id=$1',[run])).rows[0].prepared,{...prepared,aiPolicy:'cal-aggro-v1'})
 async function denied(sql:string){await db.query('SAVEPOINT invalid_change');await assert.rejects(db.query(sql,[run]),/immutable/);await db.query('ROLLBACK TO SAVEPOINT invalid_change')}
 await denied("UPDATE ptp_solo_ai_runs SET prepared=jsonb_set(prepared,'{human}','{}') WHERE id=$1")
 await denied("UPDATE ptp_solo_ai_runs SET prepared=jsonb_set(prepared,'{aiPolicy}','\"unknown\"') WHERE id=$1")
 for(const [id,seat] of [['human',1],['bot',2]])await db.query('INSERT INTO ptp_solo_ai_participants(run_id,id,seat,kind,name,deck) VALUES($1,$2,$3,$4,$2,$5)',[run,id,seat,id==='human'?'human':'ai','{}'])
 await db.query("INSERT INTO ptp_solo_ai_matches(id,run_id,round,ordinal,player1,player2) VALUES($1,$2,1,0,'human','bot')",[match,run])
 await db.query(`INSERT INTO ptp_solo_ai_games(id,run_id,match_id,game_no,requested,deck_snapshots) VALUES($1,$2,$3,1,true,'[{},{}]')`,[randomUUID(),run,match])
 await denied("UPDATE ptp_solo_ai_runs SET prepared=jsonb_set(prepared,'{aiPolicy}','\"cal-control-v1\"') WHERE id=$1")
 } finally {await db.query('ROLLBACK');await db.end()}
})
