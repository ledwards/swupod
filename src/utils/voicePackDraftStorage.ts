/**
 * Creator voice-pack draft storage — the I/O half of "don't lose my work".
 *
 * Shapes, keys and parsing rules live in `src/services/voicePackDraft.ts` (pure,
 * tested). This module only talks to the browser: IndexedDB for the audio blobs,
 * localStorage for the three text fields.
 *
 * EVERY ENTRY POINT DEGRADES. Private browsing, a full quota, a blocked
 * upgrade, a browser with no IndexedDB at all — none of it may crash the page or
 * block a recording. Reads resolve to "nothing stored", writes resolve to
 * `false`, and the form carries on exactly as it did before drafts existed.
 * That is why nothing here rejects.
 */
import {
  VOICE_PACK_DRAFT_DB_NAME,
  VOICE_PACK_DRAFT_DB_VERSION,
  VOICE_PACK_DRAFT_STORE,
  parseVoicePackDraftText,
  restoredClipFile,
  serializeVoicePackDraftText,
  storedClipRecord,
  voicePackDraftClipKey,
  voicePackDraftClipKeys,
  voicePackDraftTextKey,
  VOICE_PACK_DRAFT_SLOTS,
  VOICE_PACK_LOGO_SLOT,
  type StoredClipRecord,
  type VoicePackDraftSlot,
  type VoicePackDraftText,
} from '../services/voicePackDraft'
import { type VoicePackClipType } from '../services/voicePacks'

/** What one invite's saved draft holds. */
export interface VoicePackDraftSnapshot {
  text: VoicePackDraftText | null
  clips: Partial<Record<VoicePackClipType, File>>
  /** The pack logo, restored the same way the clips are. */
  logo: File | null
}

const EMPTY_SNAPSHOT: VoicePackDraftSnapshot = { text: null, clips: {}, logo: null }

/**
 * Open (and create on first use) the draft database, or resolve null when this
 * browser will not give us one.
 */
function openDraftDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      request = indexedDB.open(VOICE_PACK_DRAFT_DB_NAME, VOICE_PACK_DRAFT_DB_VERSION)
    } catch {
      // Firefox private browsing throws here rather than firing onerror.
      return resolve(null)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(VOICE_PACK_DRAFT_STORE)) {
        db.createObjectStore(VOICE_PACK_DRAFT_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/** Run one transaction, resolving null on any failure. */
function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T | null) => void) => void
): Promise<T | null> {
  return openDraftDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        let settled = false
        const finish = (value: T | null) => {
          if (settled) return
          settled = true
          resolve(value)
        }
        try {
          const tx = db.transaction(VOICE_PACK_DRAFT_STORE, mode)
          tx.onerror = () => finish(null)
          tx.onabort = () => finish(null)
          run(tx.objectStore(VOICE_PACK_DRAFT_STORE), finish)
        } catch {
          finish(null)
        }
      })
  )
}

/**
 * Everything saved for one invite: the text fields and whichever clips exist.
 * Resolves to an empty snapshot when storage is unavailable.
 *
 * @param token - Invite token from the URL
 */
export async function loadVoicePackDraft(token: string): Promise<VoicePackDraftSnapshot> {
  if (!token) return EMPTY_SNAPSHOT

  let text: VoicePackDraftText | null = null
  try {
    text = parseVoicePackDraftText(window.localStorage.getItem(voicePackDraftTextKey(token)))
  } catch {
    /* private browsing — no text draft, carry on */
  }

  // One pass over every slot — the seven clips plus the logo, which is stored
  // exactly like a clip so it survives a closed tab the same way.
  const found = await withStore<Partial<Record<VoicePackDraftSlot, File>>>('readonly', (store, done) => {
    const acc: Partial<Record<VoicePackDraftSlot, File>> = {}
    let pending = VOICE_PACK_DRAFT_SLOTS.length
    for (const slot of VOICE_PACK_DRAFT_SLOTS) {
      const request = store.get(voicePackDraftClipKey(token, slot))
      const settle = () => {
        pending -= 1
        if (pending === 0) done(acc)
      }
      request.onsuccess = () => {
        const file = restoredClipFile(request.result as StoredClipRecord | undefined, token)
        if (file) acc[slot] = file
        settle()
      }
      request.onerror = settle
    }
  })

  const bySlot = found ?? {}
  const { [VOICE_PACK_LOGO_SLOT]: logo, ...clips } = bySlot
  return { text, clips: clips as Partial<Record<VoicePackClipType, File>>, logo: logo ?? null }
}

/**
 * Persist one clip's audio. Returns whether it landed.
 *
 * @param token - Invite token from the URL
 * @param clip - Clip slot id
 * @param file - Recorded or picked audio
 */
export async function saveVoicePackDraftClip(
  token: string,
  clip: VoicePackDraftSlot,
  file: File
): Promise<boolean> {
  if (!token) return false
  const saved = await withStore<boolean>('readwrite', (store, done) => {
    const request = store.put(storedClipRecord(token, clip, file, Date.now()))
    request.onsuccess = () => done(true)
    request.onerror = () => done(false)
  })
  return saved === true
}

/**
 * Forget one clip — used by the per-clip discard control, so a cleared row does
 * not come back on reload.
 *
 * @param token - Invite token from the URL
 * @param clip - Clip slot id
 */
export async function deleteVoicePackDraftClip(
  token: string,
  clip: VoicePackDraftSlot
): Promise<boolean> {
  if (!token) return false
  const deleted = await withStore<boolean>('readwrite', (store, done) => {
    const request = store.delete(voicePackDraftClipKey(token, clip))
    request.onsuccess = () => done(true)
    request.onerror = () => done(false)
  })
  return deleted === true
}

/**
 * Persist the text fields. Synchronous and cheap; returns whether it landed.
 *
 * @param token - Invite token from the URL
 * @param text - Current field values
 */
export function saveVoicePackDraftText(token: string, text: VoicePackDraftText): boolean {
  if (!token) return false
  try {
    window.localStorage.setItem(
      voicePackDraftTextKey(token),
      serializeVoicePackDraftText(text, Date.now())
    )
    return true
  } catch {
    // Quota or private browsing. The in-memory form is unaffected.
    return false
  }
}

/**
 * Drop the whole draft for one invite. Called after a successful submit so a
 * creator who later reopens the spent link never meets ghost data.
 *
 * @param token - Invite token from the URL
 */
export async function clearVoicePackDraft(token: string): Promise<void> {
  if (!token) return
  try {
    window.localStorage.removeItem(voicePackDraftTextKey(token))
  } catch {
    /* nothing to clean up */
  }
  await withStore<boolean>('readwrite', (store, done) => {
    for (const key of voicePackDraftClipKeys(token)) {
      try {
        store.delete(key)
      } catch {
        /* keep deleting the rest */
      }
    }
    done(true)
  })
}
