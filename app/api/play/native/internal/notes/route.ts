import {deliverGameFeedback} from '@/lib/play/gameFeedbackDiscord'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {body,respond} from '@/src/services/play/native/http'
import {saveGameNote} from '@/lib/play/gameNotes'
export function POST(request:Request){return respond(async()=>{
 authorizeRecordService(request)
 const saved=await saveGameNote(await body(request,2*1024*1024))
 try{await deliverGameFeedback(saved.id)}catch{console.warn('Game feedback Discord queue unavailable')}
 return saved
})}
