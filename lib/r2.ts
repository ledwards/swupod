/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Env var names mirror ../wayfinder/apps/web/src/server/storage/images.ts
 * so the same Cloudflare account credentials drop in here unchanged —
 * only the bucket needs to be different.
 *
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET_NAME        — bucket name (e.g. ptp-eval-captures)
 *   R2_PUBLIC_URL         — optional, public URL prefix for read access
 *
 * If any of the first three are missing, isR2Configured() returns false
 * and callers should fall back to local-disk storage.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

let _client: S3Client | null = null

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  )
}

function getClient(): S3Client {
  if (_client) return _client
  if (!isR2Configured()) throw new Error('R2 not configured')
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

/** Upload a single object. Body can be Buffer or string. */
export async function r2Put(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

/** The bucket name in use, for log/diagnostic messages. */
export function r2BucketName(): string | undefined {
  return process.env.R2_BUCKET_NAME
}
