import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
test('beta rollout preserves external availability and lobby creation',{skip:process.env.NATIVE_LOCAL_DB_TEST!=='1'},async()=>{
  const database=`ptp_retirement_test_${randomUUID().replaceAll('-','')}`
  const admin=new pg.Client({host:'/tmp',database:'postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${database}`)
  const db=new pg.Client({host:'/tmp',database});await db.connect()
  try{
    process.env.DATABASE_URL=`postgresql://${process.env.USER}@localhost:5432/${database}`
    await db.query('CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE card_pools(id UUID PRIMARY KEY)')
    for(const file of ['074_create_ptp_play_runtime.sql','076_create_open_games.sql'])await db.query(await readFile(`migrations/${file}`,'utf8'))
    const owner='00000000-0000-4000-8000-000000000001',guest='00000000-0000-4000-8000-000000000002',acceptedOwner='00000000-0000-4000-8000-000000000003',preOwner='00000000-0000-4000-8000-000000000004'
    await db.query(`INSERT INTO users VALUES('${owner}'),('${guest}'),('${acceptedOwner}'),('${preOwner}');
      INSERT INTO card_pools VALUES('${owner}'),('${guest}'),('${acceptedOwner}'),('${preOwner}');
      INSERT INTO ptp_play_queue_entries(user_id,card_pool_id,pool_share_id,set_code,pool_type,status) VALUES('${owner}','${owner}','waiting','SOR','sealed','queued'),('${guest}','${guest}','paired','SOR','sealed','matched');
      INSERT INTO open_games(share_id,status,visibility,set_code,format,player1_id,player1_pool_id,player2_id,result) VALUES
      ('waiting','open','public','SOR','sealed','${owner}','${owner}',NULL,NULL),
      ('live','in_progress','public','SOR','sealed','${owner}','${owner}','${guest}',NULL),
      ('precreated','open','public','SOR','sealed','${preOwner}','${preOwner}',NULL,NULL),
      ('accepted','accepted','private','SOR','sealed','${acceptedOwner}','${acceptedOwner}',NULL,NULL),
      ('history','complete','public','SOR','sealed','${owner}','${owner}','${guest}','player1');
      INSERT INTO open_game_lobby_attempts(open_game_id,status,attempt_number,lobby_url,created_by_user_id)
      SELECT id,'in_progress',1,'https://karabast.net/game/existing','${owner}'::uuid FROM open_games WHERE share_id='live';
      INSERT INTO open_game_lobby_attempts(open_game_id,status,attempt_number,created_by_user_id)
      SELECT id,'creating',1,'${preOwner}'::uuid FROM open_games WHERE share_id='precreated';`)
    const migration=await readFile('migrations/103_retire_external_limited_admission.sql','utf8')
    await db.query(migration);await db.query(migration)
    const rows=(await db.query('SELECT * FROM open_games ORDER BY id')).rows
    assert.equal(rows.find(r=>r.share_id==='waiting').status,'open')
    assert.equal(rows.find(r=>r.share_id==='live').status,'in_progress')
    assert.equal(rows.find(r=>r.share_id==='precreated').status,'open')
    assert.equal(rows.find(r=>r.share_id==='precreated').visibility,'public')
    assert.equal(rows.find(r=>r.share_id==='history').result,'player1')
    assert(rows.filter(r=>r.share_id!=='history').every(r=>r.result===null))
    assert.equal((await db.query("SELECT status FROM ptp_play_queue_entries WHERE pool_share_id='waiting'")).rows[0].status,'queued')
    assert.equal((await db.query("SELECT status FROM ptp_play_queue_entries WHERE pool_share_id='paired'")).rows[0].status,'matched')
    const {claimOpenGame,recordOpenGameLifecycle}=await import('../openGameLive')
    const existing=await claimOpenGame({shareId:'live',userId:owner,companionCapable:true})
    assert.equal(existing.action,'open_lobby');assert.equal(existing.lobbyUrl,'https://karabast.net/game/existing')
    await assert.rejects(claimOpenGame({shareId:'live',userId:preOwner,companionCapable:true}),{code:'forbidden'})
    assert.equal((await claimOpenGame({shareId:'accepted',userId:acceptedOwner,companionCapable:true})).action,'create_lobby')
    await recordOpenGameLifecycle({openGameShareId:'accepted',actorUserId:acceptedOwner,status:'lobby_ready'})
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM open_game_lobby_attempts')).rows[0].n,3)
  }finally{const {closePool}=await import('../../../lib/db');await closePool();await db.end();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end()}
})
