import type {DeckExport} from './shared';

/** A deck imported on Play (SWUForge link or pasted JSON), kept in this browser until signed-in storage exists. */
export type ImportedDeck={deck:DeckExport;source:'swuforge'|'json';url?:string;name:string;importedAt:number};
const KEY='ph-imported-decks',MAX=20;
const sameDeck=(a:ImportedDeck,b:ImportedDeck)=>a.url&&b.url?a.url===b.url:a.name===b.name&&a.deck.leader?.id===b.deck.leader?.id&&a.deck.base?.id===b.deck.base?.id;
const valid=(d:unknown):d is ImportedDeck=>{const v=d as ImportedDeck;return !!v&&typeof v.name==='string'&&typeof v.importedAt==='number'&&!!v.deck?.leader?.id&&!!v.deck?.base?.id&&Array.isArray(v.deck.deck);};
/** Newest first; storage can be missing, blocked or corrupt, and then there are none. */
export function readImported():ImportedDeck[]{
 try{const raw=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(raw)?raw.filter(valid).sort((a,b)=>b.importedAt-a.importedAt):[];}catch{return [];}
}
/** Adds (or refreshes) one import and returns the new list; a re-import of the same deck replaces the old copy. */
export function saveImported(entry:ImportedDeck,list=readImported()):ImportedDeck[]{
 const next=[entry,...list.filter(d=>!sameDeck(d,entry))].slice(0,MAX);
 try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* kept for this visit only */}
 return next;
}
