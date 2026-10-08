// @ts-nocheck
/**
 * Tiny IndexedDB wrapper for persisting Import Pool source images across
 * page refreshes. localStorage tops out at ~5–10MB which fills up fast
 * with two 2MP photos as base64; IndexedDB has hundreds of MB to spare.
 *
 * Single-record store — we always overwrite the whole array, no incremental
 * updates. The wizard owns the lifecycle: write on every state change,
 * clear on Reset, load on initial mount.
 *
 * Synchronous code paths (the useReducer lazy initializer) read from
 * localStorage; images come back asynchronously via loadImages() after
 * mount and get dispatched into state.
 */

import type { ProcessedImage } from './imagePrep'

const DB_NAME = 'import-pool'
const DB_VERSION = 1
const STORE = 'images'
const KEY = 'current'

type DB = IDBDatabase

let dbPromise: Promise<DB | null> | null = null

function openDb(): Promise<DB | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

export async function saveImages(images: ProcessedImage[]): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(images, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function loadImages(): Promise<ProcessedImage[]> {
  const db = await openDb()
  if (!db) return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as ProcessedImage[]) || [])
      req.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

export async function clearImages(): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
