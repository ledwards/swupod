// Spec tests for in-browser clip recording.
//
// SPEC (user's brief): a creator can record the seven lines in the browser instead of
// uploading files, and the recording goes through the SAME upload path — so whatever
// MediaRecorder hands back must survive `validateClipUpload` unchanged. The three
// containers browsers actually emit are:
//
//   Chrome/Edge   audio/webm;codecs=opus   (EBML header)
//   Firefox       audio/ogg;codecs=opus    (OggS header)
//   Safari        audio/mp4                (…ftyp box)
//
// Every one of those is already on the server allowlist; these tests are what keeps
// that true. The size cap is the server's, not a second number.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_RECORDING_SECONDS,
  RECORDER_MIME_CANDIDATES,
  formatRecordingClock,
  pickRecorderMimeType,
  recordedClipFilename,
  recordedClipMime,
  recordingRejection,
} from './audioRecording'
import { MAX_CLIP_BYTES, canonicalAudioMime, validateClipUpload } from './voicePackUploads'

/** Leading bytes of a real container, padded so the sniffer has 12 bytes to read. */
function header(bytes: number[]): Uint8Array {
  const out = new Uint8Array(64)
  out.set(bytes, 0)
  return out
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0))
}

/** MediaRecorder output headers, per container. */
const WEBM_EBML = header([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00])
const OGG_OPUS = header(ascii('OggS').concat([0, 2, 0, 0, 0, 0, 0, 0]))
const MP4_FTYP = header([0x00, 0x00, 0x00, 0x1c].concat(ascii('ftypiso5')))

describe('recorder container allowlist', () => {
  it('SPEC: every mime the recorder may produce is accepted by the server allowlist', () => {
    for (const candidate of RECORDER_MIME_CANDIDATES) {
      assert.notEqual(
        canonicalAudioMime(candidate),
        null,
        `recorder candidate "${candidate}" must be an accepted upload type`
      )
    }
  })

  it('SPEC: a real MediaRecorder blob passes validateClipUpload as-is', () => {
    // Declared type is exactly what `blob.type` reads on each engine.
    assert.equal(validateClipUpload('audio/webm;codecs=opus', WEBM_EBML).ok, true, 'Chrome')
    assert.equal(validateClipUpload('audio/ogg;codecs=opus', OGG_OPUS).ok, true, 'Firefox')
    assert.equal(validateClipUpload('audio/mp4', MP4_FTYP).ok, true, 'Safari')
  })

  it('SPEC: the sniffed mime the server stores is the canonical container', () => {
    const chrome = validateClipUpload('audio/webm;codecs=opus', WEBM_EBML)
    assert.equal(chrome.ok && chrome.mime, 'audio/webm')
    const safari = validateClipUpload('audio/mp4;codecs=mp4a.40.2', MP4_FTYP)
    assert.equal(safari.ok && safari.mime, 'audio/mp4')
  })
})

describe('pickRecorderMimeType', () => {
  const chromeSupports = (t: string) => t.startsWith('audio/webm')
  // Firefox records WebM/Opus too; this fixture is the Ogg-only case.
  const firefoxSupports = (t: string) => t.startsWith('audio/ogg')
  const safariSupports = (t: string) => t.startsWith('audio/mp4')

  it('picks a supported, uploadable candidate on each engine', () => {
    assert.equal(recordedClipMime(pickRecorderMimeType(chromeSupports)), 'audio/webm')
    assert.equal(recordedClipMime(pickRecorderMimeType(safariSupports)), 'audio/mp4')
    assert.equal(recordedClipMime(pickRecorderMimeType(firefoxSupports)), 'audio/ogg')
  })

  it('prefers Opus over AAC when a browser supports both', () => {
    assert.equal(pickRecorderMimeType(() => true), 'audio/webm;codecs=opus')
  })

  it('returns null when nothing on the list is supported — caller falls back to the browser default', () => {
    assert.equal(pickRecorderMimeType(() => false), null)
  })

  it('treats a missing isTypeSupported as "no opinion"', () => {
    assert.equal(pickRecorderMimeType(undefined), null)
  })
})

describe('recordedClipMime', () => {
  it('strips the codecs parameter browsers append', () => {
    assert.equal(recordedClipMime('audio/webm;codecs=opus'), 'audio/webm')
    assert.equal(recordedClipMime('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4')
    assert.equal(recordedClipMime('AUDIO/OGG; codecs=opus'), 'audio/ogg')
  })

  it('SPEC: falls back to the requested recorder type when the blob declares none', () => {
    // Safari has shipped versions where blob.type is ''.
    assert.equal(recordedClipMime('', 'audio/mp4'), 'audio/mp4')
    assert.equal(recordedClipMime(undefined, 'audio/webm;codecs=opus'), 'audio/webm')
  })

  it('returns null for anything the server would not accept', () => {
    assert.equal(recordedClipMime('video/webm'), null)
    assert.equal(recordedClipMime(''), null)
    assert.equal(recordedClipMime('application/octet-stream', 'application/octet-stream'), null)
  })
})

describe('recordedClipFilename', () => {
  it('names the part after the clip with the container extension', () => {
    assert.equal(recordedClipFilename('count-30', 'audio/webm'), 'count-30.webm')
    assert.equal(recordedClipFilename('greeting', 'audio/mp4'), 'greeting.m4a')
    assert.equal(recordedClipFilename('time-is-up', 'audio/ogg'), 'time-is-up.ogg')
    assert.equal(recordedClipFilename('count-5', 'audio/mpeg'), 'count-5.mp3')
    assert.equal(recordedClipFilename('count-15', 'audio/wav'), 'count-15.wav')
  })
})

describe('recordingRejection', () => {
  it('accepts an ordinary short recording', () => {
    assert.equal(recordingRejection(40_000), null)
  })

  it('SPEC: a recording over the clip cap is rejected with a clear, actionable message', () => {
    const message = recordingRejection(MAX_CLIP_BYTES + 1)
    assert.ok(message, 'must not be silently accepted')
    assert.match(message!, /MB/, 'names the limit')
    assert.match(message!, /shorter|again/i, 'tells the creator what to do')
  })

  it('rejects an empty recording (no audio captured)', () => {
    const message = recordingRejection(0)
    assert.ok(message)
    assert.match(message!, /no audio|nothing/i)
  })

  it('caps recordings well under the byte limit so the stop is a choice, not a crash', () => {
    assert.ok(MAX_RECORDING_SECONDS > 5, 'long enough for any cue line')
    assert.ok(MAX_RECORDING_SECONDS <= 60, 'short enough to stay under the 1 MB cap')
  })
})

describe('formatRecordingClock', () => {
  it('renders m:ss from elapsed milliseconds', () => {
    assert.equal(formatRecordingClock(0), '0:00')
    assert.equal(formatRecordingClock(7_400), '0:07')
    assert.equal(formatRecordingClock(65_000), '1:05')
  })

  it('never renders a negative clock', () => {
    assert.equal(formatRecordingClock(-500), '0:00')
  })
})
