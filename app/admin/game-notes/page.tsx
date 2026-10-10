import {cookies} from 'next/headers'
import {notFound} from 'next/navigation'
import {requireNotesAdmin} from '@/lib/play/gameNotes'
import GameNotesAdmin from '@/src/components/admin/GameNotesAdmin'
export default async function GameNotesPage(){
 const jar=await cookies()
 try{await requireNotesAdmin(new Request('http://localhost/admin/game-notes',{headers:{cookie:jar.toString()}}))}catch{notFound()}
 return <GameNotesAdmin/>
}
