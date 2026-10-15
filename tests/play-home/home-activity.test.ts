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
test('quiet homepage still shows the lobbies box with the five primary queues, all at 0 waiting, and no Now Playing block',()=>{
 const html=render([{contract:premier,waiting:0}] as SharedState['queues']);
 assert.match(html,/aria-label="Lobbies"/);assert.doesNotMatch(html,/Now Playing|Watch<\/a>/);
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
test('the waiting screen shows the elapsed clock and the three search steps from the server status',t=>{
 // One clock for the fixture and the render: read twice, a second boundary between the reads turned 0:12 into 0:11.
 const fixed=Date.now(),realNow=Date.now;Date.now=()=>fixed;t.after(()=>{Date.now=realNow;});
 const joinedAt=Date.now()-65000;
 const page=(search:NonNullable<SharedState['queue']>['search'],notice?:string)=>renderToStaticMarkup(createElement(HomePage,{
  shared:{queues:[],pods:[],sets:[],signedIn:true,queue:{contract:premier,label:'Premier',joinedAt,search,notice}} as unknown as SharedState,
  sharedError:'',onPlay:()=>{},onLimited:()=>{},refreshShared:async()=>{},
 }));
 const html=page({radius:260,expandSeconds:40,stage:'wider',widenAt:Date.now()+12000});
 assert.match(html,/class="ph-timer" role="timer">1:05</);
 const steps=[...html.matchAll(/<li(?: class="([^"]*)")?(?: aria-current="step")?><i aria-hidden="true"><\/i><span>([^<]+)<\/span>(?:<span class="ph-stage-next" role="timer">([^<]+)<\/span>)?<\/li>/g)].map(m=>[m[1]??'',m[2],m[3]??'']);
 assert.deepEqual(steps,[['is-past','Nearby',''],['is-current','Wider','0:12'],['','Anyone','']]);
 assert.match(html,/aria-current="step"><i aria-hidden="true"><\/i><span>Wider/);
 // At the last step nothing counts down; the notice from a requeue shows under the steps.
 const last=page({radius:350,expandSeconds:15,stage:'anyone',widenAt:null},'Your opponent never joined. Back in the queue.');
 assert.doesNotMatch(last,/ph-stage-next/);
 assert.match(last,/role="status">Your opponent never joined\. Back in the queue\.</);
 // No search on the status (older gateway): the steps are simply absent.
 assert.doesNotMatch(page(undefined),/ph-stages/);
});
test('maintenance replaces the Play card only after a real answer; the prerendered shell never shows it',()=>{
 const page=(shared?:Partial<SharedState>)=>renderToStaticMarkup(createElement(HomePage,{shared:shared as SharedState|undefined,sharedError:'',onPlay:()=>{},onLimited:()=>{},refreshShared:async()=>{}}));
 // No answer yet (prerender): the Play card, no panel.
 assert.match(page(undefined),/aria-label="Play"/);assert.doesNotMatch(page(undefined),/Maintenance/);
 // The status poll answered with maintenance off.
 const off=page({queues:[],pods:[],sets:[],signedIn:false,maintenance:null});assert.match(off,/aria-label="Play"/);assert.doesNotMatch(off,/Maintenance/);
 // On: one panel with the message and return time in the card's place.
 const on=page({queues:[],pods:[],sets:[],signedIn:false,maintenance:{message:'Matchmaking is being upgraded.',returnAt:'2026-10-16T20:00:00Z'}});
 assert.doesNotMatch(on,/aria-label="Play"/);
 assert.match(on,/<section class="ph-tile ph-maintenance" aria-label="Maintenance" role="status"><span class="ph-tile-title">Maintenance<\/span><span class="ph-sub">Matchmaking is being upgraded\.<\/span><span class="ph-maintenance-back">Back <time dateTime="2026-10-16T20:00:00Z">/);
 assert.doesNotMatch(page({queues:[],pods:[],sets:[],signedIn:false,maintenance:{message:'Back soon.',returnAt:null}}),/ph-maintenance-back/);
});
