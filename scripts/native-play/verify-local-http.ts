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
const invitation=await one.json('/api/play/native/invitations','POST',{poolShareId:one.account.poolShareId,requestId:randomUUID(),allowMismatch:false})
const invitePath=`/api/play/native/invitations/${invitation.token}`
const metadata=await two.json(invitePath)
assert.equal(metadata.setCode,'SOR');assert.equal(metadata.packCount,6)
const joined=await two.json(invitePath,'POST',{poolShareId:two.account.poolShareId})
const match=joined.matchId
assert.equal((await one.json(`/api/play/native/matches/${match}`)).status,'starting')
// A copied seat-zero launch must not become a game session in the other PTP browser.
const badGrant=await one.json(`/api/play/native/matches/${match}/launch`,'POST')
const wrongBrowser=new Browser(two.account)
const pending=await wrongBrowser.request(badGrant.launchUrl)
assert.equal(pending.status,303)
const unauthorized=await wrongBrowser.request(pending.headers.get('location')!)
assert.ok(unauthorized.status>=400,'Copied launch was incorrectly authorized for a different host user')
assert.equal((await wrongBrowser.request(game+'/api/session')).status,401)
for(const [seat,browser] of browsers.entries()){
  const grant=await browser.json(`/api/play/native/matches/${match}/launch`,'POST')
  await browser.launch(grant.launchUrl)
  const session=await browser.json('/api/session','GET',undefined,game)
  assert.equal(session.seat,seat);assert.equal(session.matchId,match)
  assert.equal(session.returnUrl,`${host}/play/native?match=${match}`)
}
let view=(await one.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
const active=browsers[view.to_move]
assert.ok(active,'Expected a human actor')
const activeView=(await active.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
assert.ok(activeView.actions?.length,'Expected a legal human action')
const command={step:activeView.step,index:0,commandId:randomUUID()}
const acted=await active.json('/api/action','POST',command,game)
const retried=await active.json('/api/action','POST',command,game)
assert.equal(acted.messages[0].step,retried.messages[0].step,'Retried action applied twice')
view=(await one.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
await one.json('/api/concede','POST',{step:view.step,commandId:randomUUID()},game)
const completed=await two.json(`/api/play/native/matches/${match}`)
assert.equal(completed.status,'complete');assert.equal(completed.result,'player2')
assert.equal((await one.json(`/api/play/native/matches/${match}/rematch`,'POST',{accept:true})).status,'waiting')
const rematch=await two.json(`/api/play/native/matches/${match}/rematch`,'POST',{accept:true})
assert.equal(rematch.status,'ready');assert.notEqual(rematch.matchId,match)
const db=new pg.Client({connectionString:env.DATABASE_URL})
await db.connect()
try{
  const before=await db.query('SELECT seat,deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 ORDER BY seat',[match])
  const after=await db.query('SELECT seat,deck_version_id FROM ptp_native_match_seats WHERE match_id=$1 ORDER BY seat',[rematch.matchId])
  assert.deepEqual(after.rows,before.rows,'Rematch changed frozen decks')
}finally{await db.end()}
for(const browser of browsers){const grant=await browser.json(`/api/play/native/matches/${rematch.matchId}/launch`,'POST');await browser.launch(grant.launchUrl)}
const secondView=(await two.json('/api/game','GET',undefined,game)).messages.find((m:any)=>m.type==='view')
await two.json('/api/concede','POST',{step:secondView.step,commandId:randomUUID()},game)
assert.equal((await one.json(`/api/play/native/matches/${rematch.matchId}`)).result,'player1')
await one.json('/api/auth/signout','POST')
assert.equal((await one.request(game+'/api/session')).status,401,'Logout did not revoke the game session')
console.log(JSON.stringify({passed:true,checks:['two-host-users','private-join','browser-bound-launch','wrong-user-rejected','real-human-action','duplicate-command','authoritative-result','mutual-rematch','identical-deck-versions','logout-revocation'],matchId:match,rematchId:rematch.matchId}))
