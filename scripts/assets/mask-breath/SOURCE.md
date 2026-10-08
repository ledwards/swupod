# Where these three files came from

`generate-voice-clips.ts` layers a breath either side of every line in the `mask`
pack. The breath is a real recording, not something ffmpeg generates — a
synthesised one breathes far too evenly to pass as a mask.

## Source

**"Gas Mask breath"** by Nuclearoid — somebody breathing inside a Soviet GP-5 gas
mask. <https://freesound.org/people/Nuclearoid/sounds/435825/>

Released **CC0 (public domain)**: copy, modify, distribute and perform, including
commercially, with no permission and no attribution required. This file is a
courtesy, not a licence obligation.

41.157 s, mono, 44.1 kHz. The full recording is not committed — only the two cuts
below, because that is all the generator uses.

## How they were cut and shaped

A real Vader breath was measured band by band, and the two halves turn out to be
almost opposite shapes. Normalised to each one's own peak:

| Hz   | inhale "HOOOH" | exhale "HEEEH" |
|------|----------------|----------------|
| 100  | -22.7          | -11.2          |
| 250  | -27.3          |  -4.1          |
| 400  |   0.0          |  -7.6          |
| 630  |  -1.6          |  -3.6          |
| 800  |  -0.7          | -10.7          |
| 1250 | -25.3          |  -1.5          |
| 2500 | -13.0          | -27.3          |

The inhale is a narrow resonant blob at **400-800 Hz** with almost no low end and a
cliff above 1 kHz — that is the hollow tube quality. The exhale is the reverse:
real bass from 40 Hz up, a hard peak at **1250 Hz**, dead above 1.6 kHz.

An earlier version band-passed both at 90-5500 Hz, which is why it read as generic
hiss rather than the sound everybody recognises. The shaping below was grid-searched
against those two targets: inhale error 133 -> 96, exhale 133 -> 67. The residual is
source texture — this is a GP-5 gas mask, Ben Burtt used a scuba regulator, and the
valves do not click alike.

One clean breath cycle in the source sits at 5.15-8.80 s. Both cuts are pitched down
0.85x (deeper, and 18% slower than the person who recorded it).

```sh
SRC=435825__nuclearoid__gas-mask-breath.mp3
PITCH="aresample=44100,asetrate=44100*0.85,aresample=44100"

# hoo.wav — the full draw, 1.12s
ffmpeg -ss 5.55 -t 0.95 -i $SRC -ac 1 -af "$PITCH,highpass=f=220:poles=2,\
equalizer=f=400:t=q:w=1.2:g=8,equalizer=f=700:t=q:w=1.1:g=13,\
equalizer=f=500:t=q:w=3.5:g=-5,equalizer=f=2500:t=q:w=1.8:g=14,\
lowpass=f=6500:poles=2,afade=t=in:st=0:d=0.16,afade=t=out:st=0.95:d=0.17,\
alimiter=limit=0.95" hoo.wav

# hoo-s.wav — the same draw cut off ABRUPTLY at 0.78s, which is what a breath
# actually does when you break it to speak. Used before every line.
ffmpeg -i hoo.wav -ac 1 -af "atrim=0.34,asetpts=PTS-STARTPTS,\
afade=t=in:st=0:d=0.12,afade=t=out:st=0.70:d=0.07,alimiter=limit=0.95" hoo-s.wav

# hee.wav — the exhale, 1.06s
ffmpeg -ss 7.30 -t 0.90 -i $SRC -ac 1 -af "$PITCH,highpass=f=45:poles=2,\
equalizer=f=280:t=q:w=1.1:g=11,equalizer=f=630:t=q:w=1.2:g=6,\
equalizer=f=1250:t=q:w=1.3:g=8,lowpass=f=4600:poles=2,\
afade=t=in:st=0:d=0.03,afade=t=out:st=0.72:d=0.33,alimiter=limit=0.95" hee.wav
```

Note the leading `aresample=44100` in `$PITCH`: `asetrate` reinterprets the sample
rate, so without it a 22050 Hz input speeds up instead of dropping in pitch.

## Why hoo.wav is still here

`hoo-s.wav` plays before every line. `hoo.wav` is kept because a mid-line pause gets
a draw trimmed to exactly the length of that silence, and trimming the long one from
its END gives a breath that finishes right as he speaks again.
