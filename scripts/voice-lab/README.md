# voice-lab

Measurement tools for building voice packs, plus what they have already told us.

The `mask` pack took several failed attempts, and every one of them failed the same
way: someone (me) decided by ear-in-the-head rather than by measurement, and was
confidently wrong. These tools exist so the next pack can be argued about with
numbers.

```sh
node scripts/voice-lab/voice-lab.js f0 <file...>          # median pitch
node scripts/voice-lab/voice-lab.js spectrum <file>       # per-third-octave, dB below peak
node scripts/voice-lab/voice-lab.js envelope <file> [step] # loudness over time
node scripts/voice-lab/voice-lab.js compare <ref> <file>  # band-by-band delta vs a reference
```

## The one thing to internalise

**Pitch and timbre are different things, and only one of them is easy to fake.**

`asetrate=44100*R,aresample=44100,atempo=1/R` is resampling. It moves the formants
down with the pitch, which is the sound of a tape played slow, not of a large person.
A macOS `say` voice dropped to 93 Hz that way measured the *same* `f0` as a genuine
93 Hz bass and sounded nothing like it.

If a voice needs to be deeper, get a deeper voice. If you must shift pitch, use
formant-preserving shift (`brew install rubberband`, then `rubberband -p <semitones>
-F in.wav out.wav`) — this repo's ffmpeg has no rubberband filter and no formant
filters at all.

## Reading `f0` output

The search range is 55–300 Hz. Readings that pile up against 55 Hz are suspect:
autocorrelation locks onto subharmonics and reports an octave low. Confirm with
`spectrum` — if there is real energy in the 40–80 Hz bands, the low reading is
genuine; if those bands are 15+ dB down, it is not.

## Reading `compare` output

Both files are normalised to their own loudest band, so it compares *shape*, not
level. Useful for matching a treatment to a reference. Two warnings:

- **A wide-band average will lie to you.** The mask chain was first tuned against six
  wide bands, which showed 500–1500 Hz dominant, so the chain high-passed at 120 Hz.
  Per-third-octave, the reference actually has *two* peaks — 100–200 Hz and 800 Hz —
  and cutting the first is exactly what made the voice a tenor. Use `spectrum`, not a
  handful of bands.
- **A low error score is not the goal.** After the tenor mistake, the numerically
  *best*-scoring version was the one that sounded worst. The score narrows the search;
  a person still picks.

## What we measured

### A Darth Vader line (`spectrum`, dB below peak)

```
 80 Hz  -16.5     400 Hz  -22.1     1250 Hz  -14.6
100 Hz   -9.5     500 Hz  -22.3     1600 Hz  -22.6
160 Hz   -9.1     630 Hz  -13.2     2500 Hz  -21.3
200 Hz  -10.5     800 Hz   -9.8     4000 Hz  -35.3
```

Two peaks (100–200 and 630–800) with a scoop at 400–500, rolling off hard above
1.6 kHz. The size of the voice is that 800 Hz mask resonance plus real body at
100–200 — not sub-bass.

### The breath, measured separately

The inhale and exhale are nearly opposite shapes, which is why one broadband hiss
cannot play both:

| Hz   | inhale "HOOOH" | exhale "HEEEH" |
|------|----------------|----------------|
| 100  | -22.7          | -11.2          |
| 250  | -27.3          |  -4.1          |
| 400  |   0.0          |  -7.6          |
| 800  |  -0.7          | -10.7          |
| 1250 | -25.3          |  -1.5          |
| 2500 | -13.0          | -27.3          |

Inhale: a narrow resonant blob at 400–800 Hz, nearly no low end, dead above 1 kHz.
Exhale: real bass from 40 Hz, a hard peak at 1250 Hz, dead above 1.6 kHz.

### ElevenLabs voices, median F0 at speed 0.8

```
designed RP bass (mask pack)  59 Hz     Adam    130 Hz
designed alt                  75 Hz     Daniel  133 Hz
Brian (deepest stock)         93 Hz     Bill    136 Hz
Clyde (library)              114 Hz     George  155 Hz
```

No stock voice reaches bass register. Voice Design does, and it is the reason the
pack works — see the `mask` entry in `../generate-voice-clips.ts` for the exact
description used and the API calls.

## Building another pack

1. Add an entry to `PACKS` in `../generate-voice-clips.ts`. `source: 'elevenlabs'`
   plus a `breath` recipe gets you the whole pipeline; raw ElevenLabs renders cache
   to `scripts/.cache/`, so iterating on a filter chain costs no API credits.
2. Tune the chain with `compare` against a reference, then listen. In that order.
3. `npm run voice:publish -- --dir <asset dir> --code <CODE> --name <name>` puts it
   in the local database so you can actually redeem and hear it in the app.
