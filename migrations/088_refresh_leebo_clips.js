/**
 * Migration 088: refresh Leebo's shipped clips.
 *
 * Two things changed after 086 published him:
 *
 *   1. `next-pick` was added to VOICE_PACK_CLIP_TYPES, so his pack is a slot short.
 *   2. His `time-is-up` line claimed "I picked for you", which is not what the
 *      timeout does — a player holding an unconfirmed selection has THAT selection
 *      locked in, so the line was telling them something untrue about their own
 *      draft. It now just says the time is up.
 *
 * 086 writes clips with ON CONFLICT DO NOTHING on purpose: a rerun must never
 * clobber audio a creator has re-recorded through their edit link. That is right for
 * reruns and wrong here, because this migration exists precisely to replace bytes
 * that are already in the table. Doing it as its own migration keeps both properties
 * — 086 stays non-destructive forever, and this correction applies exactly once, so a
 * later re-record of Leebo is safe from it too.
 *
 * On a fresh database 086 has already written the corrected files and this is a no-op
 * that rewrites identical bytes.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'leebo')
const CLIP_MIME = 'audio/mpeg'

/** Only the clips this correction is about — everything else is left alone. */
const CLIPS = ['time-is-up', 'next-pick']

function readAsset(name) {
  const path = join(ASSET_DIR, name)
  if (!existsSync(path)) throw new Error(`088: Leebo asset ${path} is missing`)
  const bytes = readFileSync(path)
  if (bytes.length === 0) throw new Error(`088: Leebo asset ${path} is empty`)
  return bytes
}

export async function run(client) {
  const packRes = await client.query("SELECT id FROM voice_packs WHERE code = 'LEEBO'")
  const packId = packRes.rows[0]?.id
  if (!packId) {
    // 086 has not run (or Leebo was deliberately removed). Nothing to correct.
    console.log('   No LEEBO pack — nothing to refresh')
    return
  }

  // Read both before writing either: a half-applied correction would leave the
  // pack with one new clip and one stale line.
  const clips = CLIPS.map((clip) => ({ clip, bytes: readAsset(`${clip}.mp3`) }))

  for (const { clip, bytes } of clips) {
    await client.query(
      `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (pack_id, clip_type) DO UPDATE
         SET audio = EXCLUDED.audio,
             audio_mime = EXCLUDED.audio_mime,
             byte_size = EXCLUDED.byte_size,
             updated_at = NOW()`,
      [packId, clip, bytes, CLIP_MIME, bytes.length]
    )
  }

  console.log(`   Pack ${packId}: refreshed ${clips.length} clip(s) — ${CLIPS.join(', ')}`)
}
