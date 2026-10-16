import {cookies} from 'next/headers'
import {notFound} from 'next/navigation'
import {requireNotesAdmin} from '@/lib/play/gameNotes'
import {viewerHasAlphaAccess} from '@/lib/viewerAccess'
import GameNotesAdmin from '@/src/components/admin/GameNotesAdmin'
import GameNotesAdminAlpha from '@/src/components/admin/GameNotesAdminAlpha'
export default async function GameNotesPage(){
 const jar=await cookies()
 try{await requireNotesAdmin(new Request('http://localhost/admin/game-notes',{headers:{cookie:jar.toString()}}))}catch{notFound()}
 // Alpha viewers get the themed page; the notes-admin gate above applies to both.
 if(await viewerHasAlphaAccess())return <GameNotesAdminAlpha/>
 return <GameNotesAdmin/>
}
