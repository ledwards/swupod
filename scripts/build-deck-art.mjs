// Hyperspace art for every leader and base, keyed by card id: node scripts/build-deck-art.mjs <PTP src/data/cards.json>
// Each standard printing points at its Hyperspace printing's image when one exists, else its own.
import {readFile,writeFile} from 'node:fs/promises';
const source=process.argv[2];if(!source)throw Error('Pass the path to PTP src/data/cards.json');
const {cards}=JSON.parse(await readFile(source,'utf8'));
const cdn='https://cdn.starwarsunlimited.com/';
const decks=cards.filter(c=>c.type==='Leader'||c.type==='Base');
const key=c=>`${c.name}|${c.subtitle??''}|${c.set}`;
const hyperspace=new Map(decks.filter(c=>c.variantType==='Hyperspace'||c.isHyperspace).map(c=>[key(c),c.imageUrl]));
const out={};
for(const c of decks){const img=hyperspace.get(key(c))??c.imageUrl;if(!img)continue;out[c.cardId]=[img.startsWith(cdn)?img.slice(cdn.length):img,c.name,c.type==='Base'?1:0];}
await writeFile('play-home/home/deck-art.json',JSON.stringify(out)+'\n');
console.log(Object.keys(out).length,'cards',[...hyperspace.keys()].length,'hyperspace');
