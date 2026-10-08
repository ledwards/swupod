import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

test('saved-deck bridge requires the gateway service credential and a currently eligible account',async t=>{
 const oldDatabase=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://localhost:1/lobby_test';t.after(()=>{if(oldDatabase===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDatabase});
 const previous=process.env.PURRGIL_HOST_SERVICE_KEY;process.env.PURRGIL_HOST_SERVICE_KEY='k'.repeat(40)
 t.after(()=>{if(previous===undefined)delete process.env.PURRGIL_HOST_SERVICE_KEY;else process.env.PURRGIL_HOST_SERVICE_KEY=previous})
 let reads=0
 t.mock.method(pg.Pool.prototype,'query',async(sql:string)=>{reads++;assert.match(sql,/SELECT is_admin,is_alpha_tester FROM users/);return {rows:[{is_admin:false,is_alpha_tester:false}]}})
 const {GET,POST}=await import('./route')
 const url='https://ptp.example/api/play/native/internal/lobby-decks?subject=00000000-0000-4000-8000-000000000001'
 for(const handler of [GET,POST]){
  assert.equal((await handler(new Request(url))).status,401)
  assert.equal(reads,handler===GET?0:1)
  assert.equal((await handler(new Request(url,{headers:{authorization:`Bearer ${'k'.repeat(40)}`}}))).status,403)
 }
 assert.equal(reads,2)
})
