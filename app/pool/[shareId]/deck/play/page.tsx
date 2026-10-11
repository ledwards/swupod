import { redirect } from 'next/navigation'
import { queryRow } from '@/lib/db'
import CompetitivePlay from './CompetitivePlay'
import { viewerHasAlphaAccess } from '@/lib/viewerAccess'
import { poolPlayRoute, type PoolPlayRow } from '@/lib/playSetup'

// Solo completion offers every play destination; group play retains its route (see poolPlayRoute).
export default async function DeckPlayPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const pool = await queryRow(`SELECT source.pool_type, source.set_code, source.pod_id, CASE WHEN jsonb_typeof(source.packs)='array' THEN jsonb_array_length(source.packs) END AS pack_count, p.settings,p.share_id AS pod_share_id,p.competitive
    FROM card_pools build JOIN card_pools source ON source.id=COALESCE(build.parent_pool_id,build.id)
    LEFT JOIN pods p ON p.id=source.pod_id WHERE build.share_id=$1`,[shareId]) as PoolPlayRow | null
  const route = poolPlayRoute(shareId, pool, await viewerHasAlphaAccess())
  if ('competitive' in route) return <CompetitivePlay shareId={shareId} podShareId={String(pool?.pod_share_id)} setCode={String(pool?.set_code)}/>
  redirect(route.redirect)
}
