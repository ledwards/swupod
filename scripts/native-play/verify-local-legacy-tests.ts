/** Disposable Unix-socket PostgreSQL only; never uses application credentials. */
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
const name=`ptp_legacy_tests_${randomUUID().replaceAll('-','')}`
const admin=new pg.Client({host:'/tmp',database:'postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${name}`)
const db=new pg.Client({host:'/tmp',database:name});await db.connect()
try{
  await db.query(`CREATE TABLE users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),username TEXT,discord_id TEXT,email TEXT);
    CREATE TABLE card_pools(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,share_id TEXT UNIQUE,set_code TEXT,set_name TEXT,pool_type TEXT,cards JSONB,deck_builder_state JSONB,wins INT DEFAULT 0,losses INT DEFAULT 0,draws INT DEFAULT 0,wayfinder_match_ids TEXT[],updated_at TIMESTAMPTZ DEFAULT NOW());`)
  for(const file of ['031_create_built_decks.sql','071_create_casual_matches.sql','073_casual_matches_pool_scoped.sql','076_create_open_games.sql','077_add_best_of_to_open_games.sql','079_add_karabast_findable_to_open_games.sql'])await db.query(await readFile(`migrations/${file}`,'utf8'))
  const code=await new Promise<number|null>(resolve=>{
    const child=spawn(process.execPath,['--import','tsx','--test','src/services/openGames.test.ts','src/services/openGameLive.test.ts','src/services/play/legacyRetirement.test.ts','src/services/play/legacyRetirement.db.test.ts'],{stdio:'inherit',env:{...process.env,PGHOST:'localhost',PGPORT:'5432',SWUPOD_TEST_DATABASE_URL:`postgresql://${process.env.USER}@localhost:5432/${name}`,NATIVE_LOCAL_DB_TEST:'1'}})
    child.on('exit',resolve)
  });if(code!==0)throw new Error('Legacy retirement regression tests failed')
  // Node's --test glob expansion treats bracketed Next route segments as patterns.
  const routeCode=await new Promise<number|null>(resolve=>{
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',"await import('./app/api/plugin/v1/play/[format]/[shareId]/route.test.ts')"],{stdio:'inherit'})
    child.on('exit',resolve)
  });if(routeCode!==0)throw new Error('Retired plugin metadata test failed')
}finally{await db.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end()}
