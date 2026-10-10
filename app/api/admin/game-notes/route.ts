import {respond} from '@/src/services/play/native/http'
import {requireNotesAdmin,listGameNotes,gameNoteBundle} from '@/lib/play/gameNotes'
export function GET(request:Request){return respond(async()=>{
 await requireNotesAdmin(request)
 const url=new URL(request.url),id=url.searchParams.get('id')
 return id?gameNoteBundle(id):listGameNotes(url)
})}
