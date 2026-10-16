import {notFound} from 'next/navigation'
import {queryRow} from '@/lib/db'
import {viewerHasAlphaAccess} from '@/lib/viewerAccess'
import DraftPool from '@/app/draft_pool/[shareId]/page'
import SealedPool from '@/app/sealed_pool/[shareId]/SealedPoolClient'
import PoolPage from '@/src/components/PoolPage/PoolPage'
export default async function Page({params}:{params:Promise<{shareId:string}>}){
 const {shareId}=await params
 const pool=await queryRow('SELECT pool_type FROM card_pools WHERE share_id=$1',[shareId])
 if(!pool)notFound()
 // Alpha testers get the themed pool page; everyone else keeps the current draft/sealed pool pages.
 if(await viewerHasAlphaAccess())return <PoolPage shareId={shareId} poolType={pool.pool_type==='draft'?'draft':'sealed'}/>
 return pool.pool_type==='draft'?<DraftPool params={params}/>:<SealedPool shareId={shareId}/>
}
