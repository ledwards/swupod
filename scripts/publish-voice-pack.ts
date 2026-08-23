/**
 * Publish a locally-built voice pack into a database.
 *
 * generate-voice-clips.ts produces the audio; this puts it in voice_packs /
 * voice_pack_assets so it can actually be redeemed and played. It is the same shape
 * migration 086 uses for Leebo, minus the migration — for packs you are still
 * iterating on, a migration is the wrong tool because it runs once and everywhere.
 *
 * Usage:
 *   npx tsx scripts/publish-voice-pack.ts --dir migrations/assets/mask \
 *     --code VADER --name Vader --creator "Protect the Pod"
 *   npx tsx scripts/publish-voice-pack.ts ... --replace   # overwrite existing clips
 *
 * The logo is picked up from <dir>/logo.png unless --logo says otherwise.
 *
 * SAFETY: refuses any non-local database. POSTGRES_URL is what actually selects the
 * database — no flag here does — so the check is on the host we are about to write
 * to, exactly as scripts/migrate.ts decides whether to demand confirmation. To
 * publish somewhere remote, write a migration instead: that is reviewable, ordered
 * and runs in the deploy.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import * as dotenv from 'dotenv'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  normalizeVoicePackName,
  PTP_CREATOR_NAME,
} from '../src/services/voicePacks'

dotenv.config({ path: './.env' })
// NOTE: `override: true` means .env.local beats anything already exported in the
// shell — so `POSTGRES_URL=... npx tsx scripts/publish-voice-pack.ts` does NOT do
// what it looks like it does; .env.local wins. That is the repo convention (see
// scripts/eval-pipelines.ts) and it is kept, but it means the guard below protects
// against a .env.local pointing somewhere remote, not against a shell override.
dotenv.config({ path: './.env.local', override: true })

const CLIP_MIME = 'audio/mpeg'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** True when the connection string points anywhere but this machine. */
function looksRemote(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname.toLowerCase()
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local'))
  } catch {
    return true // unparseable: assume the riskier answer
  }
}

async function main(): Promise<void> {
  const dir = arg('dir')
  const rawCode = arg('code')
  const displayName = normalizeVoicePackName(arg('name'))
  const creatorName = arg('creator') ?? PTP_CREATOR_NAME
  const replace = process.argv.includes('--replace')

  if (!dir || !rawCode || !displayName) {
    console.error('Usage: --dir <asset dir> --code <CODE> --name <display name> [--creator <name>] [--replace]')
    process.exit(1)
  }
  const code = normalizeVoicePackCode(rawCode)
  if (!isValidVoicePackCode(code)) {
    console.error(`"${rawCode}" is not a valid pack code once normalized ("${code}").`)
    process.exit(1)
  }

  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('POSTGRES_URL is not set.')
    process.exit(1)
  }
  if (looksRemote(connectionString)) {
    const host = (() => { try { return new URL(connectionString).hostname } catch { return 'unparseable' } })()
    console.error(`Refusing to publish: POSTGRES_URL points at "${host}", which is not local.`)
    console.error('Seed a remote database with a migration, not this script.')
    process.exit(1)
  }

  // The logo the /redeem page leads with. Optional here (unlike migration 090, which
  // requires it) because a pack mid-iteration often has audio before it has art.
  const logoPath = arg('logo') ?? join(dir, 'logo.png')
  const logo = existsSync(logoPath) ? readFileSync(logoPath) : null
  if (logo && logo.length === 0) throw new Error(`empty logo: ${logoPath}`)

  // Read and validate EVERYTHING before the first write, so a missing file cannot
  // leave a half-published pack that plays silence at a real table.
  const clips = VOICE_PACK_CLIP_TYPES.map((clip) => {
    const file = join(dir, `${clip}.mp3`)
    if (!existsSync(file)) throw new Error(`missing clip: ${file}`)
    const audio = readFileSync(file)
    if (audio.length === 0) throw new Error(`empty clip: ${file}`)
    return { clip, audio }
  })

  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query<{ id: string }>('SELECT id FROM voice_packs WHERE code = $1', [code])
    let packId: string
    if (existing.rows.length > 0) {
      packId = existing.rows[0].id
      // Only overwrite the logo when one was actually found — re-publishing a pack
      // whose art lives only in the database must not blank it.
      await client.query(
        logo
          ? `UPDATE voice_packs SET display_name = $2, creator_name = $3, logo = $4, logo_mime = $5,
               status = 'active', updated_at = NOW() WHERE id = $1`
          : `UPDATE voice_packs SET display_name = $2, creator_name = $3,
               status = 'active', updated_at = NOW() WHERE id = $1`,
        logo ? [packId, displayName, creatorName, logo, 'image/png'] : [packId, displayName, creatorName]
      )
      console.log(`Pack ${code} already existed — updated it (${packId}).`)
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO voice_packs (code, display_name, creator_name, logo, logo_mime, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW())
         RETURNING id`,
        [code, displayName, creatorName, logo, logo ? 'image/png' : null]
      )
      packId = inserted.rows[0].id
      console.log(`Created pack ${code} (${packId}).`)
    }

    let written = 0
    let kept = 0
    for (const { clip, audio } of clips) {
      const result = await client.query(
        `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (pack_id, clip_type) DO ${
           // Default is non-destructive, matching 086: a rerun must never clobber
           // audio a creator re-recorded through their edit link.
           replace
             ? 'UPDATE SET audio = EXCLUDED.audio, audio_mime = EXCLUDED.audio_mime, byte_size = EXCLUDED.byte_size, updated_at = NOW()'
             : 'NOTHING'
         }
         RETURNING id`,
        [packId, clip, audio, CLIP_MIME, audio.length]
      )
      if (result.rowCount && result.rowCount > 0) written += 1
      else kept += 1
    }
    await client.query('COMMIT')
    console.log(`${written} clip(s) written, ${kept} left alone${replace ? '' : ' (pass --replace to overwrite)'}.`)
    console.log(logo ? `Logo set from ${logoPath} (${logo.length} bytes).` : 'No logo found — pack will show a blank tile.')
    console.log(`Redeem it at /redeem with code: ${code}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
