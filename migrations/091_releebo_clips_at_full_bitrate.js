/**
 * Migration 091: re-write Leebo's two half-bitrate clips at 128k.
 *
 * WHAT WAS WRONG
 * ==============
 * scripts/generate-voice-clips.ts never passed -b:a, and ffmpeg defaults mono mp3
 * to 64k. Every clip that script ever produced therefore shipped at half the
 * bitrate of the pack around it. For Leebo that is exactly two: `time-is-up` and
 * `next-pick`, both written by migration 088, which generated them with that
 * script. His other nine were made by hand at 128k and are untouched here.
 *
 * The generator now sets MP3_BITRATE explicitly, and the repo copies under
 * migrations/assets/leebo/ have been re-rendered. This migration is what carries
 * that correction to a database that has already run 086 and 088.
 *
 * WHY IT NEEDS ITS OWN MIGRATION
 * ==============================
 * 086 writes clips ON CONFLICT DO NOTHING, on purpose: a rerun must never clobber
 * audio a creator has re-recorded through their edit link. 088 was the one-shot
 * exception that replaced these same two clips, and it has already run everywhere.
 * Migrations do not re-run, so the corrected bytes reach production only through a
 * new one. Same reasoning 088 gives for existing at all.
 *
 * A fresh database gets the corrected files from 086/088 directly, so this is a
 * no-op there — it rewrites identical bytes.
 *
 * NOT A RE-VOICING
 * ================
 * Each re-rendered clip kept its duration to six decimal places, and decoding old
 * against new puts the difference 21-27 dB below the signal: the same performance,
 * re-encoded at twice the bitrate. Nobody is going to hear a new Leebo.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'leebo')
const CLIP_MIME = 'audio/mpeg'
const PACK_CODE = 'LEEBO'

/** Only the clips the bitrate bug touched — everything else is left alone. */
const CLIPS = ['time-is-up', 'next-pick']

export async function run(client) {
  const { rows } = await client.query('SELECT id FROM voice_packs WHERE code = $1', [PACK_CODE])
  if (rows.length === 0) {
    // 086 seeds him; if he is absent this database predates that and there is
    // nothing to correct.
    console.log('091: no LEEBO pack — nothing to correct.')
    return
  }
  const packId = rows[0].id

  // Read and validate before the first write, as 086 does.
  const clips = CLIPS.map((clipType) => {
    const file = join(ASSET_DIR, `${clipType}.mp3`)
    if (!existsSync(file)) throw new Error(`091: missing ${file}`)
    const audio = readFileSync(file)
    if (audio.length === 0) throw new Error(`091: ${file} is empty`)
    return { clipType, audio }
  })

  for (const { clipType, audio } of clips) {
    await client.query(
      `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (pack_id, clip_type) DO UPDATE
         SET audio = EXCLUDED.audio,
             audio_mime = EXCLUDED.audio_mime,
             byte_size = EXCLUDED.byte_size,
             updated_at = NOW()`,
      [packId, clipType, audio, CLIP_MIME, audio.length]
    )
  }
  console.log(`091: Leebo's ${clips.length} half-bitrate clip(s) rewritten at full bitrate.`)
}
