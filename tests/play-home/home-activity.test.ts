import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HomePage} from '../../play-home/home/HomePage';
import {premier,type SharedState} from '../../play-home/home/shared';

const render=(queues:SharedState['queues'],pods:SharedState['pods']=[])=>renderToStaticMarkup(createElement(HomePage,{
 shared:{queues,pods,sets:[],signedIn:false} as unknown as SharedState,
 sharedError:'',onPlay:()=>{},onLimited:()=>{},refreshShared:async()=>{},
}));
test('quiet homepage still shows Now Playing with the five primary queues, all at 0 waiting',()=>{
 const html=render([{contract:premier,waiting:0}] as SharedState['queues']);
 assert.match(html,/Now Playing/);
 const labels=[...html.matchAll(/aria-label="Join ([^"]+) queue, (\d+) waiting"/g)].map(m=>`${m[1]}=${m[2]}`);
 assert.deepEqual(labels,['HMW Draft=0','HMW Sealed 6-pack=0','HMW Sealed 8-pack=0','Premier=0','Eternal=0']);
 // No resume: the lobbies take the whole row.
 assert.match(html,/class="ph-home-status is-none is-quiet"/);
});
test('the Sealed tile has its six packs with no set list at all (prerendered shell, lobby state failed)',()=>{
 for(const shared of [undefined,{queues:[],pods:[],sets:[],signedIn:false} as unknown as SharedState]){
  const html=renderToStaticMarkup(createElement(HomePage,{shared,sharedError:'',onPlay:()=>{},onLimited:()=>{},refreshShared:async()=>{}}));
  const packs=html.match(/<span class="ph-tile-art ph-packs"[^>]*>(.*?)<\/span>/)?.[1]??'';
  assert.equal(packs.match(/<img /g)?.length,6);
  assert.match(packs,/pack-images\/home\/hmw-pack-[123]\.webp/);
  const fan=html.match(/class="ph-tile-art ph-fan"[^>]*>(.*?)<\/span>/)?.[1]??'';
  assert.equal(fan.match(/<img /g)?.length,3);
  assert.match(fan,/Wookiee_Rangers/);
 }
});
test('pack candidates fall back to other art and the newest set, never to nothing',async()=>{
 const {packCandidates}=await import('../../play-home/home/art');
 const list=packCandidates('','XYZ',2);
 assert.deepEqual(list.slice(0,6),['/pack-images/home/xyz-pack-2.webp','/pack-images/home/xyz-pack-1.webp','/pack-images/home/xyz-pack-3.webp','/pack-images/xyz-pack-2.png','/pack-images/xyz-pack-1.png','/pack-images/xyz-pack-3.png']);
 assert.equal(list[6],'/pack-images/home/hmw-pack-2.webp');
 assert.ok(list.includes('/pack-images/hmw-pack-2.png'));
 assert.equal(list.at(-1),'https://www.protectthepod.com/pack-images/hmw-pack-2.png');
});
test('queues show their waiting count; other queues join only when occupied',()=>{
 const old={format:'limited',limited:'six',set:'LAW',pool:'current'} as const;
 const html=render([{contract:premier,waiting:2},{contract:{...premier,format:'eternal'},waiting:0},{contract:old,waiting:1},{contract:{...old,set:'SOR'},waiting:0}] as SharedState['queues']);
 assert.match(html,/Join Premier queue, 2 waiting/);
 assert.match(html,/Join Eternal queue, 0 waiting/);
 assert.match(html,/Join LAW Sealed 6-pack queue, 1 waiting/);
 assert.doesNotMatch(html,/SOR Sealed/);
});
test('an active pod remains available without any occupied queues',()=>{
 const html=render([],[{id:'test',name:'Friday draft',set:'HMW',players:2,capacity:8}] as SharedState['pods']);
 assert.match(html,/Friday draft/);
 assert.match(html,/Join pod/);
 assert.doesNotMatch(html,/>Queues<|Nobody waiting yet/);
});
