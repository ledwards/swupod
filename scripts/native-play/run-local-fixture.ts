import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { parse } from 'dotenv'
const path = process.argv[2]
if (!path) throw new Error('Pass the private fixture.env path')
const env = parse(await readFile(path,'utf8'))
const database = new URL(env.DATABASE_URL ?? '')
if (!['localhost','127.0.0.1'].includes(database.hostname) || !database.pathname.startsWith('/ptp_native_fixture_')) throw new Error('Only an isolated local native fixture database is allowed')
// Run Next directly: server.ts intentionally reloads shared .env with override:true.
// The fixture never runs those potentially unrelated configuration loaders/migrations.
const child = spawn(process.execPath,[createRequire(import.meta.url).resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','4395'],{env:{...process.env,...env},stdio:'inherit'})
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exit(code??1))
