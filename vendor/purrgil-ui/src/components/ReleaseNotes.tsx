import {useEffect,useState,type ReactNode} from 'react';
import {DecisionDialog} from './DecisionDialog';
import {SEEN_KEY,TOASTED_KEY,noteBlocks,parseReleaseNotes,readStored,unreadNotes,writeStored,type ReleaseNote} from '../release-notes';

const inlinePattern=/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
function inline(text:string):ReactNode[]{
 return text.split(inlinePattern).filter(Boolean).map((part,i)=>{
  if(part.startsWith('**'))return <b key={i}>{part.slice(2,-2)}</b>;
  if(part.startsWith('`'))return <code key={i}>{part.slice(1,-1)}</code>;
  const link=/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
  if(link)return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
  return part;
 });
}
function NoteBody({body}:{body:string}){
 return <>{noteBlocks(body).map((block,i)=>block.type==='list'?<ul key={i}>{block.items.map((item,j)=><li key={j}>{inline(item)}</li>)}</ul>:<p key={i}>{inline(block.text)}</p>)}</>;
}
function formatDate(date:string){return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`));}

/** Header icon that opens the release notes. Unread entries light the badge and announce themselves once with a toast; opening marks everything read. */
export function ReleaseNotesButton({brand='Purrgil'}:{brand?:string}={}){
 const [notes,setNotes]=useState<ReleaseNote[]>([]);
 const [open,setOpen]=useState(false);
 const [seen,setSeen]=useState(()=>readStored(SEEN_KEY));
 const [fresh,setFresh]=useState<string[]>([]);
 const [toast,setToast]=useState<ReleaseNote|null>(null);
 useEffect(()=>{
  let stopped=false;
  const load=async()=>{try{const response=await fetch(`/release-notes.md?v=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;const text=await response.text();if(!stopped)setNotes(parseReleaseNotes(text));}catch{/* keep whatever we have */}};
  void load();const timer=setInterval(()=>{void load();},60000);
  return()=>{stopped=true;clearInterval(timer);};
 },[]);
 const unread=unreadNotes(notes,seen);
 const newest=unread[0]?.id;
 useEffect(()=>{
  if(!newest||open)return;
  if(readStored(TOASTED_KEY)===newest)return;
  writeStored(TOASTED_KEY,newest);
  const note=unread[0];setToast(note);
  const timer=setTimeout(()=>setToast(current=>current?.id===note.id?null:current),12000);
  return()=>clearTimeout(timer);
 },[newest,open]);
 const show=()=>{setFresh(unread.map(note=>note.id));setToast(null);setOpen(true);if(notes[0]){writeStored(SEEN_KEY,notes[0].id);setSeen(notes[0].id);}};
 if(!notes.length)return null;
 return <>
  <button className="header-icon release-notes-button" aria-label={unread.length?`Release notes, ${unread.length} unread`:'Release notes'} title="Release notes" aria-haspopup="dialog" onClick={show}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8.5L20 8v12.5H7z"/><path d="M15.5 3.5V8H20M9.5 12h7M9.5 15.5h7M9.5 19h4"/></svg>
   {unread.length>0&&<span className="release-notes-badge" aria-hidden="true"/>}
  </button>
  {toast&&<div className="lobby-toast" aria-live="polite"><button onClick={show}><strong>New in {brand}</strong><span>{toast.title}</span></button><button aria-label="Dismiss" onClick={()=>setToast(null)}>×</button></div>}
  {open&&<DecisionDialog controls={false} label="Release notes" className="lobby-dialog release-notes-dialog" onClose={()=>setOpen(false)}>
   <header><h2>Release notes</h2><button aria-label="Close release notes" onClick={()=>setOpen(false)}>×</button></header>
   <div className="release-notes-list">{notes.map(note=><article key={note.id}><h3>{note.title}{fresh.includes(note.id)&&<span className="lobby-tag">New</span>}</h3><time dateTime={note.date}>{formatDate(note.date)}</time><NoteBody body={note.body}/></article>)}</div>
  </DecisionDialog>}
 </>;
}
