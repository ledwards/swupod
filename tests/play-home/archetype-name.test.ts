import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archetypeName,archetypeFormat} from '../../play-home/home/archetype';
test('canonical nicknames retain set tags, use format and recover after API failure',async()=>{
 const original=globalThis.fetch;const calls:string[]=[];let fail=true;
 globalThis.fetch=(async(url)=>{calls.push(String(url));return fail?new Response('',{status:503}):Response.json({nickname:'Lando (LAW) Blue 30'});}) as typeof fetch;
 try{
  assert.equal(await archetypeName('LAW_018','HMW_020','premier'),null);
  fail=false;
  assert.equal(await archetypeName('LAW_018','HMW_020','premier'),'Lando (LAW) Blue 30');
  assert.equal(await archetypeName('LAW-018','HMW-020','premier'),'Lando (LAW) Blue 30');
  assert.equal(calls.length,2);assert.match(calls[1],/format=Premier/);
  assert.equal(archetypeFormat('HMW · Sealed · 6 packs'),'limited');
  assert.equal(await archetypeName('missing','HMW_020','limited'),null);
 }finally{globalThis.fetch=original;}
});
