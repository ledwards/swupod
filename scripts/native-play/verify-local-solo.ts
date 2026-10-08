import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { parse } from 'dotenv'

const directory=process.argv[2]??'/tmp/ptp-native-fullstack'
const env=parse(await readFile(`${directory}/fixture.env`,'utf8'))
for(const value of [env.PTP_PUBLIC_ORIGIN!,env.DATABASE_URL!]) if(!['localhost','127.0.0.1'].includes(new URL(value).hostname)) throw new Error('Only loopback fixture targets are allowed')
if(!new URL(env.DATABASE_URL!).pathname.startsWith('/ptp_native_fixture_'))throw new Error('Not an isolated fixture database')
Object.assign(process.env,env)
const {createToken}=await import('../../lib/auth')
const db=new pg.Client({connectionString:env.DATABASE_URL})
await db.connect()
try{
  // Separate users: running this does not alter the root browser-test accounts.
  const users=[randomUUID(),randomUUID()]
  for(const id of users)await db.query('INSERT INTO users(id,username,email) VALUES($1,$2,$3)',[id,'Synthetic Solo Fixture',`${id}@example.invalid`])
  const cookies=users.map(id=>`swupod_session=${createToken({id,username:'Synthetic Solo Fixture',email:`${id}@example.invalid`,is_beta_tester:true,auth_version:1})}`)
  async function post(body:unknown,cookie=cookies[0]!) {
    return fetch(`${env.PTP_PUBLIC_ORIGIN}/api/sealed/generate`,{method:'POST',headers:{origin:env.PTP_PUBLIC_ORIGIN!,'content-type':'application/json',cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  }
  const request={action:'prepare',setCode:'SOR',packCount:6,requestId:randomUUID()}
  assert.equal((await post(request,'')).status,401)
  const prepared=await post(request);assert.equal(prepared.status,200,'Server preparation failed')
  const generation=await prepared.json()
  assert.equal(generation.boxPacks.length,24)
  const repeated=await post(request);assert.equal(repeated.status,200)
  assert.equal((await repeated.json()).generationId,generation.generationId)
  const finalize={action:'finalize',generationId:generation.generationId,windowStart:0}
  assert.equal((await post(finalize,cookies[1]!)).status,404,'Another user finalized this generation')
  assert.equal((await post({...finalize,cards:[{id:'injected'}]})).status,400,'Browser card injection was accepted')
  const response=await post(finalize);assert.equal(response.status,200,'Finalization failed')
  const pool=await response.json()
  assert.equal(pool.packs.length,6)
  const result=await db.query('SELECT p.id,p.user_id,p.cards,e.cards AS evidence,e.pack_count FROM card_pools p JOIN ptp_native_pool_evidence e ON e.source_pool_id=p.id WHERE p.share_id=$1',[pool.shareId])
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].user_id,users[0]);assert.equal(result.rows[0].pack_count,6)
  assert.deepEqual(result.rows[0].cards,result.rows[0].evidence)
  const selectedIds=generation.boxPacks.slice(0,6).flatMap((pack:any)=>pack.cards.map((card:any)=>card.id))
  assert.deepEqual(result.rows[0].cards.map((card:any)=>card.id),selectedIds)
  assert.equal((await post(finalize)).status,200,'Identical finalization retry failed')
  assert.equal((await post({...finalize,windowStart:1})).status,409,'A second window replaced the immutable saved selection')
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM card_pools WHERE id=$1',[generation.generationId])).rows[0].count,1)
  let tracked = 0
  for (let attempt=0;attempt<30;attempt++) {
    tracked=(await db.query('SELECT COUNT(*)::int AS count FROM card_generations WHERE source_id=$1',[generation.generationId])).rows[0].count
    if(tracked>=selectedIds.length)break
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.equal(tracked,selectedIds.length,'Finalization retries must track each generated card exactly once')
  console.log(JSON.stringify({passed:true,checks:['normal-auth','server-24-pack-box','prepare-idempotency','owner-isolation','card-injection-rejected','six-pack-finalization','immutable-evidence','same-window-retry','changed-window-rejected','generation-tracking-once'],poolShareId:pool.shareId}))
}finally{await db.end()}
