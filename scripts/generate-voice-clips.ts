/**
 * Regenerate built-in voice pack clips with macOS `say` + ffmpeg.
 *
 * The five language packs and Leebo were originally produced by hand, and the
 * recipe lived nowhere — so adding an eleventh cue meant reverse-engineering
 * which voice said which line. It is written down here now.
 *
 * The voices below are confirmed, not guessed: each was verified by synthesising
 * a known line and matching the encoded duration to the shipped mp3 to six
 * decimal places (e.g. german/time-is-up is Anna (Premium) saying "Die Zeit ist
 * um." at exactly 1.110975s).
 *
 * Usage:
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick            # every pack
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick --pack english
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick --dry-run
 *
 * Requires macOS (`say`) with the Premium voices downloaded (System Settings →
 * Accessibility → Spoken Content → System Voice → Manage Voices) and ffmpeg.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { VOICE_PACK_CLIP_TYPES, type VoicePackClipType } from '../src/services/voicePacks'

interface PackRecipe {
  /** `say -v` voice name. */
  voice: string
  /** Where this pack's audio lives, relative to the repo root. */
  dir: string
  /**
   * ffmpeg filter chain applied after synthesis. Leebo is Daniel (en-GB) run
   * through a heavy mechanical droid chain — bit-crush, ring modulation and
   * flanger, band-limited to a droid speaker.
   */
  filter?: string
  /** The line each clip says. */
  lines: Partial<Record<VoicePackClipType, string>>
}

/** Leebo's droid treatment. Kept in one place so every clip of his matches. */
const DROID_CHAIN = [
  'acrusher=bits=6:mode=log:aa=1',
  'tremolo=f=55:d=0.55',
  'flanger=delay=2:depth=3:regen=0:width=70:speed=0.5',
  'highpass=f=180',
  'lowpass=f=5000',
  'alimiter=limit=0.9',
].join(',')

const PACKS: Record<string, PackRecipe> = {
  english: {
    voice: 'Zoe (Premium)',
    dir: 'public/sounds/voice-packs/english',
    lines: {
      'time-is-up': 'Time is up.',
      'count-30': 'Thirty seconds remaining.',
      'timer-paused': 'Timer paused.',
      'next-pick': 'Next pick begins.',
    },
  },
  french: {
    voice: 'Audrey (Premium)',
    dir: 'public/sounds/voice-packs/french',
    lines: {
      'time-is-up': 'Temps écoulé !',
      'next-pick': 'Nouvelle sélection.',
    },
  },
  german: {
    voice: 'Anna (Premium)',
    dir: 'public/sounds/voice-packs/german',
    lines: {
      'time-is-up': 'Die Zeit ist um.',
      'next-pick': 'Nächste Wahl.',
    },
  },
  italian: {
    voice: 'Federica (Premium)',
    dir: 'public/sounds/voice-packs/italian',
    lines: {
      'time-is-up': 'Tempo scaduto!',
      'next-pick': 'Prossima scelta.',
    },
  },
  spanish: {
    voice: 'Marisol (Premium)',
    dir: 'public/sounds/voice-packs/spanish',
    lines: {
      'time-is-up': '¡Se acabó el tiempo!',
      'next-pick': 'Siguiente selección.',
    },
  },
  leebo: {
    voice: 'Daniel',
    // Leebo is a database pack now; migration 086 reads these files at boot, so
    // they live beside the migration rather than under public/.
    dir: 'migrations/assets/leebo',
    filter: DROID_CHAIN,
    lines: {
      greeting: 'Hello there, this is Leebo. Welcome to the Pod!',
      // Must not claim to have picked: a player who had a card selected but not
      // confirmed has their own selection locked in on expiry, so "I picked for
      // you" was simply wrong for them.
      'time-is-up': 'Time is up. Moving on.',
      'next-pick': 'Next pick begins. Do try to keep up.',
    },
  },
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args.set(key, next)
      i += 1
    } else {
      args.set(key, true)
    }
  }
  return args
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const clip = args.get('clip')
  const onlyPack = args.get('pack')
  const dryRun = args.get('dry-run') === true

  if (typeof clip !== 'string') {
    console.error('Missing --clip. Known clips:\n  ' + VOICE_PACK_CLIP_TYPES.join('\n  '))
    process.exit(1)
  }
  if (!(VOICE_PACK_CLIP_TYPES as readonly string[]).includes(clip)) {
    console.error(`Unknown clip "${clip}". Known clips:\n  ` + VOICE_PACK_CLIP_TYPES.join('\n  '))
    process.exit(1)
  }
  if (typeof onlyPack === 'string' && !PACKS[onlyPack]) {
    console.error(`Unknown pack "${onlyPack}". Known packs: ${Object.keys(PACKS).join(', ')}`)
    process.exit(1)
  }

  const packNames = typeof onlyPack === 'string' ? [onlyPack] : Object.keys(PACKS)
  const scratch = join(tmpdir(), `ptp-voice-${process.pid}`)
  mkdirSync(scratch, { recursive: true })

  let written = 0
  try {
    for (const name of packNames) {
      const pack = PACKS[name]
      const line = pack.lines[clip as VoicePackClipType]
      if (!line) {
        // Not a failure: the table only records lines that have been confirmed.
        console.warn(`  ${name.padEnd(9)} SKIP — no line recorded for "${clip}"`)
        continue
      }
      const out = join(pack.dir, `${clip}.mp3`)
      console.log(`  ${name.padEnd(9)} ${pack.voice.padEnd(18)} "${line}"`)
      if (dryRun) continue

      const aiff = join(scratch, `${name}.aiff`)
      execFileSync('say', ['-v', pack.voice, '-o', aiff, line], { stdio: 'pipe' })
      mkdirSync(dirname(out), { recursive: true })
      // Mono 44.1k, matching every clip already in the packs.
      const filters = ['-ac', '1', '-ar', '44100']
      if (pack.filter) filters.push('-af', pack.filter)
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, ...filters, out], {
        stdio: 'pipe',
      })
      if (!existsSync(out)) throw new Error(`ffmpeg produced nothing for ${out}`)
      written += 1
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  console.log(dryRun ? '\nDry run — nothing written.' : `\nWrote ${written} clip(s).`)
}

main()
