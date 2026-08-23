/**
 * Regenerate built-in voice pack clips.
 *
 * The five language packs and Leebo were originally produced by hand, and the
 * recipe lived nowhere — so adding an eleventh cue meant reverse-engineering
 * which voice said which line. It is written down here now.
 *
 * The `say` voices below are confirmed, not guessed: each was verified by
 * synthesising a known line and matching the encoded duration to the shipped mp3
 * to six decimal places (e.g. german/time-is-up is Anna (Premium) saying "Die
 * Zeit ist um." at exactly 1.110975s). Those packs still take the identical
 * single-ffmpeg path they always did, so regenerating one reproduces it.
 *
 * Usage:
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick            # every pack
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick --pack english
 *   npx tsx scripts/generate-voice-clips.ts --all-clips --pack mask
 *   npx tsx scripts/generate-voice-clips.ts --clip next-pick --dry-run
 *
 * Requires ffmpeg. The `say` packs additionally require macOS with the Premium
 * voices downloaded (System Settings → Accessibility → Spoken Content → System
 * Voice → Manage Voices). The `mask` pack instead requires ELEVEN_LABS_API_KEY
 * in .env — see WHY TWO VOICE SOURCES below.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import * as dotenv from 'dotenv'
import { VOICE_PACK_CLIP_TYPES, type VoicePackClipType } from '../src/services/voicePacks'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

/**
 * WHY TWO VOICE SOURCES
 * =====================
 * Every pack here used to be macOS `say`, which is free, offline, and reproducible
 * from a checkout. The `mask` pack cannot be, and the reason is worth recording so
 * nobody tries to "simplify" it back.
 *
 * A masked Sith voice needs to sit around 90 Hz. Getting `say` there means
 * `asetrate=44100*0.76,aresample=44100,atempo=1.16` — which is plain resampling. It
 * drags the FORMANTS down with the pitch, so the result reads as a tape played slow
 * rather than as a large person: a real bass has low pitch with comparatively high
 * formants, because the resonance comes from an actual chest. Measured median F0 of
 * that attempt was 94.1 Hz; ElevenLabs' Brian measures 93.0 Hz speaking normally.
 * Same pitch, completely different instrument, and no filter chain closes the gap.
 *
 * So `mask` buys the voice instead, and every render is cached on disk (see
 * EL_CACHE_DIR) — re-running to try a different filter chain costs no API credits.
 *
 * NOTE ON LICENSING: a free ElevenLabs account grants no commercial licence, and
 * cannot use library voices via the API at all (HTTP 402). Shipping this pack needs
 * a paid tier. The key we have is also scoped to text-to-speech only — it cannot
 * list voices, which is why the voice id below is a literal.
 */
type VoiceSource = 'say' | 'elevenlabs'

/** Peak levels the breath layer normalises to, in dBFS. */
interface BreathLevels {
  voice: number
  inhale: number
  exhale: number
  /** The short draw dropped into a mid-line pause. */
  mid: number
  /** Constant mask-air bed. Barely audible on its own; its absence is audible. */
  air: number
}

interface BreathRecipe {
  /** Filenames under scripts/assets/mask-breath/. See SOURCE.md there. */
  inhale: string
  /** Longer draw, trimmed to length to fill a mid-line pause. */
  inhaleLong: string
  exhale: string
  /** Silence between the end of the draw and the first word. */
  pregap: number
  /** How far the exhale starts BEFORE the last word ends. */
  exhaleOverlap: number
  levels: BreathLevels
}

interface PackRecipe {
  /** Where the words come from. Defaults to macOS `say`. */
  source?: VoiceSource
  /** `say -v` voice name, or — for source 'elevenlabs' — the voice id. */
  voice: string
  /** Human-readable voice name for the log, when `voice` is an opaque id. */
  label?: string
  /** ElevenLabs model. Defaults to EL_MODEL. */
  model?: string
  /**
   * ElevenLabs delivery speed, 0.7–1.2. Ignored by `say`, and unsupported by
   * eleven_v3 — which is why the mask pack stays on multilingual_v2: an unhurried
   * delivery matters more here than v3's extra expressiveness.
   */
  speed?: number
  /** Where this pack's audio lives, relative to the repo root. */
  dir: string
  /**
   * ffmpeg filter chain applied after synthesis. Leebo is Daniel (en-GB) run
   * through a heavy mechanical droid chain — bit-crush, ring modulation and
   * flanger, band-limited to a droid speaker.
   */
  filter?: string
  /** Layer a breath either side of every line. */
  breath?: BreathRecipe
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

/**
 * The mask treatment, derived by MEASUREMENT rather than taste.
 *
 * A real Vader line was analysed band by band and normalised to its 500–1500 Hz
 * energy. The result is not what anyone guesses:
 *
 *     60–110 Hz   -16.0 dB      <- the WEAKEST band
 *    110–200 Hz   -12.5 dB
 *    200–500 Hz    -8.9 dB
 *    500–1500 Hz    0.0 dB      <- dominant, by 9–16 dB
 *   1500–4000 Hz   -8.8 dB
 *
 * Vader is a MIDRANGE-FORWARD voice. The impression of size comes from a hard
 * resonance around 900 Hz — the mask acting as a horn — plus unhurried delivery.
 * It does not come from sub-bass, and every earlier attempt here failed by adding
 * low end: boosting 110 Hz, then commissioning a 65 Hz voice, both of which made
 * him muddy and further from the reference, not closer.
 *
 * These five filters were grid-searched against that measured profile. Summed
 * absolute error per band, lower is better:
 *
 *   real Vader, second reference segment    8.6   <- noise floor
 *   THIS CHAIN on Brian                    10.9
 *   previous chain on the 65 Hz voice      45.3
 *   Brian, unprocessed                     42.0
 *
 * Re-derive with scripts/assets/mask-breath/SOURCE.md's sibling note if the
 * reference is ever re-measured.
 */
const HELMET_CHAIN = [
  'highpass=f=70:poles=2', // below 70 Hz is rumble, not voice
  'equalizer=f=120:t=q:w=1.0:g=4', // BODY. An earlier revision high-passed at 120 and
  // cut 10 dB at 300, chasing a wide-band average that showed 500-1500 Hz dominant.
  // Per-frequency the reference has TWO peaks — 100-200 Hz and 800 Hz — and removing
  // the first one is what made him a tenor. Keep the body.
  'equalizer=f=450:t=q:w=1.4:g=-7', // the scoop that sits between the two peaks
  'equalizer=f=850:t=q:w=0.9:g=5', // the mask as a horn
  'equalizer=f=2000:t=q:w=2.0:g=-4',
  'lowpass=f=4500:poles=2', // the grille, but not muffled — consonants survive
  'acompressor=threshold=0.08:ratio=4:attack=8:release=220',
  'alimiter=limit=0.95',
].join(',')

const GP5_BREATH: BreathRecipe = {
  inhale: 'hoo-s.wav', // the draw, cut off abruptly the way a real one is when you break it to speak
  inhaleLong: 'hoo.wav',
  exhale: 'hee.wav',
  pregap: 0.05,
  exhaleOverlap: 0.35,
  levels: { voice: -3, inhale: -8, exhale: -5, mid: -10, air: -46 },
}

const PACKS: Record<string, PackRecipe> = {
  english: {
    voice: 'Zoe (Premium)',
    dir: 'public/sounds/voice-packs/english',
    // The complete script, every line confirmed against the shipped mp3 by exact
    // encoded duration — these are the words already in the pack, not a guess at
    // them, so regenerating a clip reproduces it rather than replacing it.
    lines: {
      greeting: 'Hi, this is Zoe. Welcome to the Pod!',
      'ready-the-draft': 'Ready to draft.',
      'start-the-draft': 'Start the draft!',
      'count-30': 'Thirty seconds remaining.',
      'count-15': 'Fifteen seconds remaining.',
      'count-5': 'Five seconds remaining.',
      'time-is-up': 'Time is up.',
      'sound-on': 'Sound on.',
      'timer-paused': 'Timer paused.',
      'timer-resumed': 'Timer resumed.',
      'next-pick': 'Next pick begins.',
    },
  },
  british: {
    // NOT Daniel, deliberately: Leebo is Daniel (en-GB) under the droid chain, and
    // an undisguised Daniel beside him was recognisably the same person doing two
    // jobs. Serena is Premium tier — the same tier as Zoe, so the two English
    // packs match in quality — and female against Leebo's male, so there is no
    // mistaking one for the other.
    voice: 'Serena (Premium)',
    dir: 'public/sounds/voice-packs/british',
    // Word for word the American script, so the two packs differ only in accent.
    lines: {
      greeting: 'Hi, this is Serena. Welcome to the Pod!',
      'ready-the-draft': 'Ready to draft.',
      'start-the-draft': 'Start the draft!',
      'count-30': 'Thirty seconds remaining.',
      'count-15': 'Fifteen seconds remaining.',
      'count-5': 'Five seconds remaining.',
      'time-is-up': 'Time is up.',
      'sound-on': 'Sound on.',
      'timer-paused': 'Timer paused.',
      'timer-resumed': 'Timer resumed.',
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
  mask: {
    source: 'elevenlabs',
    /*
     * NOT a stock voice. Built with ElevenLabs Voice Design from this description:
     *
     *   "A profoundly deep male bass, sepulchral and commanding, in crisp British
     *    Received Pronunciation. Cold, patient, absolute authority. Every word
     *    deliberate and heavy, with a slight metallic hollowness as if amplified
     *    through a mask. Late middle age, English."
     *
     * Measured median F0 59 Hz. The route here was long and the dead ends are worth
     * recording so nobody walks back down them:
     *
     *   macOS `say` pitched down by asetrate    resampling; formants fell with the
     *                                           pitch, so: a slowed tape
     *   stock Brian, 93 Hz                      deepest voice in the library, still
     *                                           far too light
     *   a 65 Hz American designed voice         deep but American, and the chain of
     *                                           the day made it muddy
     *   THIS, RP, 59 Hz                         chosen
     *
     * Design is non-deterministic — three previews per call, different every time —
     * so a rebuild from that description gives a similar voice, not this one. The id
     * is an account dependency. It is a literal because our key cannot list voices.
     */
    voice: '29zo0oPHLvHDGiE7p1GA',
    label: 'Designed RP bass',
    // The unhurried delivery is bought at synthesis rather than stretched on
    // afterwards, which would smear the consonants.
    speed: 0.8,
    // A Protect the Pod pack like Leebo, so a migration seeds it from here rather
    // than serving it from public/ at a guessable URL.
    dir: 'migrations/assets/mask',
    filter: HELMET_CHAIN,
    breath: GP5_BREATH,
    /*
     * Vader's own lines where one fits the cue, verbatim from the films. The three
     * countdowns have to say a number, so those are written — nothing in the script
     * counts seconds.
     *
     * Full stops are load-bearing: `silentCore` finds the pause a full stop creates
     * and drops a short draw into it. A line written as one breathless clause gets
     * no mid-line breath, so the punctuation here is a sound decision, not a
     * typographic one.
     */
    lines: {
      greeting: 'We would be honored. If you would join us.', // ESB
      'ready-the-draft': 'This will be a day long remembered.', // ANH
      'start-the-draft': 'Come with me.', // ESB — "Come with me. It is the only way."

      'count-30': 'Thirty seconds remain.',
      'count-15': 'Fifteen seconds remain.',
      'count-5': 'Five seconds remain.',
      // NOT a film line — the closest Vader gets is "It is too late for me, son".
      // Written, and kept because it says nothing about having picked for anyone:
      // a player holding an unconfirmed selection keeps THAT selection on expiry, so
      // a line claiming otherwise would be telling them something untrue.
      'time-is-up': 'It is finished.',
      'sound-on': 'Now I am the master.', // ANH
      // One ESB line split across the pair, which is exactly the shape of the two
      // cues: the host stops the clock, then starts it again. Splitting it also
      // keeps each cue short — the whole line in one clip ran 6.3s.
      'timer-paused': 'I am altering the deal.',
      'timer-resumed': "Pray I don't alter it any further.",
      'next-pick': 'All too easy.', // ESB
    },
  },
}

/**
 * Encode bitrate. EXPLICIT ON PURPOSE — do not remove it.
 *
 * ffmpeg's default for mono mp3 is 64k, and this script never used to say
 * otherwise, so every clip it has produced shipped at half the bitrate of the pack
 * around it: `next-pick` in all six language packs, leebo's `time-is-up` (both
 * added by migrations 087/088), and the whole british pack, which was generated
 * here from the start. 128k matches everything that was made by hand.
 */
const MP3_BITRATE = '128k'

const BREATH_DIR = 'scripts/assets/mask-breath'
/** Raw ElevenLabs renders, keyed by voice+model+settings+line. Gitignored. */
const EL_CACHE_DIR = 'scripts/.cache/elevenlabs'
const EL_MODEL = 'eleven_multilingual_v2'

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'pipe' })
}

function durationOf(file: string): number {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { stdio: 'pipe' }
  )
  return Number(out.toString().trim())
}

/** Peak level in dBFS. ffmpeg reports volumedetect on stderr, hence spawnSync. */
function peakDbfs(file: string): number {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  })
  const match = /max_volume: (-?[\d.]+)/.exec(run.stderr ?? '')
  if (!match) throw new Error(`could not measure ${file}:\n${(run.stderr ?? '').slice(-400)}`)
  return Number(match[1])
}

/** Linear gain that moves a measured peak to a target, both in dBFS. */
function gainTo(currentDb: number, targetDb: number): string {
  return Math.pow(10, (targetDb - currentDb) / 20).toFixed(4)
}

/**
 * Fetch one line from ElevenLabs, or return the cached render.
 *
 * The cache key covers the voice, the model, every voice setting and the text, so
 * editing a line refetches it and nothing else. Renders are kept rather than
 * regenerated because the filter chain gets iterated on far more often than the
 * words do, and each refetch spends real credits.
 */
async function synthesizeElevenLabs(pack: PackRecipe, line: string, out: string): Promise<string> {
  const key = process.env.ELEVEN_LABS_API_KEY
  if (!key) throw new Error('ELEVEN_LABS_API_KEY is not set — add it to .env to build the mask pack.')

  const model = pack.model ?? EL_MODEL
  // eleven_v3 rejects style, speaker boost and speed; multilingual_v2 wants them.
  const settings =
    model === 'eleven_v3'
      ? { stability: 0.5 }
      : {
          stability: 0.55, // steady, but not flat
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed: pack.speed ?? 1.0,
        }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([pack.voice, model, settings, line]))
    .digest('hex')
    .slice(0, 16)
  const cached = join(EL_CACHE_DIR, `${fingerprint}.mp3`)

  if (existsSync(cached)) {
    copyFileSync(cached, out)
    return 'cached'
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${pack.voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line, model_id: model, voice_settings: settings }),
    }
  )
  if (!response.ok) {
    // 402 here means a free account reaching for a library voice, which no retry fixes.
    throw new Error(`ElevenLabs returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }
  const audio = Buffer.from(await response.arrayBuffer())
  if (audio.length === 0) throw new Error('ElevenLabs returned an empty body')

  mkdirSync(EL_CACHE_DIR, { recursive: true })
  writeFileSync(cached, audio)
  writeFileSync(out, audio)
  return `fetched, ${line.length} chars`
}

/**
 * Lay a breath either side of the treated line and encode the finished clip.
 *
 * Placement follows what a body can actually do. You CANNOT speak while inhaling,
 * so the draw finishes before the first word. Speech IS exhalation, so the audible
 * exhale overlaps the last word — it is the same breath continuing. A mid-line pause
 * is another inhale, so it has to fit inside real silence without touching a word.
 *
 * Levels are normalised per clip because the breath is a fixed recording while the
 * lines vary in loudness — a fixed mix would bury it under one line and let it swamp
 * the next.
 */
function layerBreath(
  voiceWav: string,
  rawRender: string,
  breath: BreathRecipe,
  out: string,
  scratch: string
): void {
  const inhaleFile = join(BREATH_DIR, breath.inhale)
  const exhaleFile = join(BREATH_DIR, breath.exhale)
  const longFile = join(BREATH_DIR, breath.inhaleLong)
  for (const file of [inhaleFile, exhaleFile, longFile]) {
    if (!existsSync(file)) throw new Error(`missing breath asset ${file} — see ${BREATH_DIR}/SOURCE.md`)
  }

  const spoken = durationOf(voiceWav)
  const inhale = durationOf(inhaleFile)
  const exhale = durationOf(exhaleFile)
  const voiceAt = Number((inhale + breath.pregap).toFixed(3))
  const exhaleAt = Number((voiceAt + spoken - breath.exhaleOverlap).toFixed(3))
  const total = Number((Math.max(voiceAt + spoken, exhaleAt + exhale) + 0.12).toFixed(3))

  const bed = (name: string) => join(scratch, `breath-${name}.wav`)
  const { levels } = breath

  ffmpeg([
    '-i', voiceWav,
    '-af', `volume=${gainTo(peakDbfs(voiceWav), levels.voice)},adelay=${Math.round(voiceAt * 1000)},apad,atrim=0:${total}`,
    '-ac', '1', bed('voice'),
  ])
  ffmpeg(['-i', inhaleFile, '-af', `adelay=0,apad,atrim=0:${total}`, '-ac', '1', bed('inhale')])
  ffmpeg([
    '-i', exhaleFile,
    '-af', `adelay=${Math.round(exhaleAt * 1000)},apad,atrim=0:${total}`,
    '-ac', '1', bed('exhale'),
  ])
  // The air bed is generated rather than sampled: it has to run the whole clip at
  // any length, and a looped recording of near-silence would tick at the seam.
  ffmpeg([
    '-f', 'lavfi', '-t', String(total), '-i', 'anoisesrc=color=pink:r=44100:a=0.9:seed=5',
    '-af', 'highpass=f=200,lowpass=f=1800', '-ac', '1', bed('air'),
  ])

  const sources = [bed('voice'), bed('inhale'), bed('exhale')]
  const gains = [
    `[1:a]volume=${gainTo(peakDbfs(bed('inhale')), levels.inhale)}[i]`,
    `[2:a]volume=${gainTo(peakDbfs(bed('exhale')), levels.exhale)}[e]`,
  ]
  let chain = '[0:a][i][e]'

  const pause = silentCore(rawRender)
  const room = pause ? pause.end - pause.start - 0.08 : 0
  // 0.30s, not 0.18: a shorter dip is a stop consonant inside a word, not a pause
  // between clauses, and filling it puts a breath in the middle of the word.
  if (room > 0.3) {
    const longDur = durationOf(longFile)
    ffmpeg([
      '-i', longFile,
      '-af', `atrim=${Math.max(0, longDur - room).toFixed(3)}:${longDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=0.05,afade=t=out:st=${(room - 0.06).toFixed(3)}:d=0.06`,
      '-ac', '1', bed('midsrc'),
    ])
    const midAt = Number((voiceAt + pause!.start + 0.04).toFixed(3))
    ffmpeg(['-i', bed('midsrc'), '-af', `adelay=${Math.round(midAt * 1000)},apad,atrim=0:${total}`, '-ac', '1', bed('mid')])
    sources.push(bed('mid'))
    gains.push(`[3:a]volume=${gainTo(peakDbfs(bed('mid')), levels.mid)}[m]`)
    chain += '[m]'
  }
  sources.push(bed('air'))
  gains.push(`[${sources.length - 1}:a]volume=${gainTo(peakDbfs(bed('air')), levels.air)}[a]`)
  chain += '[a]'

  ffmpeg([
    ...sources.flatMap((f) => ['-i', f]),
    '-filter_complex',
    gains.join(';') +
      `;${chain}amix=inputs=${sources.length}:normalize=0:duration=longest,atrim=0:${total},` +
      `afade=t=in:st=0:d=0.04,afade=t=out:st=${(total - 0.18).toFixed(3)}:d=0.18,alimiter=limit=0.95[out]`,
    '-map', '[out]', '-ac', '1', '-ar', '44100', '-b:a', MP3_BITRATE, out,
  ])
}

/**
 * The genuinely silent stretch inside a line — where he would draw breath.
 *
 * Measured on the RAW render, not the filtered one: the compressor in the chain
 * fills the gap differently per treatment, so the same pause was detectable in one
 * and not the other. The expansion threshold is deliberately strict (18% of peak) —
 * a looser one crept into the decaying tail of the preceding word, which would have
 * had him inhaling over his own speech.
 */
function silentCore(file: string): { start: number; end: number } | null {
  const raw = execFileSync('sh', ['-c', `ffmpeg -v error -i "${file}" -ac 1 -ar 8000 -f f32le -`], {
    maxBuffer: 1 << 28,
  })
  const samples = raw.length / 4
  const window = 400
  const rms: number[] = []
  for (let start = 0; start + window < samples; start += window) {
    let energy = 0
    for (let i = 0; i < window; i += 1) {
      const v = raw.readFloatLE((start + i) * 4)
      energy += v * v
    }
    rms.push(Math.sqrt(energy / window))
  }
  if (rms.length < 8) return null
  const peak = Math.max(...rms)
  const lo = Math.ceil(rms.length * 0.15)
  const hi = Math.floor(rms.length * 0.85)
  let quietest = -1
  for (let i = lo; i <= hi; i += 1) if (quietest < 0 || rms[i] < rms[quietest]) quietest = i
  if (quietest < 0 || rms[quietest] > peak * 0.3) return null // no real pause in this line
  const threshold = peak * 0.18
  let a = quietest
  let b = quietest
  while (a > lo && rms[a - 1] < threshold) a -= 1
  while (b < hi && rms[b + 1] < threshold) b += 1
  return { start: (a * window) / 8000, end: ((b + 1) * window) / 8000 }
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const clip = args.get('clip')
  const allClips = args.get('all-clips') === true
  const onlyPack = args.get('pack')
  const dryRun = args.get('dry-run') === true

  if (!allClips && typeof clip !== 'string') {
    console.error(
      'Missing --clip (or pass --all-clips). Known clips:\n  ' + VOICE_PACK_CLIP_TYPES.join('\n  ')
    )
    process.exit(1)
  }
  if (!allClips && !(VOICE_PACK_CLIP_TYPES as readonly string[]).includes(clip as string)) {
    console.error(`Unknown clip "${clip}". Known clips:\n  ` + VOICE_PACK_CLIP_TYPES.join('\n  '))
    process.exit(1)
  }
  if (typeof onlyPack === 'string' && !PACKS[onlyPack]) {
    console.error(`Unknown pack "${onlyPack}". Known packs: ${Object.keys(PACKS).join(', ')}`)
    process.exit(1)
  }

  const packNames = typeof onlyPack === 'string' ? [onlyPack] : Object.keys(PACKS)
  const clipNames = allClips ? [...VOICE_PACK_CLIP_TYPES] : [clip as VoicePackClipType]
  const scratch = join(tmpdir(), `ptp-voice-${process.pid}`)
  mkdirSync(scratch, { recursive: true })

  let written = 0
  try {
    for (const name of packNames) {
      const pack = PACKS[name]
      const source: VoiceSource = pack.source ?? 'say'
      for (const currentClip of clipNames) {
        const line = pack.lines[currentClip]
        if (!line) {
          // Not a failure: the table only records lines that have been confirmed.
          console.warn(`  ${name.padEnd(9)} ${currentClip.padEnd(16)} SKIP — no line recorded`)
          continue
        }
        const out = join(pack.dir, `${currentClip}.mp3`)
        const shownVoice = pack.label ?? pack.voice
        console.log(`  ${name.padEnd(9)} ${currentClip.padEnd(16)} ${shownVoice.padEnd(18)} "${line}"`)
        if (dryRun) continue

        // 1. The words.
        let raw: string
        if (source === 'elevenlabs') {
          raw = join(scratch, `${name}-${currentClip}.mp3`)
          const how = await synthesizeElevenLabs(pack, line, raw)
          console.log(`  ${' '.repeat(9)} ${' '.repeat(16)} ${how}`)
        } else {
          raw = join(scratch, `${name}-${currentClip}.aiff`)
          execFileSync('say', ['-v', pack.voice, '-o', raw, line], { stdio: 'pipe' })
        }

        // 2. The treatment, then the breath if the pack has one.
        mkdirSync(dirname(out), { recursive: true })
        // Mono 44.1k, matching every clip already in the packs.
        const treatment = ['-ac', '1', '-ar', '44100']
        if (pack.filter) treatment.push('-af', pack.filter)

        if (pack.breath) {
          const treated = join(scratch, `${name}-${currentClip}-treated.wav`)
          ffmpeg(['-i', raw, ...treatment, treated])
          layerBreath(treated, raw, pack.breath, out, scratch)
        } else {
          // Single invocation, as before — plus the bitrate it always should have set.
          ffmpeg(['-i', raw, ...treatment, '-b:a', MP3_BITRATE, out])
        }

        if (!existsSync(out)) throw new Error(`ffmpeg produced nothing for ${out}`)
        written += 1
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  console.log(dryRun ? '\nDry run — nothing written.' : `\nWrote ${written} clip(s).`)
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
