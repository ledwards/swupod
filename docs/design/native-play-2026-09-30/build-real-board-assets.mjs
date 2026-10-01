/** Rebuild the reference card manifest from PTP's actual catalog; never hand-author card metadata. */
import {readFile, writeFile, copyFile, mkdir, access} from 'node:fs/promises';
const dir = new URL('./', import.meta.url);
const repo = new URL('../../../', dir);
const {cards} = JSON.parse(await readFile(new URL('src/data/cards.json',repo),'utf8'));
const ids=['SOR-005','SOR-010','SOR-020','SOR-023','SOR-098','SOR-095','SOR-239','SOR-232','SOR-237','SOR-225','SOR-241','SOR-044','SOR-126','SOR-172','SOR-103','SOR-128','SOR-229','SOR-231'];
const result={schema:1,source:'src/data/cards.json',backSource:'public/card-images/card-back.png',cards:{}};
await mkdir(new URL('assets/',dir),{recursive:true});
await Promise.all(ids.map(async id=>{
 const c=cards.find(c=>c.cardId===id&&c.variantType==='Normal');
 if(!c||!c.imageUrl)throw Error(`Missing canonical card ${id}`);
 const {cardId,name,subtitle,type,aspects,traits,arenas,cost,power,hp,frontText,backText,epicAction,keywords,imageUrl,backImageUrl}=c;
 result.cards[id]={cardId,name,subtitle,type,aspects,traits,arenas,cost,power,hp,frontText,backText,epicAction,keywords,imageUrl,backImageUrl,face:`assets/${id}.png`,reverse:backImageUrl?`assets/${id}-unit.png`:null};
 for(const [source,path]of [[imageUrl,`assets/${id}.png`],...(backImageUrl?[[backImageUrl,`assets/${id}-unit.png`]]:[])]){
  try{await access(new URL(path,dir));continue}catch{}
  const response=await fetch(source);if(!response.ok)throw Error(`${id}: ${response.status}`);
  await writeFile(new URL(path,dir),Buffer.from(await response.arrayBuffer()));
 }
}));
await copyFile(new URL('public/card-images/card-back.png',repo),new URL('assets/card-back.png',dir));
await writeFile(new URL('real-board-data.json',dir),JSON.stringify(result,null,2)+'\n');
console.log(`Prepared ${ids.length} catalog cards and the unchanged PTP card back.`);
