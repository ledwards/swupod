// @ts-nocheck
/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Configured via env:
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name (default: "ptp-eval-captures")
 *
 * If any of the first three are missing, isR2Configured() returns false
 * and callers should fall back to local-disk storage.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'ptp-eval-captures'

let _client: S3Client | null = null

export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
}

function getClient(): S3Client {
  if (_client) return _client
  if (!isR2Configured()) throw new Error('R2 not configured')
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
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
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export const R2_BUCKET_NAME = R2_BUCKET
