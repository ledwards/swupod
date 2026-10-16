import { redirect } from 'next/navigation'
import { queryRow } from '@/lib/db'
import { viewerHasAlphaAccess } from '@/lib/viewerAccess'
import PoolRedirectLegacy from './PoolRedirectLegacy'

/**
 * /pool/[shareId] forwards to /pools/[shareId]. Alpha testers are redirected on
 * the server when the pool exists; a pool still being saved (and everyone else)
 * goes through the client redirect, which retries until it appears.
 */
export default async function PoolRedirectPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  if (await viewerHasAlphaAccess()) {
    const pool = await queryRow('SELECT 1 FROM card_pools WHERE share_id=$1', [shareId])
    if (pool) redirect(`/pools/${encodeURIComponent(shareId)}`)
  }
  return <PoolRedirectLegacy params={params}/>
}
