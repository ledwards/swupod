import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {queryRow} from '@/lib/db'
import {respond,uuid} from '@/src/services/play/native/http'
export function GET(request:Request){return respond(async()=>{
 authorizeRecordService(request);
 const user=await queryRow('SELECT is_admin,is_beta_tester,is_patron FROM users WHERE id=$1',[uuid(new URL(request.url).searchParams.get('subject'))]);
 const beta=user?.is_admin===true||user?.is_beta_tester===true;
 return {beta,canCustomize:beta&&(user?.is_admin===true||user?.is_patron===true)};
})}
