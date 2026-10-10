'use client'
import {useEffect,useRef,useState} from 'react'
import Button from '../Button'
import './GameNotesAdmin.css'
type Note={id:string;match_id:string;step:number;seat:number;note:string;engine_revision:string;created_at:string}
type Bundle={note:Note;record:unknown;recordHash:string|null}
export default function GameNotesAdmin(){
 const [notes,setNotes]=useState<Note[]>([]),[cursor,setCursor]=useState<string|null>(null),[pending,setPending]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState<Note|null>(null),[bundle,setBundle]=useState<Bundle|null>(null),[detailError,setDetailError]=useState('');
 const busy=useRef(false)
 async function fetchNotes(after:string|null=null){
  if(busy.current)return;busy.current=true;setPending(true);setError('')
  try{const response=await fetch('/api/admin/game-notes'+(after?'?cursor='+encodeURIComponent(after):''));if(!response.ok)throw Error();const data=await response.json();setNotes(old=>after?[...new Map([...old,...data.notes].map((n:Note)=>[n.id,n])).values()]:data.notes);setCursor(data.nextCursor)}
  catch{setError('Could not fetch notes. Try again.')}finally{setPending(false);busy.current=false}
 }
 useEffect(()=>{void fetchNotes()},[])
 useEffect(()=>{if(!selected)return;const abort=new AbortController();setBundle(null);setDetailError('');void fetch('/api/admin/game-notes?id='+selected.id,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(data=>setBundle(data)).catch(()=>{if(!abort.signal.aborted)setDetailError('Could not fetch the game record. Select the note to try again.')});return()=>abort.abort()},[selected])
 return <main className="game-notes-admin page-background"><header><div><h1>Game notes</h1><a href="/admin">Admin</a></div><Button disabled={pending} onClick={()=>void fetchNotes()}>Refresh</Button></header>
 {error&&<p role="alert">{error}</p>}
 <div className="game-notes-layout"><section aria-label="Player notes" aria-busy={pending}>
 {pending&&!notes.length?<div className="notes-skeleton" aria-label="Player notes"><div/><div/><div/></div>:!notes.length?<p>No notes yet.</p>:notes.map(note=><Button key={note.id} className="game-note-list-item" active={selected?.id===note.id} variant="toggle" onClick={()=>setSelected({...note})}><span>{note.note}</span><small>Step {note.step} · {new Date(note.created_at).toLocaleString()}</small></Button>)}
 {cursor&&<Button disabled={pending} onClick={()=>void fetchNotes(cursor)}>More notes</Button>}
 </section><section className="game-note-detail" aria-label="Selected note">{selected?<><h2>Step {selected.step}</h2><p className="game-note-body">{selected.note}</p><dl><dt>Game</dt><dd>{selected.match_id}</dd><dt>Seat</dt><dd>{selected.seat+1}</dd><dt>Engine</dt><dd>{selected.engine_revision}</dd><dt>Added</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></dl>
 {detailError?<p role="alert">{detailError}</p>:!bundle?<div className="notes-skeleton" aria-busy="true"><div/></div>:<><p>{bundle.record?'Completed replay and saved moment available.':'Saved moment available. Completed replay not yet archived.'}</p><a className="btn btn--secondary" href={'/api/admin/game-notes?id='+selected.id} download={'game-note-'+selected.id+'.json'}>Download record</a></>}
 </>:<p>Select a note.</p>}</section></div></main>
}
