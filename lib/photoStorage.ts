// @ts-nocheck
/**
 * Storage layer for the import-pool upload pipeline.
 *
 * Each photo gets uploaded to R2 (or /tmp on dev) keyed by
 *   import-uploads/<userId>/<ts>-<rand>.<ext>
 * The wizard hands those keys to /api/import/extract, which fetches the
 * bytes back and runs them through Opus. Sidesteps Next.js's ~10MB
 * JSON body cap that two iPhone photos always exceed when base64-encoded.
 *
 * Same R2/local-fallback pattern as lib/evalCapture.ts. R2 is preferred
 * when configured (R2_BUCKET_NAME etc.), falls back to /tmp/import-uploads
 * for dev when not.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { isR2Configured } from './r2'

const LOCAL_ROOT = '/tmp/import-uploads'

let _client: S3Client | null = null
function getR2(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

export async function uploadPhoto(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (isR2Configured()) {
    try {
      const client = getR2()
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      )
      return
    } catch (err) {
      console.warn('[photoStorage] R2 upload failed, falling back to local:', err)
    }
  }
  // Local fallback for dev when R2 isn't configured.
  const localPath = join(LOCAL_ROOT, key)
  mkdirSync(dirname(localPath), { recursive: true })
  writeFileSync(localPath, body)
}

export async function fetchPhoto(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (isR2Configured()) {
    try {
      const client = getR2()
      const out = await client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: key,
        }),
      )
      const stream = out.Body as any
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return {
        buffer: Buffer.concat(chunks),
        contentType: out.ContentType || 'application/octet-stream',
      }
    } catch (err) {
      console.warn('[photoStorage] R2 fetch failed for', key, '— trying local fallback:', err)
    }
  }
  const localPath = join(LOCAL_ROOT, key)
  const buffer = readFileSync(localPath)
  // Best-effort content-type from extension.
  const ext = key.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : ext === 'heic'
              ? 'image/heic'
              : ext === 'heif'
                ? 'image/heif'
                : 'application/octet-stream'
  return { buffer, contentType }
}
