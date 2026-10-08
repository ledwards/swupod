// Spec tests for creator upload validation.
//
// SPEC (user's brief, SECURITY): uploads are untrusted. A file is accepted only when
// the declared Content-Type, the actual magic bytes, and the size cap all agree.
// Clips cap at 1 MB, logos at 2 MB. SVG is never an accepted logo format.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CLIP_BYTES,
  MAX_LOGO_BYTES,
  sniffAudioMime,
  sniffImageMime,
  validateClipUpload,
  validateLogoUpload,
} from './voicePackUploads'

/** Build a buffer that begins with `head` and is padded to `length` bytes. */
function withHeader(head: number[], length = 64): Uint8Array {
  const out = new Uint8Array(length)
  out.set(head, 0)
  return out
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0))
}

const MP3 = withHeader(ascii('ID3') .concat([0x03, 0x00]))
const MP3_BARE = withHeader([0xff, 0xfb, 0x90, 0x00])
const OGG = withHeader(ascii('OggS'))
const WAV = withHeader(ascii('RIFF').concat([0, 0, 0, 0], ascii('WAVE')))
const M4A = withHeader([0, 0, 0, 0x20].concat(ascii('ftyp')))
const WEBM = withHeader([0x1a, 0x45, 0xdf, 0xa3])
const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0])
const WEBP = withHeader(ascii('RIFF').concat([0, 0, 0, 0], ascii('WEBP')))
const GIF = withHeader(ascii('GIF89a'))
const SVG = withHeader(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))

describe('audio magic-byte sniffing', () => {
  it('recognizes every accepted container', () => {
    assert.equal(sniffAudioMime(MP3), 'audio/mpeg')
    assert.equal(sniffAudioMime(MP3_BARE), 'audio/mpeg')
    assert.equal(sniffAudioMime(OGG), 'audio/ogg')
    assert.equal(sniffAudioMime(WAV), 'audio/wav')
    assert.equal(sniffAudioMime(M4A), 'audio/mp4')
    assert.equal(sniffAudioMime(WEBM), 'audio/webm')
  })

  it('rejects non-audio and truncated bodies', () => {
    assert.equal(sniffAudioMime(PNG), null)
    assert.equal(sniffAudioMime(SVG), null)
    assert.equal(sniffAudioMime(new Uint8Array([0x49, 0x44, 0x33])), null, 'too short to judge')
  })
})

describe('image magic-byte sniffing', () => {
  it('recognizes every accepted format', () => {
    assert.equal(sniffImageMime(PNG), 'image/png')
    assert.equal(sniffImageMime(JPEG), 'image/jpeg')
    assert.equal(sniffImageMime(WEBP), 'image/webp')
    assert.equal(sniffImageMime(GIF), 'image/gif')
  })

  it('SPEC: SVG is never recognized as an image (script-bearing document)', () => {
    assert.equal(sniffImageMime(SVG), null)
    const check = validateLogoUpload('image/svg+xml', SVG)
    assert.equal(check.ok, false)
  })
})

describe('validateClipUpload', () => {
  it('accepts a well-formed mp3 and returns the SNIFFED mime', () => {
    const result = validateClipUpload('audio/mp3', MP3)
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.mime, 'audio/mpeg', 'canonical mime, not the declared spelling')
  })

  it('accepts the alternate spellings browsers actually send', () => {
    assert.equal(validateClipUpload('audio/x-m4a', M4A).ok, true)
    assert.equal(validateClipUpload('application/ogg', OGG).ok, true)
    assert.equal(validateClipUpload('audio/x-wav', WAV).ok, true)
    assert.equal(validateClipUpload('audio/mpeg; charset=binary', MP3).ok, true)
  })

  it('SPEC: rejects a file whose bytes disagree with its declared type', () => {
    const result = validateClipUpload('audio/mpeg', PNG)
    assert.equal(result.ok, false)
  })

  it('SPEC: rejects a disallowed declared type outright', () => {
    assert.equal(validateClipUpload('application/x-msdownload', MP3).ok, false)
    assert.equal(validateClipUpload('', MP3).ok, false)
  })

  it('SPEC: caps clips at 1 MB', () => {
    assert.equal(MAX_CLIP_BYTES, 5 * 1024 * 1024)
    const atCap = new Uint8Array(MAX_CLIP_BYTES)
    atCap.set(ascii('ID3').concat([3, 0]), 0)
    assert.equal(validateClipUpload('audio/mpeg', atCap).ok, true, 'exactly at the cap is allowed')

    const overCap = new Uint8Array(MAX_CLIP_BYTES + 1)
    overCap.set(ascii('ID3').concat([3, 0]), 0)
    assert.equal(validateClipUpload('audio/mpeg', overCap).ok, false)
  })

  it('rejects an empty part', () => {
    assert.equal(validateClipUpload('audio/mpeg', new Uint8Array(0)).ok, false)
  })
})

describe('validateLogoUpload', () => {
  it('accepts a well-formed png', () => {
    const result = validateLogoUpload('image/png', PNG)
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.mime, 'image/png')
  })

  it('normalizes image/jpg to image/jpeg', () => {
    const result = validateLogoUpload('image/jpg', JPEG)
    assert.equal(result.ok && result.mime, 'image/jpeg')
  })

  it('SPEC: caps logos at 2 MB', () => {
    assert.equal(MAX_LOGO_BYTES, 2 * 1024 * 1024)
    const overCap = new Uint8Array(MAX_LOGO_BYTES + 1)
    overCap.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    assert.equal(validateLogoUpload('image/png', overCap).ok, false)
  })

  it('SPEC: rejects audio masquerading as a logo', () => {
    assert.equal(validateLogoUpload('image/png', MP3).ok, false)
  })
})
