import pg from 'pg'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse } from 'dotenv'

// Only a Unix-socket local database created by this invocation is ever written.
const args = process.argv.slice(2)
const value = (key: string) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1] }
const gatewayEnv = value('--gateway-env'), supportPath = value('--support')
if (!gatewayEnv || !supportPath) throw new Error('Usage: --gateway-env PRIVATE_ENV --support MANIFEST [--directory .native-local]')
const directory = resolve(value('--directory') ?? '.native-local')
const database = `ptp_native_fixture_${randomUUID().replaceAll('-', '')}`
const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
await admin.connect()
await admin.query(`CREATE DATABASE ${database}`)
await admin.end()
const connection = new pg.Client({ host: '/tmp', database })
await connection.connect()
let completed = false
try {
  await connection.query(`CREATE TABLE users (id UUID PRIMARY KEY,auth_version INTEGER DEFAULT 1,username TEXT,email TEXT,avatar_url TEXT,discord_id TEXT,is_admin BOOLEAN DEFAULT FALSE,is_beta_tester BOOLEAN DEFAULT TRUE);
    CREATE TABLE card_pools (id UUID PRIMARY KEY,user_id UUID,share_id TEXT UNIQUE,parent_pool_id UUID,pod_id UUID,set_code TEXT,set_name TEXT,pool_type TEXT,name TEXT,cards JSONB,packs JSONB,box_packs JSONB,pack_indices INTEGER[],is_public BOOLEAN DEFAULT FALSE,deck_builder_state JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`)
  const trackingSchema = (await readFile('migrations/014_card_generations.sql','utf8')).replace('card_id VARCHAR(20)','card_id TEXT').replace('source_id INTEGER','source_id UUID')
  await connection.query(trackingSchema)
  await connection.query('ALTER TABLE card_generations ADD COLUMN IF NOT EXISTS pack_index INTEGER, ADD COLUMN IF NOT EXISTS user_id UUID')
  for (const file of ['074_create_ptp_play_runtime.sql','075_add_forceteki_seat_launch_urls.sql','096_native_deck_versions.sql','097_native_private_matches.sql','098_native_reconciliation.sql','099_native_mutual_rematches.sql','100_solo_sealed_generation.sql','101_native_public_matches.sql','102_native_game_records.sql']) await connection.query(await readFile(join(process.cwd(),'migrations',file),'utf8'))
  const secrets = parse(await readFile(gatewayEnv,'utf8'))
  const env: Record<string,string> = { NODE_ENV:'development', PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:process.env.USER!,PGDATABASE:database,PGPASSWORD:'', DATABASE_URL:`postgresql://${process.env.USER}@127.0.0.1:5432/${database}`, POSTGRES_URL:`postgresql://${process.env.USER}@127.0.0.1:5432/${database}`,JWT_SECRET:randomBytes(48).toString('hex'),PTP_NATIVE_PLAY_ENABLED:'true', BAIZE_PVP_URL:'http://127.0.0.1:4321',BAIZE_PVP_SERVICE_KEY:secrets.BAIZE_PVP_SERVICE_KEY!,PURRGIL_INTERNAL_URL:'http://127.0.0.1:4396',PURRGIL_HOST_SERVICE_KEY:(secrets.PURRGIL_HOST_SERVICE_KEY ?? secrets.HOST_SERVICE_KEY)!,PURRGIL_PUBLIC_ORIGIN:'http://127.0.0.1:4396',PTP_PUBLIC_ORIGIN:'http://127.0.0.1:4395',PTP_NATIVE_INVITE_KEY:randomBytes(48).toString('hex'),PTP_NATIVE_SUPPORT_PATH:resolve(supportPath),NEXT_DIST_DIR:'.next-native-fixture',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:4395',SITE_URL:'http://127.0.0.1:4395' }
  if (!env.BAIZE_PVP_SERVICE_KEY || !env.PURRGIL_HOST_SERVICE_KEY) throw new Error('Gateway environment lacks local service credentials')
  Object.assign(process.env,env)
  const { createToken } = await import('../../lib/auth')
  const catalog = JSON.parse(await readFile('src/data/cards.json','utf8')).cards
  const support = JSON.parse(await readFile(supportPath,'utf8'))
  const getCard = (id:string) => {
    const candidates = support.cards.filter((c:any)=>c.engineId===id)
    const card = catalog.find((c:any)=>c.variantType==='Normal' && candidates.some((mapping:any)=>mapping.ptpId===c.id))
    if (!card || !support.supportedCardIds.includes(id)) throw new Error(`Missing supported fixture card ${id}`)
    return card
  }
  const leader = getCard('SOR_005'), base = getCard('SOR_023'), unit = getCard('SOR_095')
  const accounts=[]
  for (let seat=0;seat<2;seat++) {
    const id=randomUUID(),poolId=randomUUID(),shareId=`native-fixture-${seat}-${randomBytes(4).toString('hex')}`
    const username=`Native Fixture ${seat+1}`, email=`native-fixture-${seat}@example.invalid`
    const cards=[leader,...Array.from({length:30},()=>unit)]
    const state={activeLeader:'leader',activeBase:'base',poolName:`SOR Native Fixture ${seat+1}`,cardPositions:{leader:{section:'leader',enabled:true,visible:true,card:leader},base:{section:'base',enabled:true,visible:true,card:base},...Object.fromEntries(Array.from({length:30},(_,i)=>[`unit-${i}`,{section:'deck',enabled:true,visible:true,card:unit}]))}}
    await connection.query('INSERT INTO users(id,username,email) VALUES($1,$2,$3)',[id,username,email])
    await connection.query("INSERT INTO card_pools(id,user_id,share_id,set_code,set_name,pool_type,name,cards,deck_builder_state) VALUES($1,$2,$3,'SOR','Spark of Rebellion','sealed',$4,$5,$6)",[poolId,id,shareId,state.poolName,JSON.stringify(cards),JSON.stringify(state)])
    await connection.query("INSERT INTO ptp_native_pool_evidence(source_pool_id,owner_user_id,set_code,pool_type,pack_count,cards) VALUES($1,$2,'SOR','sealed',6,$3)",[poolId,id,JSON.stringify(cards)])
    accounts.push({id,username,poolShareId:shareId,cookie:{name:'swupod_session',value:createToken({id,username,email,auth_version:1,is_beta_tester:true}),url:env.PTP_PUBLIC_ORIGIN,httpOnly:true,sameSite:'Lax'}})
  }
  await mkdir(directory,{recursive:true,mode:0o700})
  await writeFile(join(directory,'fixture.env'),Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600})
  await writeFile(join(directory,'accounts.json'),JSON.stringify({database,accounts},null,2)+'\n',{mode:0o600})
  completed = true
  console.log(JSON.stringify({database,directory,accountFile:join(directory,'accounts.json'),envFile:join(directory,'fixture.env'),hostOrigin:env.PTP_PUBLIC_ORIGIN,gatewayOrigin:env.PURRGIL_PUBLIC_ORIGIN}))
} finally {
  await connection.end()
  if (!completed) { const cleanup = new pg.Client({host:'/tmp',database:'postgres'}); await cleanup.connect(); await cleanup.query(`DROP DATABASE ${database} WITH (FORCE)`); await cleanup.end() }
}
