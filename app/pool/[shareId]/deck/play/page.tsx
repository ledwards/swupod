import {betaExperienceEnabled} from '@/src/services/entry/rollout'
import { redirect } from 'next/navigation'
import {cookies} from 'next/headers'
import {getSessionFromCookieHeader} from '@/lib/auth'
import {hasEntryAccess} from '@/src/services/entry/access'
import { queryRow } from '@/lib/db'
import CompetitivePlay from './CompetitivePlay'
import LegacyDeckPlay from './LegacyDeckPlay'

// Non-alpha users (everyone but admins/alpha testers with the rollout on) get the
// pre-alpha deck Play page for every pool kind. Alpha: solo completion goes
// directly to AI preparation; group play retains its route.
export default async function DeckPlayPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const beta=betaExperienceEnabled()&&hasEntryAccess(getSessionFromCookieHeader((await cookies()).toString()))
  if(!beta)return <LegacyDeckPlay shareId={shareId}/>
  const pool = await queryRow(`SELECT source.pool_type, source.set_code, source.pod_id, p.settings,p.share_id AS pod_share_id,p.competitive
    FROM card_pools build JOIN card_pools source ON source.id=COALESCE(build.parent_pool_id,build.id)
    LEFT JOIN pods p ON p.id=source.pod_id WHERE build.share_id=$1`,[shareId])
  const settings=typeof pool?.settings==='string'?JSON.parse(pool.settings):pool?.settings
  if(pool?.competitive===true&&pool.pod_share_id)return <CompetitivePlay shareId={shareId} podShareId={String(pool.pod_share_id)} setCode={String(pool.set_code)}/>
  const solo=(pool?.pool_type==='sealed'&&!pool.pod_id)||(pool?.pool_type==='draft'&&(settings as {isSolo?:boolean}|null)?.isSolo===true)
  if(!solo&&pool?.pod_share_id&&pool.competitive!==true)redirect(`/${pool.pool_type==='draft'?'draft':'sealed'}/${encodeURIComponent(String(pool.pod_share_id))}/pod`)
  redirect(beta?`/pools/${encodeURIComponent(shareId)}/play${solo?'/ai':''}`:`/play/solo?pool=${encodeURIComponent(shareId)}`)
}
