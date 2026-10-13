/** Release notes live in public/release-notes.md. Each entry is a `## YYYY-MM-DD · Title` heading, newest first. */
export type ReleaseNote={id:string;date:string;title:string;body:string};
export type NoteBlock={type:'paragraph';text:string}|{type:'list';items:string[]};

export const SEEN_KEY='purrgil.release-notes.seen';
export const TOASTED_KEY='purrgil.release-notes.toasted';

const heading=/^##\s+(\d{4}-\d{2}-\d{2})\s*(?:[·—–-]\s*)?(.*)$/;

export function parseReleaseNotes(markdown:string):ReleaseNote[]{
 const notes:ReleaseNote[]=[];let current:ReleaseNote|undefined;
 for(const raw of markdown.split(/\r?\n/)){
  const match=heading.exec(raw);
  if(match){
   const [,date,rest]=match;const title=rest.trim()||date;
   current={id:`${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,date,title,body:''};
   notes.push(current);continue;
  }
  if(current)current.body+=`${raw}\n`;
 }
 for(const note of notes)note.body=note.body.trim();
 return notes;
}

/** Notes newer than the last one the player opened. An unknown or missing marker means everything is unread. */
export function unreadNotes(notes:ReleaseNote[],seenId:string|null|undefined):ReleaseNote[]{
 if(!seenId)return notes;
 const index=notes.findIndex(note=>note.id===seenId);
 return index===-1?notes:notes.slice(0,index);
}

export function noteBlocks(body:string):NoteBlock[]{
 const blocks:NoteBlock[]=[];let paragraph:string[]=[];let list:string[]|undefined;
 const flush=()=>{if(paragraph.length){blocks.push({type:'paragraph',text:paragraph.join(' ')});paragraph=[];}if(list){blocks.push({type:'list',items:list});list=undefined;}};
 for(const raw of body.split('\n')){
  const line=raw.trim();
  if(!line){flush();continue;}
  const item=/^[-*]\s+(.*)$/.exec(line);
  if(item){if(paragraph.length){blocks.push({type:'paragraph',text:paragraph.join(' ')});paragraph=[];}(list??=[]).push(item[1]);continue;}
  if(list){blocks.push({type:'list',items:list});list=undefined;}
  paragraph.push(line);
 }
 flush();
 return blocks;
}

export function readStored(key:string):string|null{try{return localStorage.getItem(key);}catch{return null;}}
export function writeStored(key:string,value:string){try{localStorage.setItem(key,value);}catch{/* private mode or blocked storage: the badge simply stays */}}
