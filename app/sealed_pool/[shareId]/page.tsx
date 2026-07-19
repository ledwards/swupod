import { notFound, redirect } from 'next/navigation'
import { queryRow } from '@/lib/db'
import SealedPoolClient from './SealedPoolClient'

interface PageProps {
  params: Promise<{ shareId: string }>
}

// Server component: gate existence BEFORE rendering so a missing pool returns a
// real HTTP 404 status (not a 200 shell that client-renders a not-found). Pools
// are keyed by card_pools.share_id; a draft pool lives at /draft_pool.
//
// The pods join MUST be a LEFT JOIN: card_pools.pod_id is NULL for every pool
// created outside a pod — chaos sealed, pack blitz, pack wars, rotisserie, and
// /api/pools all insert without one. An INNER JOIN 404s all of them.
export default async function SealedPoolPage({ params }: PageProps) {
  const { shareId } = await params

  const row = await queryRow(
    `SELECT p.pod_type
       FROM card_pools cp
       LEFT JOIN pods p ON p.id = cp.pod_id
      WHERE cp.share_id = $1
      LIMIT 1`,
    [shareId],
  )

  if (!row) {
    notFound() // → HTTP 404
  }

  if (row.pod_type === 'draft') {
    redirect(`/draft_pool/${shareId}`)
  }

  return <SealedPoolClient shareId={shareId} />
}
