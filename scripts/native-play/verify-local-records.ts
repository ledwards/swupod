import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { parse } from 'dotenv'

const directory = process.argv[2] ?? '/tmp/ptp-native-fullstack'
const env = parse(await readFile(`${directory}/fixture.env`,'utf8'))
const fixture = JSON.parse(await readFile(`${directory}/accounts.json`,'utf8'))
const host = env.PTP_PUBLIC_ORIGIN!, game = env.PURRGIL_PUBLIC_ORIGIN!
for (const value of [host,game,env.BAIZE_PVP_URL!,env.DATABASE_URL!]) if (!['127.0.0.1','localhost'].includes(new URL(value).hostname)) throw new Error('Only loopback fixture targets are permitted')
if (!new URL(env.DATABASE_URL!).pathname.startsWith('/ptp_native_fixture_')) throw new Error('Not an isolated fixture database')
class Browser {
  cookies = new Map<string,string>()
  constructor(public account: any) { this.cookies.set(account.cookie.name,account.cookie.value) }
  async request(url: string, method='GET', body?: unknown) {
    const target=new URL(url)
    assert.ok([host,game].includes(target.origin),'Unexpected redirect destination')
    const response=await fetch(target,{method,headers:{cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(method==='GET'?{}:{origin:target.origin,'content-type':'application/json'})},body:body===undefined?null:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)})
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0]!;const split=pair.indexOf('=');const name=pair.slice(0,split),value=pair.slice(split+1);if(value)this.cookies.set(name,value);else this.cookies.delete(name)}
    return response
  }
  async json(path: string, method='GET', body?:unknown, origin=host) {
    const response=await this.request(origin+path,method,body)
    assert.equal(response.status,200,`Unexpected HTTP status at ${new URL(origin+path).pathname}`)
    return response.json()
  }
  async launch(url:string) {
    let target=url, hops=0
    while(hops++<5){const response=await this.request(target);if(response.status===200)return;assert.equal(response.status,303,'Launch redirect failed');const location=response.headers.get('location');assert.ok(location,'Missing redirect');target=new URL(location,target).href}
    throw new Error('Too many launch redirects')
  }
}
const browsers=fixture.accounts.map((a:any)=>new Browser(a)) as [Browser,Browser]
const [one,two]=browsers
const waiting=await one.json('/api/play/native/public','POST',{poolShareId:one.account.poolShareId,requestId:randomUUID()})
assert.equal(waiting.status,'waiting')
const joined=await two.json('/api/play/native/public','POST',{poolShareId:two.account.poolShareId,requestId:randomUUID()})
assert.equal(joined.matchId,waiting.matchId);assert.equal(joined.status,'starting')
const match=joined.matchId
for(const browser of browsers){const grant=await browser.json(`/api/play/native/matches/${match}/launch`,'POST');await browser.launch(grant.launchUrl)}
assert.equal((await one.request(`${host}/api/play/native/matches/${match}/record`)).status,409)
let view=(await one.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
const actor=browsers[view.to_move]!
await actor.json('/api/action','POST',{step:view.step,index:0,commandId:randomUUID()},game)
view=(await one.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
await one.json('/api/concede','POST',{step:view.step,commandId:randomUUID()},game)
assert.equal((await two.json(`/api/play/native/matches/${match}`)).status,'complete')
const saved=await one.json(`/api/play/native/matches/${match}/record`)
assert.equal(saved.record.frames.length,3);assert.equal(saved.record.commands.length,2)
assert.equal(saved.recordHash,(await two.json(`/api/play/native/matches/${match}/record`)).recordHash)
assert.equal((await one.request(`${host}/api/play/native/matches/${match}/training`)).status,404)
const db=new pg.Client({connectionString:env.DATABASE_URL});await db.connect()
try {
 const stored=(await db.query('SELECT record_hash FROM ptp_native_game_records WHERE match_id=$1',[match])).rows
 assert.equal(stored.length,1);assert.equal(stored[0].record_hash,saved.recordHash)
 await assert.rejects(db.query("UPDATE ptp_native_game_records SET record_hash=repeat('a',64) WHERE match_id=$1",[match]))
 await db.query('UPDATE users SET is_admin=TRUE WHERE id=$1',[one.account.id])
 const training=await one.json(`/api/play/native/matches/${match}/training`)
 assert.equal(training.examples.length,1)
 const sample=training.examples[0],entry=saved.record.commands[0]
 assert.deepEqual(sample.observation,saved.record.frames[0].views[entry.seat].observation)
 assert.deepEqual(sample.selectedAction,entry.action)
 for(const field of ['setup','seed','frames','commands','opponentObservation'])assert.equal(field in sample,false)
} finally {await db.query('UPDATE users SET is_admin=FALSE WHERE id=$1',[one.account.id]);await db.end()}
const internal=`${host}/api/play/native/internal/records/${match}?subject=${one.account.id}`
assert.equal((await fetch(internal)).status,401)
assert.equal((await fetch(`${host}/api/play/native/internal/records/${match}?subject=${randomUUID()}`,{headers:{authorization:`Bearer ${env.PURRGIL_HOST_SERVICE_KEY}`}})).status,404)
for(const browser of browsers){
 const grant=await browser.json(`/api/play/native/matches/${match}/replay-launch`,'POST');await browser.launch(grant.launchUrl)
 assert.equal((await browser.json('/api/session','GET',undefined,game)).mode,'replay')
 const replay=await browser.json('/api/replay','GET',undefined,game)
 assert.equal(replay.frames.length,3)
 for(const field of ['setup','seed','commands'])assert.equal(field in replay,false)
 assert.equal((await browser.request(game+'/api/game')).status,403)
 assert.equal((await browser.request(game+'/api/action','POST',{step:0,index:0,commandId:randomUUID()})).status,403)
}
console.log(JSON.stringify({passed:true,matchId:match,checks:['public-find-pair','real-action','terminal-only-record','both-seat-archive','immutable-idempotent-archive','admin-only-training','pre-action-training-privacy','internal-auth-membership','both-seat-replay','replay-mutation-denied']}))
