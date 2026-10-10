import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
test('private game notes persist exact moments, enforce roles, retry once and export without author identity',{skip:process.env.NATIVE_LOCAL_DB_TEST!=='1'},async()=>{
 const database='ptp_notes_'+randomUUID().replaceAll('-',''),admin=new pg.Client({host:'/tmp',database:'postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${database}`)
 process.env.DATABASE_URL=`postgresql://localhost/${database}?host=/tmp`;process.env.JWT_SECRET='notes-test-secret-that-is-at-least-32-characters'
 const {query,closePool}=await import('../db');
 try{
  await query('CREATE TABLE users(id UUID PRIMARY KEY,is_alpha_tester BOOLEAN DEFAULT FALSE,is_beta_tester BOOLEAN DEFAULT FALSE,is_admin BOOLEAN DEFAULT FALSE,auth_version INT DEFAULT 1)')
  await query('CREATE TABLE ptp_solo_ai_games(id UUID,record_json JSONB,record_hash TEXT); CREATE TABLE ptp_native_game_records(match_id UUID,record_json JSONB,record_hash TEXT)')
  const migration=await readFile(new URL('../../migrations/114_game_notes.sql',import.meta.url),'utf8');await query(migration);await query(migration)
  await query(await readFile(new URL('../../migrations/115_game_feedback_discord.sql',import.meta.url),'utf8'))
  const {saveGameNote,canAddGameNotes,listGameNotes,gameNoteBundle,requireNotesAdmin,authorizeNotesExport}=await import('./gameNotes')
  assert.equal(canAddGameNotes({is_alpha_tester:true}),true);assert.equal(canAddGameNotes({is_admin:true}),true);assert.equal(canAddGameNotes({is_beta_tester:true}),false);assert.equal(canAddGameNotes(null),false)
  const subject=randomUUID(),matchId=randomUUID(),id=randomUUID();await query('INSERT INTO users(id,is_alpha_tester) VALUES($1,true)',[subject])
  const snapshot={issuer:'ptp',matchId,seat:0,step:4,engineRevision:'pinned',observation:{my_hand:['seat-visible']}}
  const input={id,subject,matchId,seat:0,step:4,entryIndex:0,text:'A note',engineRevision:'pinned',snapshot}
  assert.deepEqual(await saveGameNote(input),{id});assert.deepEqual(await saveGameNote(input),{id})
  await assert.rejects(()=>saveGameNote({...input,text:'different'}),{status:409})
  const list=await listGameNotes(new URL('http://local/notes'));assert.equal(list.notes.length,1);assert.equal('user_id' in list.notes[0]!,false)
  const empty=await listGameNotes(new URL('http://local/notes?cursor='+list.nextCursor));assert.equal(empty.notes.length,0)
  const bundle=await gameNoteBundle(id);assert.deepEqual(bundle.note.snapshot,snapshot);assert.equal(bundle.record,null);assert.equal('user_id' in bundle.note,false)
  await query('INSERT INTO ptp_solo_ai_games VALUES($1,$2,$3)',[matchId,JSON.stringify({setup:{seed:'123'}}),'hash']);assert.deepEqual((await gameNoteBundle(id)).record,{setup:{seed:'123'}})
  const {deliverGameFeedback}=await import('./gameFeedbackDiscord')
  const originalFetch=globalThis.fetch,originalToken=process.env.DISCORD_BOT_TOKEN;let posts=0;
  process.env.DISCORD_BOT_TOKEN='test-only';
  try{
   globalThis.fetch=async()=>{posts++;return new Response('{}',{status:503})};
   await deliverGameFeedback(id);
   assert.equal((await query('SELECT discord_message_id FROM ptp_game_notes WHERE id=$1',[id])).rows[0].discord_message_id,null);
   await query("UPDATE ptp_game_notes SET discord_retry_at=NOW() WHERE id=$1",[id]);
   globalThis.fetch=async()=>{posts++;return Response.json({id:'discord-message'})};
   await Promise.all([deliverGameFeedback(id),deliverGameFeedback(id)]);
   await deliverGameFeedback(id);assert.equal(posts,2);
   assert.equal((await query('SELECT discord_message_id FROM ptp_game_notes WHERE id=$1',[id])).rows[0].discord_message_id,'discord-message');
  }finally{globalThis.fetch=originalFetch;if(originalToken===undefined)delete process.env.DISCORD_BOT_TOKEN;else process.env.DISCORD_BOT_TOKEN=originalToken}
  await query('UPDATE users SET is_alpha_tester=false WHERE id=$1',[subject]);await assert.rejects(()=>saveGameNote({...input,id:randomUUID()}),{status:403})
  await assert.rejects(()=>requireNotesAdmin(new Request('http://local/notes')),{status:404})
  const {createToken}=await import('../auth')
  const token=createToken({id:subject,email:'notes@example.test',username:'notes-test',is_admin:true,auth_version:1})
  const request=new Request('http://local/api/admin/game-notes',{headers:{cookie:'swupod_session='+token}})
  await assert.rejects(()=>requireNotesAdmin(request),{status:404})
  await query('UPDATE users SET is_admin=true WHERE id=$1',[subject]);await requireNotesAdmin(request)
  const {GET:adminGet}=await import('../../app/api/admin/game-notes/route')
  assert.equal((await adminGet(request)).status,200)
  await query('UPDATE users SET auth_version=2 WHERE id=$1',[subject]);assert.equal((await adminGet(request)).status,404)
  const {POST:saveRoute}=await import('../../app/api/play/native/internal/notes/route')
  await query('UPDATE users SET is_admin=false WHERE id=$1',[subject]);process.env.PURRGIL_HOST_SERVICE_KEY='w'.repeat(40)
  assert.equal((await saveRoute(new Request('http://local/notes',{method:'POST',body:JSON.stringify(input)}))).status,401)
  const denied=await saveRoute(new Request('http://local/notes',{method:'POST',headers:{authorization:'Bearer '+'w'.repeat(40)},body:JSON.stringify(input)}));assert.equal(denied.status,403)
  await query('UPDATE users SET is_alpha_tester=true WHERE id=$1',[subject])
  assert.equal((await saveRoute(new Request('http://local/notes',{method:'POST',headers:{authorization:'Bearer '+'w'.repeat(40)},body:JSON.stringify(input)}))).status,200)

  process.env.GAME_NOTES_READ_KEY='r'.repeat(40);assert.throws(()=>authorizeNotesExport(new Request('http://local/export')),{status:404});authorizeNotesExport(new Request('http://local/export',{headers:{authorization:'Bearer '+'r'.repeat(40)}}))
  await query(`INSERT INTO ptp_game_notes(id,user_id,match_id,seat,step,entry_index,note,engine_revision,snapshot,created_at)
   SELECT gen_random_uuid(),$1,$2,0,4,0,'Pagination note','pinned',$3,NOW()+INTERVAL '1 second' FROM generate_series(1,105)`,[subject,matchId,JSON.stringify(snapshot)])
  const first=await listGameNotes(new URL('http://local/notes')),second=await listGameNotes(new URL('http://local/notes?cursor='+first.nextCursor))
  assert.equal(first.notes.length,100);assert.equal(second.notes.length,6);assert.equal(new Set([...first.notes,...second.notes].map(n=>n.id)).size,106)
  for(const changes of [{text:' '},{step:-1},{snapshot:{...snapshot,seat:1}}])await assert.rejects(()=>saveGameNote({...input,...changes}),{status:400})
 }finally{await closePool();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end()}
})
