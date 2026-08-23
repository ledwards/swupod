/**
 * In-browser clip recording — pure rules, no DOM, no React.
 *
 * Most creators will not arrive with seven prepared audio files, so the creator form
 * records straight from the microphone. The recording then travels the SAME path a
 * picked file does: a `File` in the one multipart submit, validated by
 * `validateClipUpload` on the server. That only works if the container MediaRecorder
 * chooses is one the server already accepts, which is exactly what this module pins
 * down (and `audioRecording.test.ts` enforces):
 *
 *   Chrome/Edge  audio/webm;codecs=opus  → EBML magic  → audio/webm  ✓ allowlisted
 *   Firefox      audio/ogg;codecs=opus   → "OggS"      → audio/ogg   ✓ allowlisted
 *   Safari       audio/mp4               → "ftyp" box  → audio/mp4   ✓ allowlisted
 *
 * Nothing here weakens validation: the server still requires declared mime, magic
 * bytes and size to agree. The recorder just refuses to produce anything else.
 */
import { MAX_CLIP_BYTES, canonicalAudioMime, type AudioMime } from './voicePackUploads'

/**
 * Container preference, best first. Opus in WebM/Ogg is a fraction of the size of
 * AAC at the same quality; mp4 is last because only Safari needs it.
 */
export const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const

/**
 * Bitrate hint for MediaRecorder. Speech is fine at 96 kbps, and it makes the size
 * cap predictable: MAX_RECORDING_SECONDS at 96 kbps is ~360 KB, comfortably inside
 * the 1 MB clip cap even on Safari's AAC.
 */
export const RECORDER_AUDIO_BITS_PER_SECOND = 96_000

/**
 * Hard stop for a single recording. Every cue is one short line; a creator who
 * forgets to press stop gets an automatic stop with a usable take rather than a
 * rejected 4-minute ramble.
 */
export const MAX_RECORDING_SECONDS = 30

/** Container → file extension, for the name on the multipart part. */
const EXTENSION_BY_MIME: Record<AudioMime, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

/**
 * The mimeType to ask MediaRecorder for.
 *
 * @param isTypeSupported - `MediaRecorder.isTypeSupported`, or undefined where the
 *   browser does not expose it
 * @returns The first supported candidate, or null to let the browser pick its own
 *   default (which is then checked by `recordedClipMime`)
 */
export function pickRecorderMimeType(
  isTypeSupported?: ((type: string) => boolean) | undefined
): string | null {
  if (typeof isTypeSupported !== 'function') return null
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate
    } catch {
      /* a throwing isTypeSupported means "no" */
    }
  }
  return null
}

/**
 * Canonical upload mime for a finished recording, or null when the browser produced
 * something the server would refuse.
 *
 * @param blobType - `blob.type` from the recorder (may carry `;codecs=…`, may be '')
 * @param requestedType - The mimeType handed to MediaRecorder, used when the blob
 *   declares nothing
 */
export function recordedClipMime(
  blobType?: string | null,
  requestedType?: string | null
): AudioMime | null {
  return canonicalAudioMime(blobType || '') ?? canonicalAudioMime(requestedType || '')
}

/**
 * File name for the recorded part. The server keys on the field name and sniffs the
 * bytes, so this is cosmetic — but a creator who saves a preview should get a sane
 * name, and the extension must not contradict the container.
 *
 * @param clip - Clip slot id, e.g. 'count-30'
 * @param mime - Canonical container from `recordedClipMime`
 */
export function recordedClipFilename(clip: string, mime: AudioMime): string {
  return `${clip}.${EXTENSION_BY_MIME[mime]}`
}

/**
 * Why a finished recording cannot be used, or null when it is fine.
 *
 * The cap is the server's `MAX_CLIP_BYTES` — there is no second, softer limit here,
 * so a recording that passes this check passes the upload too.
 *
 * @param byteLength - Size of the recorded blob
 */
export function recordingRejection(byteLength: number): string | null {
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    return 'No audio was captured — check that the right microphone is selected, then record again.'
  }
  if (byteLength > MAX_CLIP_BYTES) {
    return `That take is over ${Math.round(MAX_CLIP_BYTES / 1024 / 1024)} MB. Record a shorter one and try again.`
  }
  return null
}

/**
 * Elapsed recording time as m:ss.
 *
 * @param elapsedMs - Milliseconds since the recording started
 */
export function formatRecordingClock(elapsedMs: number): string {
  const safe = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
