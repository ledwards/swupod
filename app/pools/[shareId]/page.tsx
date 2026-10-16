import {notFound} from 'next/navigation'
import {queryRow} from '@/lib/db'
import DraftPool from '@/app/draft_pool/[shareId]/page'
import SealedPool from '@/app/sealed_pool/[shareId]/SealedPoolClient'
export default async function Page({params}:{params:Promise<{shareId:string}>}){
 const {shareId}=await params
 const pool=await queryRow('SELECT pool_type FROM card_pools WHERE share_id=$1',[shareId])
 if(!pool)notFound()
 return pool.pool_type==='draft'?<DraftPool params={params}/>:<SealedPool shareId={shareId}/>
}
