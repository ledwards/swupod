 'use client'
import {useEntryParams} from './EntryRoute'
import {useRouter} from 'next/navigation'
import EntryShell from './EntryShell'
import LeaderDraftResults from '../LeaderDraftResults'
import PlayWorkspace from '../SharedPlay/PlayWorkspace'
export default function EntryPlay(){const params=useEntryParams(),router=useRouter();const limited=params.get('limited'),set=params.get('set'),format=params.get('format');const initialContract=limited||set||format?{...(format==='premier'||format==='eternal'?{format:format as 'premier'|'eternal'}:limited?{format:'limited' as const}:{}),...(limited&&['draft','six','eight','chaos'].includes(limited)?{limited:limited as 'draft'|'six'|'eight'|'chaos'}:{}),...(set?{set}:{})}:undefined;return <EntryShell back={{label:'Back',onClick:()=>router.push('/')}}><PlayWorkspace endpoint="/api/play/native/shared" {...(initialContract?{initialContract}:{})} renderDeckDetails={poolShareId=><LeaderDraftResults key={poolShareId} poolShareId={poolShareId} collapsed/>} renderDeckActions={deck=>deck.poolType==='draft'?<button disabled={!deck.ready} onClick={()=>router.push(`/pools/${encodeURIComponent(deck.poolShareId)}/play/practice`)}>Competitive Practice Mode <span>(Swiss rounds and an elimination bracket vs AI, with this draft)</span></button>:null} initialPool={params.get('pool')??''} loginUrl="/api/auth/signin/discord?return_to=%2Fplay"/></EntryShell>}

export type EntryDeck = {
  poolShareId: string
  name: string
  setCode: string
  poolType: string
  leaderName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl?: string | null
  baseName?: string | null
  setName?: string | null
  mainDeckCount: number
  ready: boolean
  aiOpponentReady?: boolean
  bracketEligible?: boolean
  complete?: boolean
  blocker: string | null
  editLocked: boolean
  packCount: number | null
}
