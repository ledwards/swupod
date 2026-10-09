'use client'
import {useParams,useRouter} from 'next/navigation'
import EntryShell from '@/src/components/EntryFlow/EntryShell'
import LeaderDraftResults from '@/src/components/LeaderDraftResults'
import '@/src/components/SharedPlay/shared-play.css'

/** Competitive Practice Mode: the solo event formats for one drafted deck. */
export default function PracticePage(){
 const {shareId}=useParams<{shareId:string}>(),router=useRouter()
 const pool=encodeURIComponent(shareId)
 return <EntryShell back={{label:'Back',onClick:()=>router.push(`/play?pool=${pool}`)}}>
  <section className="sp-workspace" aria-label="Competitive Practice Mode">
   <header className="sp-title"><h1>Competitive Practice Mode</h1><p>Play this draft through an event against AI drafters. Results count toward the deck&apos;s record.</p></header>
   <div className="sp-layout">
    <section aria-label="Choose an event">
     <div className="sp-actions">
      <div className="sp-action-pair">
       <button className="sp-primary" onClick={()=>router.push(`/pools/${pool}/play/swiss`)}>Swiss rounds <span>(three rounds, choose BO1 or BO3)</span></button>
       <button onClick={()=>router.push(`/pools/${pool}/play/bracket`)}>Elimination bracket <span>(eight drafted decks, best-of-three, lose and you&apos;re out)</span></button>
      </div>
     </div>
     <p className="sp-help">Both resume where you left off if you come back later.</p>
    </section>
    <aside><LeaderDraftResults poolShareId={shareId} collapsed/></aside>
   </div>
  </section>
 </EntryShell>
}
