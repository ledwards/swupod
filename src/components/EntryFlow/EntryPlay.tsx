 'use client'
import {useEntryParams} from './EntryRoute'
import {useRouter} from 'next/navigation'
import EntryShell from './EntryShell'
import LeaderDraftResults from '../LeaderDraftResults'
import PlayWorkspace from '../SharedPlay/PlayWorkspace'
export default function EntryPlay(){const params=useEntryParams(),router=useRouter();return <EntryShell back={{label:'Back',onClick:()=>router.push('/')}}><PlayWorkspace endpoint="/api/play/native/shared" renderDeckDetails={poolShareId=><LeaderDraftResults key={poolShareId} poolShareId={poolShareId} collapsed/>} initialPool={params.get('pool')??''} loginUrl="/api/auth/signin/discord?return_to=%2Fplay"/></EntryShell>}

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
