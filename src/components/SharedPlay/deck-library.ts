type LibraryDeck={setCode:string;poolType:string;packCount?:number|null;ready:boolean;name:string;leaderName?:string;baseName?:string}

export function limitedLibraryFormat(deck:Pick<LibraryDeck,'setCode'>):string{
 const sets=[...new Set(deck.setCode.split(',').map(set=>set.trim().toUpperCase()).filter(Boolean))]
 return sets.length>1?'Chaos':sets[0]==='CHAOS'?'Chaos':sets[0]??'Unknown'
}

export function limitedLibraryType(deck:Pick<LibraryDeck,'poolType'>):string{
 return deck.poolType==='chaos_sealed'?'sealed':deck.poolType==='chaos_draft'?'draft':deck.poolType
}

// Browsing filters are independent of the selected queue's admission rules.
export function filterLimitedLibrary<T extends LibraryDeck>(decks:T[],filters:{format:string;type:string;packs?:string;incomplete:boolean;query:string}):T[]{
 const query=filters.query.trim().toLowerCase()
 return decks.filter(deck=>(filters.incomplete||deck.ready)
  &&(filters.format==='all'||limitedLibraryFormat(deck)===filters.format)
  &&(filters.type==='all'||limitedLibraryType(deck)===filters.type)
  &&(!filters.packs||filters.packs==='all'||limitedLibraryType(deck)==='sealed'&&deck.packCount===Number(filters.packs))
  &&[deck.name,deck.leaderName,deck.baseName,limitedLibraryFormat(deck)].join(' ').toLowerCase().includes(query))
}

export type QueueContract={format:'premier'|'eternal'|'limited';limited:'draft'|'six'|'eight'|'chaos';set:string;pool:'current'|'next';policy?:string}
type FitDeck={setCode:string;poolType:string;packCount:number|null;ready:boolean}
/** Whether a saved limited deck may enter a queue: same set, and draft vs sealed pack count must match. */
export const fitsQueue=(c:QueueContract,d:FitDeck)=>d.ready&&c.format==='limited'&&(c.limited==='chaos'||d.setCode===c.set&&(c.limited==='draft'?d.poolType==='draft'&&d.packCount===3:d.poolType==='sealed'&&d.packCount===(c.limited==='six'?6:8)))
export const eligibleCount=(c:QueueContract,decks:FitDeck[])=>decks.filter(d=>fitsQueue(c,d)).length
