/**
 * Migration 086: publish Leebo as the first creator voice pack.
 *
 * WHY A JS MIGRATION
 * ==================
 * Leebo used to ship as static files under public/, with the app special-casing him
 * as a "built-in" that only Friends of the Pod could hear. He is not special: he is
 * the first creator pack, and the creator is Protect the Pod. That means a row in
 * voice_packs, ten rows in voice_pack_assets, and a code — exactly what the creator
 * upload form produces. Getting there means reading eleven files off disk and writing
 * them as bytea, which SQL alone cannot do.
 *
 * WHERE THE BYTES LIVE
 * ====================
 * migrations/assets/leebo/ — deliberately NOT public/. The clips have to stay in the
 * repo (this migration re-runs from zero on any fresh database, including disaster
 * recovery), but leaving them under public/ would have kept every one of them
 * downloadable at a guessable URL, which is a strange thing to do to a pack you now
 * have to redeem a code for. After this runs, Leebo's audio reaches a listener only
 * through /api/voice-packs/[id]/asset/[clip], like every other creator pack.
 *
 * IDEMPOTENCY
 * ===========
 * - The pack is INSERT ... ON CONFLICT (code) DO NOTHING, so a second run finds the
 *   existing row and adds nothing.
 * - Clips are ON CONFLICT (pack_id, clip_type) DO NOTHING, so a rerun never clobbers
 *   audio the creator has since re-recorded through their edit link, but DOES fill a
 *   slot that is somehow missing.
 * - Every file is read and validated BEFORE the first write. A missing or empty file
 *   aborts the migration with a clear message rather than leaving a half-published
 *   pack that plays silence at a real table — the deploy stops, which is correct,
 *   because a file missing from the image means the image is broken.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'leebo')

/**
 * The clip slots as they existed WHEN THIS MIGRATION WAS WRITTEN — deliberately a
 * literal, not an import of VOICE_PACK_CLIP_TYPES.
 *
 * A migration runs against the schema of its own moment. Importing the live list
 * made this one seed whatever clips the app currently knows about, against a CHECK
 * constraint that only allows the ones migration 083 permitted — so the day
 * `next-pick` was added to the app, a fresh database stopped being able to migrate
 * from zero. Later clips are added by their own later migration (087 widens the
 * constraint, 088 writes the audio), which is the only ordering that can work.
 */
const CLIPS_AT_086 = [
  'greeting',
  'ready-the-draft',
  'start-the-draft',
  'count-30',
  'count-15',
  'count-5',
  'time-is-up',
  'sound-on',
  'timer-paused',
  'timer-resumed',
]

/** What the creator form would have submitted, had Protect the Pod used it. */
const PACK = {
  code: 'LEEBO',
  displayName: 'Leebo',
  creatorName: 'Protect the Pod',
  logoFile: 'logo.png',
  logoMime: 'image/png',
  clipMime: 'audio/mpeg',
}

function readAsset(fileName) {
  const path = join(ASSET_DIR, fileName)
  if (!existsSync(path)) {
    throw new Error(`086: missing Leebo asset ${path} — cannot publish a half-filled pack`)
  }
  const bytes = readFileSync(path)
  if (bytes.length === 0) {
    throw new Error(`086: Leebo asset ${path} is empty`)
  }
  return bytes
}

export async function run(client) {
  console.log('   Publishing Leebo as the first creator voice pack (code LEEBO)')

  // Read everything first: no partial publish.
  const logo = readAsset(PACK.logoFile)
  const clips = CLIPS_AT_086.map((clip) => ({
    clip,
    bytes: readAsset(`${clip}.mp3`),
  }))
  console.log(`   Read ${clips.length} clips + logo from ${ASSET_DIR}`)

  await client.query(
    `INSERT INTO voice_packs (code, display_name, creator_name, logo, logo_mime, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW())
     ON CONFLICT (code) DO NOTHING`,
    [PACK.code, PACK.displayName, PACK.creatorName, logo, PACK.logoMime]
  )

  const packRes = await client.query('SELECT id FROM voice_packs WHERE code = $1', [PACK.code])
  const packId = packRes.rows[0]?.id
  if (!packId) throw new Error('086: Leebo pack row missing immediately after insert')

  let inserted = 0
  for (const { clip, bytes } of clips) {
    const res = await client.query(
      `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (pack_id, clip_type) DO NOTHING`,
      [packId, clip, bytes, PACK.clipMime, bytes.length]
    )
    inserted += res.rowCount ?? 0
  }

  console.log(`   Pack ${packId}: ${inserted} clip(s) inserted, ${clips.length - inserted} already present`)
}
