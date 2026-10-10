import {canAddGameNotes} from '@/lib/play/gameNotes'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {queryRow} from '@/lib/db'
import {respond,uuid} from '@/src/services/play/native/http'
export function GET(request:Request){return respond(async()=>{
 authorizeRecordService(request);
 const user=await queryRow('SELECT is_admin,is_beta_tester,is_alpha_tester,is_patron FROM users WHERE id=$1',[uuid(new URL(request.url).searchParams.get('subject'))]);
 // The gateway beta field is the existing wire name for game access.
 const beta=user?.is_admin===true||user?.is_alpha_tester===true;
 return {canAddNotes:canAddGameNotes(user),alpha:user?.is_admin===true||user?.is_alpha_tester===true,beta,canCustomize:beta&&(user?.is_admin===true||user?.is_patron===true)};
})}
