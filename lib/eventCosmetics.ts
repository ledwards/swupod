import {queryRow} from './db'
import {callMeleeRewardLink} from './meleeRewardLink'
export type CosmeticItem={id:string;kind:'mat'|'sleeve'|'promo'|'initiative';name:string;image:string|null;backImage?:string|null;cardCode?:string|null;sourceUrl:string;available:boolean;events:{name:string;url:string}[]}
export type CosmeticCatalog={version:1;revision:string;items:CosmeticItem[]}
export type CosmeticLoadout=Partial<Record<'mat'|'sleeve'|'initiative'|'promo',string>>
export async function getCosmeticCatalog(fetcher:typeof fetch=fetch):Promise<CosmeticCatalog> {
  const response=await fetcher(new URL('/event-cosmetics',process.env['SWUAPI_URL']||'https://api.swuapi.com'),{cache:'no-store',signal:AbortSignal.timeout(8000)})
  if(!response.ok)throw new Error('Catalog unavailable')
  const data=await response.json() as CosmeticCatalog
  if(data.version!==1||typeof data.revision!=='string'||!Array.isArray(data.items))throw new Error('Invalid catalog')
  return data
}
export async function getCosmeticAccess(userId:string) {
  const user=await queryRow('SELECT discord_id,is_admin,is_beta_tester,is_patron FROM users WHERE id=$1',[userId])
  const beta=user?.is_admin===true||user?.is_beta_tester===true
  const supporter=beta&&(user?.is_admin===true||user?.is_patron===true)
  if(supporter)return {beta,supporter,status:'supporter',allowedItemIds:[] as string[],catalogRevision:'',expiresAt:0}
  if(!beta||typeof user?.discord_id!=='string')return {beta,supporter:false,status:'unlinked',allowedItemIds:[] as string[],catalogRevision:'',expiresAt:0}
  try {
    const result=await callMeleeRewardLink(user.discord_id,{action:'cosmetics'})
    const d=result.data
    if(result.status===200&&d.status==='unlinked')return {beta,supporter:false,status:'unlinked',allowedItemIds:[] as string[],catalogRevision:'',expiresAt:0}
    if(result.status!==200||d.status!=='ready'||!Array.isArray(d.allowedItemIds))throw new Error('Unavailable')
    return {beta,supporter:false,status:'ready',allowedItemIds:d.allowedItemIds.filter((id):id is string=>typeof id==='string'),catalogRevision:String(d.catalogRevision),expiresAt:Number(d.expiresAt)}
  } catch {return {beta,supporter:false,status:'unavailable',allowedItemIds:[] as string[],catalogRevision:'',expiresAt:0}}
}
export function validateCosmeticLoadout(input:unknown,catalog:CosmeticCatalog,access:Awaited<ReturnType<typeof getCosmeticAccess>>):CosmeticLoadout {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid loadout')
  const result:CosmeticLoadout={}
  for(const [slot,id] of Object.entries(input)) {
    if(!['mat','sleeve','initiative','promo'].includes(slot)||typeof id!=='string')throw new Error('Invalid cosmetic slot')
    const item=catalog.items.find(item=>item.id===id)
    if(!access.beta||!item||item.kind!==slot||!item.available||!item.image||(!access.supporter&&(!Number.isFinite(access.expiresAt)||access.expiresAt<=Date.now()||access.catalogRevision!==catalog.revision||!access.allowedItemIds.includes(id))))throw new Error('This cosmetic is locked')
    if(item.kind==='promo'&&!item.cardCode)throw new Error('Promo printing is not mapped to a playable card')
    result[slot as keyof CosmeticLoadout]=id
  }
  return result
}
export async function getCosmeticState(userId:string) {
  const [catalog,access,saved]=await Promise.all([getCosmeticCatalog(),getCosmeticAccess(userId),queryRow('SELECT items,version FROM event_cosmetic_loadouts WHERE user_id=$1',[userId])])
  const loadout:CosmeticLoadout={}
  for(const [slot,id] of Object.entries((saved?.items??{}) as object)) {
    try {Object.assign(loadout,validateCosmeticLoadout({[slot]:id},catalog,access))} catch { /* Unauthorized saved items render defaults. */ }
  }
  return {catalog,access,loadout,version:Number(saved?.version??0)}
}
