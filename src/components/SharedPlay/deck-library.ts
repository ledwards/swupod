type LibraryDeck={setCode:string;poolType:string;ready:boolean;name:string;leaderName?:string;baseName?:string}

export function limitedLibraryFormat(deck:Pick<LibraryDeck,'setCode'>):string{
 const sets=[...new Set(deck.setCode.split(',').map(set=>set.trim().toUpperCase()).filter(Boolean))]
 return sets.length>1?'Chaos':sets[0]==='CHAOS'?'Chaos':sets[0]??'Unknown'
}

// Browsing filters are independent of the selected queue's admission rules.
export function filterLimitedLibrary<T extends LibraryDeck>(decks:T[],filters:{format:string;type:string;incomplete:boolean;query:string}):T[]{
 const query=filters.query.trim().toLowerCase()
 return decks.filter(deck=>(filters.incomplete||deck.ready)
  &&(filters.format==='all'||limitedLibraryFormat(deck)===filters.format)
  &&(filters.type==='all'||deck.poolType===filters.type)
  &&[deck.name,deck.leaderName,deck.baseName,limitedLibraryFormat(deck)].join(' ').toLowerCase().includes(query))
}
