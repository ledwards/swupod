import {PtpPlayError} from './playState'
export type PlayFormat='premier'|'eternal'|'limited'
export type LimitedFormat='draft'|'six'|'eight'|'chaos'
export interface QueueContract {format:PlayFormat;limited:LimitedFormat;set:string;pool:'current'|'next';policy:string}
export const PLAY_POLICY='2026-10-08.1'
export function queueContract(input:Record<string,unknown>):QueueContract {
 if(!['premier','eternal','limited'].includes(String(input.format))||!['draft','six','eight','chaos'].includes(String(input.limited))||!['current','next'].includes(String(input.pool)))throw new PtpPlayError(400,'invalid_format','Choose a format and card pool.')
 if(input.pool!=='current')throw new PtpPlayError(409,'preview_unavailable','Next Set practice is not available yet. Choose Current.')
 const format=input.format as PlayFormat,limited=input.limited as LimitedFormat
 const set=typeof input.set==='string'?input.set:''
 if(format==='limited'&&limited!=='chaos'&&!/^[A-Z0-9]{3}$/.test(set))throw new PtpPlayError(400,'invalid_set','Choose a limited set.')
 return {format,limited,set:format==='limited'&&limited!=='chaos'?set:'',pool:'current',policy:PLAY_POLICY}
}
export function limitedCompatible(c:QueueContract,deck:{setCode:string;poolType:string;packCount:number|null}) {
 return c.format==='limited'&&(c.limited==='chaos'||(deck.setCode===c.set&&(c.limited==='draft'?deck.poolType==='draft'&&deck.packCount===3:deck.poolType==='sealed'&&deck.packCount===(c.limited==='six'?6:8))))
}
export function contractKey(c:QueueContract){return JSON.stringify([c.policy,c.format,c.pool,c.format==='limited'?c.limited:null,c.set])}
export function contractLabel(c:QueueContract){return c.format==='limited'?(c.limited==='chaos'?'Limited · Chaos':`${c.set} · ${c.limited==='draft'?'Draft':`Sealed · ${c.limited==='six'?6:8} packs`}`):c.format==='eternal'?'Eternal':'Premier'}
