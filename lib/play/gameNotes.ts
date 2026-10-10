import {timingSafeEqual} from 'node:crypto'
import {queryRow,queryRows} from '../db'
import {getSession} from '../auth'
import {PtpPlayError} from '../../src/services/play/playState'
import {uuid} from '../../src/services/play/native/http'

/** Mirrors native play access on the alpha line: admins and alpha testers. */
export function canAddGameNotes(user:Record<string,unknown>|null){
 return user?.is_admin===true||user?.is_alpha_tester===true
}
function invalid():never{throw new PtpPlayError(400,'invalid_note','Invalid game note.')}
export function validateGameNote(input:Record<string,unknown>){
 const id=uuid(input.id),subject=uuid(input.subject);
 if(typeof input.matchId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.matchId)||![0,1].includes(Number(input.seat))||typeof input.seat!=='number'||
  !Number.isSafeInteger(input.step)||Number(input.step)<1||Number(input.step)>20001||!Number.isSafeInteger(input.entryIndex)||Number(input.entryIndex)<0||Number(input.entryIndex)>1000||
  typeof input.text!=='string'||!input.text.trim()||input.text.length>2000||typeof input.engineRevision!=='string'||input.engineRevision.length>100||!input.engineRevision)invalid();
 const snapshot=input.snapshot as Record<string,unknown>|null;
 if(!snapshot||snapshot.matchId!==input.matchId||snapshot.issuer!=='ptp'||snapshot.seat!==input.seat||snapshot.step!==input.step||snapshot.engineRevision!==input.engineRevision||!snapshot.observation)invalid();
 return {id,subject,matchId:input.matchId,seat:input.seat,step:Number(input.step),entryIndex:Number(input.entryIndex),text:input.text.trim(),engineRevision:input.engineRevision,snapshot};
}
export async function saveGameNote(input:Record<string,unknown>){
 const note=validateGameNote(input);
 const user=await queryRow('SELECT is_admin,is_alpha_tester FROM users WHERE id=$1',[note.subject]);
 if(!canAddGameNotes(user))throw new PtpPlayError(403,'notes_access_required','Notes are available to alpha testers.');
 const row=await queryRow(`INSERT INTO ptp_game_notes(id,user_id,match_id,seat,step,entry_index,note,engine_revision,snapshot)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id`,
 [note.id,note.subject,note.matchId,note.seat,note.step,note.entryIndex,note.text,note.engineRevision,JSON.stringify(note.snapshot)]);
 if(!row){
  const previous=await queryRow('SELECT user_id,match_id,seat,step,entry_index,note FROM ptp_game_notes WHERE id=$1',[note.id]);
  if(!previous||previous.user_id!==note.subject||previous.match_id!==note.matchId||previous.seat!==note.seat||previous.step!==note.step||previous.entry_index!==note.entryIndex||previous.note!==note.text)
   throw new PtpPlayError(409,'note_conflict','This note has already been saved with different content.');
 }
 return {id:note.id};
}
export async function requireNotesAdmin(request:Request){
 const session=getSession(request);
 if(!session?.is_admin)throw new PtpPlayError(404,'not_found','Not found.');
 const user=await queryRow('SELECT is_admin,auth_version FROM users WHERE id=$1',[session.id]);
 if(user?.is_admin!==true||typeof session.auth_version!=='number'||Number(user.auth_version)!==session.auth_version)throw new PtpPlayError(404,'not_found','Not found.');
}
/** Dedicated read-only key. Never re-use the gateway's write-capable service credential. */
export function authorizeNotesExport(request:Request){
 const expected=process.env.GAME_NOTES_READ_KEY,actual=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!expected||expected.length<32||!actual||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))
  throw new PtpPlayError(404,'not_found','Not found.');
}
export async function listGameNotes(url:URL){
 let after:{at:string;id:string}|null=null;
 const cursor=url.searchParams.get('cursor');
 if(cursor){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!after||!Number.isFinite(Date.parse(after.at)))invalid();uuid(after.id);}catch{invalid();}}
 const rows=await queryRows(`SELECT id,match_id,seat,step,entry_index,note,engine_revision,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM ptp_game_notes
 WHERE ($1::timestamptz IS NULL OR (created_at,id)>($1::timestamptz,$2::uuid)) ORDER BY created_at,id LIMIT 100`,[after?.at??null,after?.id??null]);
 const last=rows.at(-1);
 return {notes:rows,nextCursor:last?Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url'):cursor};
}
export async function gameNoteBundle(id:string){
 const row=await queryRow('SELECT id,match_id,seat,step,entry_index,note,engine_revision,snapshot,created_at FROM ptp_game_notes WHERE id=$1',[uuid(id)]);
 if(!row)throw new PtpPlayError(404,'not_found','Note not found.');
 // Completed replays are already archived by both solo and multiplayer flows.
 const record=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(row.match_id))?await queryRow(`SELECT record_json,record_hash FROM ptp_solo_ai_games WHERE id=$1::uuid AND record_json IS NOT NULL
 UNION ALL SELECT record_json,record_hash FROM ptp_native_game_records WHERE match_id=$1::uuid LIMIT 1`,[row.match_id]):null;
 return {schemaVersion:1,note:row,record:record?.record_json??null,recordHash:record?.record_hash??null};
}
