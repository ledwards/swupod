# Where these ten files came from

The `artoo` pack does not synthesise anything. Astromech is not a language and R2
is not saying words, so there is nothing for a text-to-speech voice to say — the
whole character is in the tone. These are real recordings, cut to cues.

## Source

**"R2D2 Sounds"** — ten separate R2-D2 sounds, from Orange Free Sounds.
<https://orangefreesounds.com/r2d2-sounds/>

Downloaded as `R2D2-sounds.zip`, whose `Read.txt` states:

> License: The sound effect is permitted for non-commercial use under license
> "Personal Use Only"

**That is narrower than the licences behind every other pack here.** The GP-5 breath
in the `mask` pack is CC0, and the voices are covered by a paid ElevenLabs tier that
grants commercial rights. This one is not cleared for commercial use, and Protect
the Pod has paid tiers. Replacing the audio later means swapping these ten files and
re-running the generator — the cue mapping and processing live in
`../generate-voice-clips.ts` and do not depend on the source.

## What each one is

There are no words to transcribe, so the files were characterised by measurement:
duration, mean spectral centroid ("bright"), and whether the centroid rises or falls
across the clip. That is what the cue mapping is based on — a rising sound reads as
cheerful or affirmative, a falling one as doubtful or wrong.

| file | dur | bright | trend | used for |
|------|-----|--------|-------|----------|
| r2-1  | 4.28s | 2605 Hz | flat    | ready-the-draft (chatty, most to say) |
| r2-2  | 2.59s | 2408 Hz | flat    | start-the-draft |
| r2-3  | 2.66s | 2432 Hz | flat    | timer-resumed |
| r2-4  | 1.59s | 1877 Hz | falling | sound-on |
| r2-5  | 0.99s | 1970 Hz | flat    | count-30 / count-15 / count-5 |
| r2-6  | 1.41s | 2292 Hz | rising  | next-pick |
| r2-7  | 1.31s | 1406 Hz | flat    | (source for r2-7-sad) |
| r2-8  | 3.03s | 2324 Hz | falling | (spare) |
| r2-9  | 3.60s | 2528 Hz | RISING  | greeting (the only strong riser) |
| r2-10 | 2.51s | 2490 Hz | falling | timer-paused (reads as a question) |

The measurements are of the ORIGINALS. Cue assignment was revised by ear after
listening — measurement narrowed the field, a person picked.

## r2-7-sad.mp3, the one derived file

`time-is-up` has to sound sad, and r2-7 is dead flat: 1439 Hz at the start, 1393 Hz
at the end. No constant-rate filter can make a flat sound sag, because `asetrate`
moves the entire clip by one ratio. So the droop is built into the asset — the tail
is pitched further down than the head and the two are crossfaded, which gives a real
falling contour of **1124 -> 617 Hz**:

```sh
ffmpeg -i r2-7.mp3 -filter_complex "\
[0:a]asplit=2[h][t];\
[h]atrim=0:0.55,asetrate=44100*0.92,aresample=44100,lowpass=f=2800[h1];\
[t]atrim=0.48,asetrate=44100*0.55,aresample=44100,lowpass=f=1500,volume=0.9[t1];\
[h1][t1]acrossfade=d=0.12:c1=tri:c2=tri,alimiter=limit=0.95[out]" \
-map "[out]" -ac 1 -ar 44100 r2-7-sad.mp3
```

Tail ratios of 0.62 and 0.48 also read as falling — 678 Hz and 562 Hz respectively.
0.55 was chosen as the deepest droop that still sounds mournful rather than comic;
lower it if it should hurt more.

Re-derive any of this with:

```sh
node scripts/voice-lab/voice-lab.js spectrum scripts/assets/artoo/r2-4.mp3
node scripts/voice-lab/voice-lab.js envelope scripts/assets/artoo/r2-4.mp3 0.1
```

## The logo

**"R2-D2.webp"** by Wikideas1 on Wikimedia Commons, released **CC0** (public domain,
commercial use, no attribution required — this note is a courtesy).
<https://commons.wikimedia.org/wiki/File:R2-D2.webp>

A 1137×1885 render with a real alpha channel. Padded to a transparent square rather
than cropped, because the redeem page frames it with `object-fit: contain` and a
square crop of a portrait subject cuts his legs off:

```sh
ffmpeg -i R2-D2.webp -vf "format=rgba,pad=1885:1885:(ow-iw)/2:0:color=#00000000,\
scale=360:360:flags=lanczos" logo.png
```

Transparency matters here: the card behind it is dark, and a white-matted PNG would
sit in an obvious white box.
