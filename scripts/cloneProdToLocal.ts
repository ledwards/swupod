// Clone the FULL production database into your LOCAL dev database — the one the
// local Next dev server reads (DATABASE_URL in .env.local). Use this when you
// need to verify pages against real data and a single copied user isn't enough.
//
// This OVERWRITES your local dev DB. It backs the local DB up first.
//
// Usage:
//   npm run clone-prod-to-local           # prompts for confirmation
//   npm run clone-prod-to-local -- --yes  # skip the prompt
//
//   SOURCE (prod, read)  = PROD_DATABASE_URL or DATABASE_URL in .env
//   TARGET (local, written) = DATABASE_URL in .env.local
//
// Requires pg_dump and psql on PATH (same as scripts/clone-prod-to-dev.sh).

import { parse } from 'dotenv'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { spawnSync } from 'child_process'
import { createInterface } from 'readline'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvFile(name: string): Record<string, string> {
  const p = join(ROOT, name)
  return existsSync(p) ? parse(readFileSync(p)) : {}
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim() === 'yes') }))
}

async function main() {
  const envBase = readEnvFile('.env')
  const envLocal = readEnvFile('.env.local')
  const PROD = process.env.PROD_DATABASE_URL || envBase.PROD_DATABASE_URL || envBase.DATABASE_URL
  const LOCAL = process.env.TARGET_DATABASE_URL || envLocal.DATABASE_URL

  if (!PROD) throw new Error('No prod source URL. Set PROD_DATABASE_URL or DATABASE_URL in .env.')
  if (!LOCAL) throw new Error('No local target URL. Set DATABASE_URL in .env.local.')
  if (PROD === LOCAL) throw new Error('Refusing to run: source and target URLs are identical.')

  console.log(`SOURCE (prod):  ${redact(PROD)}`)
  console.log(`TARGET (local): ${redact(LOCAL)}`)

  const skip = process.argv.includes('--yes') || process.argv.includes('-y')
  if (!skip) {
    const ok = await confirm('\n⚠️  This OVERWRITES your local dev DB with prod data. Type "yes" to proceed: ')
    if (!ok) { console.log('Cancelled.'); return }
  }

  const backupDir = join(ROOT, '.backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = join(backupDir, `local_backup_${stamp}.sql`)
  const dumpFile = join('/tmp', `swupod_prod_dump_${stamp}.sql`)

  const run = (cmd: string, args: string[], outFile?: string) => {
    console.log(`\n$ ${cmd} ${args.map((a) => (a.includes('@') ? redact(a) : a)).join(' ')}`)
    const r = spawnSync(cmd, args, {
      stdio: outFile ? ['inherit', require('fs').openSync(outFile, 'w'), 'inherit'] : 'inherit',
      encoding: 'utf8',
    })
    if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`)
  }

  console.log('\n💾 Backing up local dev DB…')
  run('pg_dump', ['--no-owner', '--no-acl', LOCAL], backupFile)
  console.log(`   saved ${backupFile}`)

  console.log('\n📥 Dumping production…')
  run('pg_dump', ['--no-owner', '--no-acl', PROD], dumpFile)

  console.log('\n📤 Restoring into local dev (drops & recreates public schema)…')
  run('psql', [LOCAL, '-v', 'ON_ERROR_STOP=0', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'])
  run('psql', [LOCAL, '-v', 'ON_ERROR_STOP=0', '-f', dumpFile])

  console.log('\n✅ Local dev DB now mirrors production.')
  console.log(`   Restore the old local DB later with:`)
  console.log(`     psql "$DATABASE_URL" < ${backupFile}`)
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
