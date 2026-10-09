export const MELEE_LINK_NOTICE_VERSION='2026-10-08'
export async function callMeleeRewardLink(discordId:string, input:Record<string,unknown>, fetcher:typeof fetch=fetch) {
  const key=process.env['PTP_REWARD_LINK_SERVICE_KEY']
  const origin=process.env['WAYFINDER_REWARD_LINK_ORIGIN'] || 'https://plugin.wayfinder.news'
  if(!key || key.length<32) return {status:503,data:{error:'Melee connections are not available yet. Please try again later.'}}
  const endpoint=new URL('/api/reward-links/melee',origin)
  if(endpoint.protocol!=='https:' && !['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Invalid reward service origin')
  const response=await fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(40000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({...input,discordId})})
  const data=await response.json() as Record<string,unknown>
  return {status:response.status,data}
}
