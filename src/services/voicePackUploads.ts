/**
 * Upload validation for creator voice packs — pure, no I/O.
 *
 * Threat model: the creator link is unguessable but the person holding it is
 * still untrusted, and whatever they upload is later served back to every
 * player at a table. So a file is accepted only when THREE things agree:
 *
 *   1. the declared Content-Type is on the allowlist,
 *   2. the leading bytes actually look like that container (magic bytes), and
 *   3. the byte length is inside the cap.
 *
 * The mime we STORE is the sniffed one, never the client's string — the header
 * we later serve must describe the bytes we actually hold. SVG is deliberately
 * absent from the image allowlist: it is a script-bearing document, not a
 * picture, and we serve logos from our own origin.
 */

/**
 * 5 MB per clip.
 *
 * A spoken line is a few hundred KB as MP3, so this is not sized for the audio —
 * it is sized for what creators actually hand over: an uncompressed WAV straight
 * out of a recorder, or a line with a few seconds of room tone on either end. The
 * old 1 MB cap was arithmetically fine and rejected real files anyway.
 *
 * Note that a publish sends every staged clip in ONE request, so the ceiling on a
 * whole submission is this times the number of slots. That is a deliberate
 * upper bound rather than an expectation — hitting it means every one of eleven
 * lines is a maxed-out WAV.
 */
export const MAX_CLIP_BYTES = 5 * 1024 * 1024
/** 2 MB for the pack logo. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export type AudioMime = 'audio/mpeg' | 'audio/ogg' | 'audio/wav' | 'audio/mp4' | 'audio/webm'
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/**
 * Declared-Content-Type → canonical mime. Browsers and operating systems disagree
 * wildly on audio types (`audio/mp3`, `audio/x-m4a`, `application/ogg`…), so the
 * allowlist maps every spelling we accept onto one canonical value.
 */
const DECLARED_AUDIO: Record<string, AudioMime> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/ogg': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/vorbis': 'audio/ogg',
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mp4': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/webm': 'audio/webm',
}

/**
 * Canonical mime for a declared Content-Type, or null when it is not on the audio
 * allowlist. Parameters (`;codecs=opus`, `;charset=binary`) are stripped — MediaRecorder
 * always appends one — and case is ignored.
 *
 * Exported so the recorder in the creator form can check its own output against the
 * SAME allowlist the server enforces, instead of keeping a second copy of the list.
 *
 * @param declaredType - Content-Type string from a form part or a Blob
 */
export function canonicalAudioMime(declaredType: string): AudioMime | null {
  const key = (declaredType || '').toLowerCase().split(';')[0]!.trim()
  return DECLARED_AUDIO[key] ?? null
}

const DECLARED_IMAGE: Record<string, ImageMime> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
}

/** Accept attribute for the creator form's audio inputs. */
export const AUDIO_ACCEPT = '.mp3,.m4a,.ogg,.wav,.webm,audio/*'
/** Accept attribute for the creator form's logo input (no SVG — see file header). */
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif'

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = offset; i < offset + length; i++) {
    const b = bytes[i]
    if (b === undefined) return ''
    out += String.fromCharCode(b)
  }
  return out
}

/** Identify an audio container from its leading bytes. Returns null if unrecognized. */
export function sniffAudioMime(bytes: Uint8Array): AudioMime | null {
  if (bytes.length < 12) return null
  // ID3v2-tagged MP3.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg'
  // Bare MPEG audio frame sync: 11 consecutive set bits.
  if (bytes[0] === 0xff && ((bytes[1] as number) & 0xe0) === 0xe0) return 'audio/mpeg'
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'audio/wav'
  // ISO base media (m4a/mp4): a size-prefixed 'ftyp' box.
  if (ascii(bytes, 4, 4) === 'ftyp') return 'audio/mp4'
  // Matroska/WebM EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'audio/webm'
  }
  return null
}

/** Identify an image format from its leading bytes. Returns null if unrecognized. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 12) return null
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif'
  return null
}

export type UploadCheck<M> =
  | { ok: true; mime: M }
  | { ok: false; error: string }

/**
 * Validate one uploaded clip. `declaredType` is the browser's Content-Type for
 * the part; `bytes` is the whole body. Both must agree, and the size cap is
 * enforced on the bytes we actually received (not a client-reported length).
 */
export function validateClipUpload(declaredType: string, bytes: Uint8Array): UploadCheck<AudioMime> {
  const declared = canonicalAudioMime(declaredType)
  if (!declared) {
    return { ok: false, error: `Unsupported audio type "${declaredType}". Use MP3, M4A, OGG, WAV or WebM.` }
  }
  if (bytes.length === 0) return { ok: false, error: 'Audio file is empty.' }
  if (bytes.length > MAX_CLIP_BYTES) {
    return { ok: false, error: `Audio file is larger than ${Math.round(MAX_CLIP_BYTES / 1024)} KB.` }
  }
  const sniffed = sniffAudioMime(bytes)
  if (!sniffed) return { ok: false, error: 'That file does not look like an audio file.' }
  if (sniffed !== declared) {
    return { ok: false, error: `File contents (${sniffed}) do not match its type (${declared}).` }
  }
  return { ok: true, mime: sniffed }
}

/** Validate the pack logo. Same three-way agreement as clips, with the image caps. */
export function validateLogoUpload(declaredType: string, bytes: Uint8Array): UploadCheck<ImageMime> {
  const declared = DECLARED_IMAGE[(declaredType || '').toLowerCase().split(';')[0]!.trim()]
  if (!declared) {
    return { ok: false, error: `Unsupported image type "${declaredType}". Use PNG, JPEG, WebP or GIF.` }
  }
  if (bytes.length === 0) return { ok: false, error: 'Logo file is empty.' }
  if (bytes.length > MAX_LOGO_BYTES) {
    return { ok: false, error: `Logo is larger than ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB.` }
  }
  const sniffed = sniffImageMime(bytes)
  if (!sniffed) return { ok: false, error: 'That file does not look like an image.' }
  if (sniffed !== declared) {
    return { ok: false, error: `File contents (${sniffed}) do not match its type (${declared}).` }
  }
  return { ok: true, mime: sniffed }
}
