/**
 * Cache policy for creator voice-pack media — pure, no I/O.
 *
 * The clip route and the logo route must agree on this, and getting it wrong is
 * invisible until it is expensive: migration 080 shipped these bytes as
 * `immutable, max-age=31536000` on the reasoning that "the creator form writes
 * them once and there is no edit path". The creator link is now a durable EDIT
 * link, so that reasoning is gone. An immutable response would let a creator
 * replace a line, see a success screen, and have every listener who already
 * fetched the old take keep hearing it for a year.
 *
 * So: still cacheable, but revalidated. The ETag is keyed on the row's
 * `updated_at` (migration 081) as well as its length, so any write to a slot
 * retires every cached copy of it — two takes of identical byte length are not
 * mistaken for each other. Between edits an unchanged clip costs a conditional
 * request and a 304, not a re-download.
 */

/**
 * How long a client may reuse voice-pack media without asking. Short enough that
 * a creator's edit reaches a table in the middle of a draft; long enough that
 * replaying a cue seven times in one pick does not mean seven round trips.
 */
export const VOICE_PACK_ASSET_MAX_AGE_SECONDS = 300

/** Cache-Control for every voice-pack media response, 200 and 304 alike. */
export const VOICE_PACK_ASSET_CACHE_CONTROL =
  `public, max-age=${VOICE_PACK_ASSET_MAX_AGE_SECONDS}, must-revalidate`

/**
 * A strong ETag for one stored asset.
 *
 * @param key - Stable identity of the asset (`<packId>-<clip>`, `<packId>-logo`)
 * @param byteLength - Length of the bytes being served
 * @param updatedAt - The row's last write; anything unparseable degrades to `0`,
 *                    which still varies with byteLength rather than throwing
 */
export function voicePackAssetETag(
  key: string,
  byteLength: number,
  updatedAt: unknown
): string {
  let stamp = 0
  if (updatedAt instanceof Date) {
    stamp = updatedAt.getTime()
  } else if (typeof updatedAt === 'string') {
    const parsed = Date.parse(updatedAt)
    if (!Number.isNaN(parsed)) stamp = parsed
  } else if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
    stamp = updatedAt
  }
  return `"${key}-${byteLength}-${stamp}"`
}

/**
 * Headers shared by the 200 and the 304. `X-Content-Type-Options` is not
 * optional: the bytes are opaque uploader-supplied media and a browser must
 * never sniff them into something it would execute.
 *
 * @param etag - Value from `voicePackAssetETag`
 */
export function voicePackAssetCacheHeaders(etag: string): Record<string, string> {
  return {
    'Cache-Control': VOICE_PACK_ASSET_CACHE_CONTROL,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  }
}
