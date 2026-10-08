/**
 * Migration 090: publish Vader as a Protect the Pod voice pack.
 *
 * WHY A MIGRATION AND NOT scripts/publish-voice-pack.ts
 * =====================================================
 * That script exists for packs still being iterated on, and it deliberately refuses
 * any non-local database. Production audio has to arrive the way Leebo's did: in the
 * repo, applied by an ordered migration that re-runs from zero on a fresh database,
 * including disaster recovery. A one-off script against production leaves bytes that
 * exist in exactly one place and are in no commit.
 *
 * WHERE THE BYTES LIVE
 * ====================
 * migrations/assets/mask/ — deliberately NOT public/, for the same reason as Leebo:
 * a pack you have to redeem a code for should not also sit at a guessable URL. After
 * this runs, the audio reaches a listener only through
 * /api/voice-packs/[id]/asset/[clip].
 *
 * The clips are built by `npm run voice:generate -- --all-clips --pack mask`. The
 * voice, the filter chain and the reasoning behind both are in
 * scripts/generate-voice-clips.ts.
 *
 * IDEMPOTENCY
 * ===========
 * - The pack is INSERT ... ON CONFLICT (code) DO NOTHING.
 * - Clips are ON CONFLICT (pack_id, clip_type) DO NOTHING, so a rerun never clobbers
 *   audio since re-recorded through an edit link, but DOES fill a missing slot.
 * - Every file is read and validated BEFORE the first write. A missing or empty file
 *   aborts rather than half-publishing a pack that plays silence at a real table —
 *   the deploy stops, which is correct, because a file missing from the image means
 *   the image is broken.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'mask')
const CLIP_MIME = 'audio/mpeg'

const PACK = {
  code: 'VADER',
  displayName: 'Vader',
  creatorName: 'Protect the Pod',
  logoFile: 'logo.png',
  logoMime: 'image/png',
}

/**
 * The clip slots as they exist WHEN THIS MIGRATION IS WRITTEN — deliberately a
 * literal, not an import of VOICE_PACK_CLIP_TYPES.
 *
 * 086 learned this the hard way: importing the live list made it seed whatever clips
 * the app currently knew about, against a CHECK constraint that only allowed the ones
 * migration 083 had permitted — so the day `next-pick` was added, a fresh database
 * stopped being able to migrate from zero. All eleven below are allowed as of 087.
 */
const CLIPS_AT_090 = [
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
  'next-pick',
]

export async function run(client) {
  // Read and validate everything first — see IDEMPOTENCY above.
  const logoPath = join(ASSET_DIR, PACK.logoFile)
  if (!existsSync(logoPath)) {
    throw new Error(`090: missing ${logoPath} — the redeem page leads with this logo.`)
  }
  const logo = readFileSync(logoPath)
  if (logo.length === 0) throw new Error(`090: ${logoPath} is empty`)

  const clips = CLIPS_AT_090.map((clipType) => {
    const file = join(ASSET_DIR, `${clipType}.mp3`)
    if (!existsSync(file)) throw new Error(`090: missing ${file}`)
    const audio = readFileSync(file)
    if (audio.length === 0) throw new Error(`090: ${file} is empty`)
    return { clipType, audio }
  })

  await client.query(
    `INSERT INTO voice_packs (code, display_name, creator_name, logo, logo_mime, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW())
     ON CONFLICT (code) DO NOTHING`,
    [PACK.code, PACK.displayName, PACK.creatorName, logo, PACK.logoMime]
  )

  const { rows } = await client.query('SELECT id FROM voice_packs WHERE code = $1', [PACK.code])
  if (rows.length === 0) throw new Error('090: pack row missing immediately after insert')
  const packId = rows[0].id

  let written = 0
  for (const { clipType, audio } of clips) {
    const result = await client.query(
      `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (pack_id, clip_type) DO NOTHING`,
      [packId, clipType, audio, CLIP_MIME, audio.length]
    )
    written += result.rowCount ?? 0
  }
  console.log(`090: Vader published (${PACK.code}) — ${written} of ${clips.length} clip(s) written.`)
}
