import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {soloGameReadySql} from './soloGameGate'
test('AI games wait for the corresponding human start and release after the match', {skip:process.env.NATIVE_LOCAL_DB_TEST!=='1'},async()=>{
 const db=new pg.Client({host:'/tmp',database:'postgres'});await db.connect()
 try {
  await db.query(`CREATE TEMP TABLE ptp_solo_ai_matches(id TEXT,run_id TEXT,round INT,player1 TEXT,player2 TEXT,winner TEXT);
   CREATE TEMP TABLE ptp_solo_ai_games(id TEXT,run_id TEXT,match_id TEXT,game_no INT,result TEXT,requested BOOLEAN,next_check_at TIMESTAMPTZ);
   INSERT INTO ptp_solo_ai_matches VALUES('human-match','run',1,'human','bot',NULL),('bot-match','run',1,'a','b',NULL),('later','run',2,'a','b',NULL);
   INSERT INTO ptp_solo_ai_games VALUES('human1','run','human-match',1,NULL,false,NOW()),('ai1','run','bot-match',1,NULL,true,NOW()),('ai2','run','bot-match',2,NULL,true,NOW()),('later1','run','later',1,NULL,true,NOW());`)
  const ready=async()=>Object.fromEntries((await db.query(`SELECT g.id,(${soloGameReadySql('g')}) AS ready FROM ptp_solo_ai_games g`)).rows.map(r=>[r.id,r.ready]))
  assert.deepEqual(await ready(),{human1:true,ai1:false,ai2:false,later1:true})
  await db.query("UPDATE ptp_solo_ai_games SET requested=true WHERE id='human1'")
  assert.equal((await ready()).ai1,true);assert.equal((await ready()).ai2,false)
  await db.query("UPDATE ptp_solo_ai_matches SET winner='human' WHERE id='human-match'")
  assert.equal((await ready()).ai2,true)
  const claimed=await db.query(`UPDATE ptp_solo_ai_games SET next_check_at=NOW()+INTERVAL '2 minutes' WHERE id IN (SELECT pending.id FROM ptp_solo_ai_games pending WHERE result IS NULL AND requested AND next_check_at<=NOW() AND ${soloGameReadySql('pending')} AND ($1::text IS NULL OR run_id=$1) ORDER BY next_check_at LIMIT 4 FOR UPDATE SKIP LOCKED) RETURNING id`,['run'])
  assert.equal(claimed.rowCount,4)
 }finally{await db.end()}
})
