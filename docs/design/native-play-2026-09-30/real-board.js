import {mountPreferences,readPreferences,applyPreferences} from './table-preferences.js';
/** Presentation proof. Catalog metadata is real; game position and legal choices are a fixed demo fixture. */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const back = 'assets/card-back.png';
let catalog;
let state;
let selected = null;
let busy = false;
let generation = 0;
let flipped = false;
let inspected = null;
const abort = new AbortController();
const eventOptions = {signal: abort.signal};
const fixture = () => ({
  units: [
    {id:'guard',cardId:'SOR-229',seat:'opponent',arena:'ground'},
    {id:'walker',cardId:'SOR-232',seat:'opponent',arena:'ground'},
    {id:'trooper',cardId:'SOR-128',seat:'opponent',arena:'ground',exhausted:true},
    {id:'tie',cardId:'SOR-225',seat:'opponent',arena:'space'},
    {id:'advanced',cardId:'SOR-231',seat:'opponent',arena:'space'},
    {id:'defender',cardId:'SOR-098',seat:'player',arena:'ground'},
    {id:'marine',cardId:'SOR-095',seat:'player',arena:'ground'},
    {id:'pathfinder',cardId:'SOR-239',seat:'player',arena:'ground',exhausted:true},
    {id:'xwing',cardId:'SOR-237',seat:'player',arena:'space'},
    {id:'arc',cardId:'SOR-044',seat:'player',arena:'space'},
  ],
  hand:['SOR-239','SOR-126','SOR-103','SOR-044','SOR-172'],
  players:{opponent:{name:'MORGAN',leader:'SOR-010',base:'SOR-020',damage:12,resources:6,readyResources:5,deck:18,discard:2,discardCards:['SOR-128','SOR-172']},player:{name:'YOU',leader:'SOR-005',base:'SOR-023',damage:8,resources:6,readyResources:4,deck:19,discard:2,discardCards:['SOR-126','SOR-239']}},
  log:[{who:'Morgan',text:'played TIE/ln Fighter.',when:'JUST NOW'},{who:'You',text:'played Battlefield Marine.',when:'PREVIOUS ACTION'},{who:'Round 6',text:'Both players readied their cards.',when:'REGROUP'}],
  // Supplied presentation actions, not a local rules evaluator. Only this one scripted attack is supported.
  actions:[{attacker:'marine',target:'guard'}],finished:false,
});
function card(id){const c=catalog.cards[id];if(!c)throw Error('Unknown fixture card '+id);return c;}
function cardButton(id,extra='',attrs=''){
 const c=card(id);
 return `<button class="physical-card ${extra}" data-card="${esc(id)}" ${attrs} aria-label="Inspect ${esc(c.name)}${c.power!=null?`, ${c.power} power, ${c.hp} HP`:''}"><span class="card-image-window"><img src="${esc(c.face)}" alt="${esc(c.name)}" draggable="false" width="287" height="400"></span></button>`;
}
function miniature(id,role){const c=card(id);return `<button class="mini-card" data-card="${id}" aria-label="Inspect ${esc(c.name)}, ${role}"><img src="${c.face}" alt="${esc(c.name)}" width="400" height="287" draggable="false"><span class="card-role">${role}</span></button>`;}
function profile(seat){const p=state.players[seat];return `<div class="identity"><span class="name">${p.name}</span><span class="side">${seat==='player'?'YOUR SIDE':'OPPONENT'}</span><div class="damage">${p.damage}<small>/ ${card(p.base).hp}</small></div><span class="damage-label">BASE DAMAGE</span></div><div class="mini-cards">${miniature(p.leader,'LEADER')}${miniature(p.base,'BASE')}</div>`;}
function resources(seat){const p=state.players[seat];return `<div class="resource-label">RESOURCES <b>${p.readyResources} / ${p.resources}</b></div><div class="resource-cards" aria-label="${p.readyResources} ready of ${p.resources} resources">${Array.from({length:p.resources},(_,i)=>`<img class="card-back ${i>=p.readyResources?'spent':''}" src="${back}" alt="Face-down ${i>=p.readyResources?'exhausted':'ready'} resource" width="250" height="349" draggable="false">`).join('')}</div><div class="resource-pips" aria-hidden="true">${Array.from({length:p.resources},(_,i)=>`<i class="${i>=p.readyResources?'spent':''}"></i>`).join('')}</div>`;}
function deck(seat){const p=state.players[seat],top=card(p.discardCards.at(-1));return `<div class="pile-pair" aria-label="${seat==='player'?'Your':'Opponent'} draw and discard area"><div class="pile-item"><div class="deck-stack"><img class="card-back" src="${back}" alt="${seat==='player'?'Your':'Opponent'} deck, ${p.deck} cards" width="250" height="349"><span class="deck-count">${p.deck}</span></div><span>DRAW</span></div><div class="pile-item"><button class="discard-stack" data-discard="${seat}" aria-label="Inspect ${seat==='player'?'your':'opponent'} discard pile, ${p.discard} cards"><img src="${top.face}" alt="Top discard: ${esc(top.name)}" width="287" height="400"><span class="deck-count">${p.discard}</span></button><span>DISCARD</span></div></div>`;}
function unitButton(u){const c=card(u.cardId);const s=cardButton(u.cardId,u.exhausted?'exhausted':'',`data-unit="${u.id}" data-seat="${u.seat}" data-card-type="${c.type}"`);return s.replace('</button>',`<span class="cinematic-label">${esc(c.name)}</span><span class="cinematic-stats"><b>${c.power}</b><b>${c.hp}</b></span>${u.exhausted?'<span class="exhausted-indicator">EXHAUSTED</span>':''}</button>`);}
function logHtml(){return state.log.map(e=>`<p class="activity-entry"><small>${esc(e.when)}</small><b>${esc(e.who)}</b> ${esc(e.text)}</p>`).join('');}
function render(){
 for(const seat of ['opponent','player']){
  $(`#${seat}-profile`).innerHTML=profile(seat);$(`#${seat}-resources`).innerHTML=resources(seat);$(`#${seat}-deck`).innerHTML=deck(seat);
  for(const arena of ['ground','space']){
   const units=state.units.filter(u=>u.seat===seat&&u.arena===arena);
   const expanded=$('#crowded').checked?[...units,...units.map(u=>({...u,id:u.id+'-copy'}))]:units;
   $(`#${seat}-${arena}`).innerHTML=expanded.map(unitButton).join('');
  }
 }
 $('#opponent-hand').innerHTML=Array.from({length:6},(_,i)=>`<img src="${back}" class="card-back" style="--r:${(i-2.5)*1.5}deg" alt="Opponent hidden card" width="250" height="349" draggable="false">`).join('');
 $('#player-hand').innerHTML=state.hand.map((id,i)=>cardButton(id,'',`style="--rotation:${(i-2)*4}deg;--lift:${Math.abs(i-2)*6}px"`)).join('');
 $('#hand-count').textContent=state.hand.length;
 for(const seat of ['opponent','player']){$(`#${seat}-center`).innerHTML=miniature(state.players[seat].leader,'LEADER')+miniature(state.players[seat].base,'BASE');}
 $('#activity-list').innerHTML=logHtml();$('#full-history').innerHTML=logHtml();
 paintSelection();
}
function paintSelection(){
 document.querySelectorAll('.selected,.target').forEach(n=>n.classList.remove('selected','target'));document.querySelectorAll('.target-tag').forEach(n=>n.remove());
 if(selected){
  document.querySelector(`[data-unit="${selected}"]`)?.classList.add('selected');
  for(const a of state.actions.filter(a=>a.attacker===selected)){
   const node=document.querySelector(`[data-unit="${a.target}"]`);node?.classList.add('target');if(node)node.insertAdjacentHTML('beforeend','<span class="target-tag">VALID TARGET</span>');
  }
 }
 $('#primary-action').disabled=busy||state.finished;
 $('#initiative-action').disabled=busy||state.finished;
 $('#primary-action').innerHTML=state.finished?'Attack preview complete':selected?'Cancel targeting':'Select an attacker <span>↗</span>';
 $('#decision-text').textContent=state.finished?'Both units were defeated. Reset to replay.':selected?'Attack Cell Block Guard. Sentinel protects the other ground units.':'Choose Battlefield Marine to preview an attack.';
 $('#arena-caption').textContent=selected?'CHOOSE THE HIGHLIGHTED SENTINEL · OTHER CARDS CAN STILL BE INSPECTED':'TAP OR CLICK ANY CARD TO INSPECT';
 requestAnimationFrame(drawArrow);
}
function drawArrow(){
 const svg=$('#target-line');const from=selected&&document.querySelector(`[data-unit="${selected}"]`);const action=state.actions.find(a=>a.attacker===selected);const to=action&&document.querySelector(`[data-unit="${action.target}"]`);
 if(!from||!to){svg.style.display='none';return}svg.style.display='block';
 const area=$('#battlefield').getBoundingClientRect();const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
 // Normalize screen coordinates after the parent perspective transform.
 const sx=$('#battlefield').clientWidth/area.width,sy=$('#battlefield').clientHeight/area.height;
 const x1=(a.left+a.width/2-area.left)*sx,y1=(a.top-area.top-7)*sy,x2=(b.left+b.width/2-area.left)*sx,y2=(b.bottom-area.top+9)*sy;
 const d=`M${x1},${y1} C${x1+35},${y1-65} ${x2+35},${y2+65} ${x2},${y2}`;
 svg.querySelectorAll('path:not(defs path)').forEach(p=>p.setAttribute('d',d));
}
function selectAttacker(){if(busy||state.finished)return;selected=selected?null:'marine';paintSelection();}
function reduced(){return document.body.classList.contains('reduced')||matchMedia('(prefers-reduced-motion: reduce)').matches;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function resolveAttack(target){
 if(busy||!state.actions.some(a=>a.attacker===selected&&a.target===target))return;
 busy=true;const ticket=generation;paintSelection();
 const attacking=document.querySelector(`[data-unit="${selected}"]`),defending=document.querySelector(`[data-unit="${target}"]`);
 $('#decision-text').textContent='Battlefield Marine attacks Cell Block Guard.';
 if(!reduced()){attacking?.classList.add('card-attack');defending?.classList.add('card-hit');await sleep(430);if(ticket!==generation)return;attacking?.classList.add('card-leaving');defending?.classList.add('card-leaving');await sleep(260);}
 if(ticket!==generation)return;
 // Explicit scenario outcome: both printed 3-power / 3-HP units leave the board. Baize will supply outcomes in production.
 state.units=state.units.filter(u=>u.id!=='marine'&&u.id!=='guard');state.players.player.discard++;state.players.opponent.discard++;state.players.player.discardCards.push('SOR-095');state.players.opponent.discardCards.push('SOR-229');
 state.log.unshift({who:'Demo attack',text:'Battlefield Marine and Cell Block Guard dealt 3 damage to each other. Both were defeated.',when:'SCRIPTED OUTCOME'});
 state.actions=[];state.finished=true;selected=null;busy=false;render();$('#reset').focus({preventScroll:true});
}
function showCard(id,unitId){
 if(busy)return;
 inspected={id,unitId};flipped=false;renderCardDetail();$('#card-dialog').showModal();
}
function renderCardDetail(){
 const c=card(inspected.id),landscape=!flipped&&['Leader','Base'].includes(c.type);
 const currentFace=flipped?c.reverse:c.face;
 const rules=flipped?c.backText:c.frontText;
 $('#card-detail').innerHTML=`<div class="detail-grid ${landscape?'landscape':''}"><div><img class="detail-image" src="${esc(currentFace)}" alt="${esc(c.name)}${flipped?', unit face':''}" ${landscape?'width="400" height="287"':'width="287" height="400"'}>${c.reverse?`<button class="action-secondary flip" data-flip>View ${flipped?'leader':'unit'} face ↻</button>`:''}</div><div class="detail-copy"><div class="eyebrow">${esc(c.cardId)} · ${esc(c.type)}${c.arenas?.length?' · '+esc(c.arenas.join(', ')):''}</div><h2>${esc(c.name)}</h2><p class="subtitle">${esc(c.subtitle||c.traits?.join(' · ')||'')}</p><div class="detail-stats">${c.cost!=null?`<span>Cost <b>${c.cost}</b></span>`:''}${c.power!=null?`<span>Power <b>${c.power}</b></span>`:''}${c.hp!=null?`<span>HP <b>${c.hp}</b></span>`:''}</div><p class="rules">${esc(rules||'No printed rules text.')}</p>${!flipped&&c.epicAction?`<p class="rules">${esc(c.epicAction)}</p>`:''}${inspected.unitId==='marine'&&!state.finished?'<button class="action-primary" data-select>Attack with Battlefield Marine ↗</button>':''}<p class="detail-provenance">Original face image and printed metadata from the PTP card catalog. This sample position is not connected to Baize.</p></div></div>`;
}
function reset(){generation++;busy=false;selected=null;state=fixture();$('#turn-label').textContent='YOUR ACTION';$('#initiative-owner').textContent='◈  YOU HOLD INITIATIVE';$('#initiative-action').disabled=false;render();}
async function init(){
 const response=await fetch('real-board-data.json');if(!response.ok)throw Error('Card manifest '+response.status);catalog=await response.json();state=fixture();
 for(const u of state.units){const c=card(u.cardId);if(!c.arenas.map(a=>a.toLowerCase()).includes(u.arena))throw Error('Incorrect fixture arena '+u.id);}
 mountPreferences($('#table-preferences'));applyPreferences(readPreferences());
 render();window.addEventListener('tablepreferences',()=>requestAnimationFrame(drawArrow),eventOptions);
 document.addEventListener('click',e=>{
  const pile=e.target.closest('[data-discard]');if(pile){const seat=pile.dataset.discard;$('#discard-heading').textContent=(seat==='player'?'Your':'Opponent')+' discard pile';$('#discard-cards').innerHTML=state.players[seat].discardCards.map(id=>cardButton(id)).join('');$('#discard-dialog').showModal();return;}
  const close=e.target.closest('.dialog-close');if(close){close.closest('dialog').close();return}
  if(e.target.closest('[data-flip]')){flipped=!flipped;renderCardDetail();return}
  if(e.target.closest('[data-select]')){$('#card-dialog').close();selected=null;selectAttacker();return}
  const el=e.target.closest('[data-card]');if(!el)return;
  if(selected&&el.classList.contains('target')){void resolveAttack(el.dataset.unit);return}
  showCard(el.dataset.card,el.dataset.unit);
 },eventOptions);
 $('#primary-action').addEventListener('click',selectAttacker,eventOptions);
 $('#reset').addEventListener('click',reset,eventOptions);
 $('#initiative-action').addEventListener('click',()=>{if(busy||state.finished)return;selected=null;paintSelection();$('#initiative-owner').textContent='◈  YOU TOOK INITIATIVE';$('#turn-label').textContent='OPPONENT’S ACTION';$('#decision-text').textContent='Initiative preview only. Reset to return to the sample position.';$('#primary-action').disabled=true;$('#initiative-action').disabled=true;state.finished=true;},eventOptions);
 $('#settings-toggle').addEventListener('click',()=>$('#settings-dialog').showModal(),eventOptions);
 $('#history-toggle').addEventListener('click',()=>{$('#full-history').innerHTML=logHtml();$('#history-dialog').showModal()},eventOptions);
 $('#reduce-motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
 $('#reduce-motion').addEventListener('change',e=>document.body.classList.toggle('reduced',e.target.checked),eventOptions);
 $('#crowded').addEventListener('change',e=>{document.body.classList.toggle('crowded',e.target.checked);render()},eventOptions);
 $('#flat').addEventListener('change',e=>{document.body.classList.toggle('flat',e.target.checked);setTimeout(drawArrow,320)},eventOptions);
 const resize=new ResizeObserver(()=>requestAnimationFrame(drawArrow));resize.observe($('#battlefield'));
 window.addEventListener('pagehide',e=>{if(!e.persisted){generation++;abort.abort();resize.disconnect()}});
 window.addEventListener('pageshow',()=>requestAnimationFrame(drawArrow),eventOptions);
 // Expose a read-only evidence snapshot, never hidden cards or mutable state.
 window.boardEvidence=()=>({catalogSource:catalog.source,cardBackSource:catalog.backSource,unitCount:state.units.length,renderedUnits:document.querySelectorAll('[data-unit]').length,engineConnected:false,scripted:true});
 await document.fonts.ready;selectAttacker();
}
init().catch(error=>{console.error(error);$('#load-error').hidden=false});
