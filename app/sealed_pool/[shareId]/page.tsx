import { notFound, redirect } from 'next/navigation'
import { queryRow } from '@/lib/db'
import SealedPoolClient from './SealedPoolClient'

interface PageProps {
  params: Promise<{ shareId: string }>
}

// Server component: gate existence BEFORE rendering so a missing pool returns a
// real HTTP 404 status (not a 200 shell that client-renders a not-found). Pools
// are keyed by card_pools.share_id; a draft pool lives at /draft_pool.
export default async function SealedPoolPage({ params }: PageProps) {
  const { shareId } = await params

  const row = await queryRow(
    `SELECT p.pod_type
       FROM card_pools cp
       JOIN pods p ON p.id = cp.pod_id
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
