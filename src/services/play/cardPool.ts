import {getAllCards} from '../../utils/cardData'
import {SET_CONFIGS,isCurrentPoolSet} from '../../utils/setConfigs'
import {getPremierLegalSets} from '../../utils/setConfigs/latest'
import supplemental from '../../data/constructed-supplemental.json'
import {PLAY_POLICY} from './formats'
import {copyLimit,type LegalityCard} from './constructedValidation'

export function currentPoolSets(now=new Date()) {
 return Object.values(SET_CONFIGS).filter(c=>isCurrentPoolSet(c,now)).sort((a,b)=>b.setNumber-a.setNumber)
}
export function currentPolicy(now=new Date()) {
 return `${PLAY_POLICY}:${currentPoolSets(now).map(c=>c.setCode).sort().join(',')}`
}
// Only cards whose text changes the default of 3 carry maxCopies.
const limit=(frontText:string|null|undefined)=>{const max=copyLimit(frontText);return max===3?{}:{maxCopies:max}}
export function cardCatalog(now=new Date()):LegalityCard[] {
 const premier=getPremierLegalSets(now),current=new Set<string>(currentPoolSets(now).map(c=>c.setCode))
 const core=getAllCards().map(c=>({id:String(('collectorSetAndNumber' in c?c.collectorSetAndNumber:null)??c.cardId).replace('-','_'),name:c.name,subtitle:c.subtitle,type:c.type,set:c.set,released:current.has(c.set),premier:premier.has(c.set),placeholder:Boolean(c.isPlaceholder),ptpId:typeof c.id==='string'?c.id:undefined,...limit(c.frontText)})).filter(c=>c.id!=='undefined')
 // Constructed-only products, never booster sets: kept out of limited set configuration and pack generation.
 // Intro Battle: Hoth is in rotation block A (with JTL/LOF/SEC); 2026 Twin Suns is legal in Eternal only.
 const hothReleased=now>=new Date('2025-10-03T00:00:00Z')
 return [...core,...supplemental.map(c=>({...c,...limit(c.frontText)})).map(c=>c.set==='TS26'?{...c,released:true,premier:false}:{...c,released:hothReleased,premier:premier.has('JTL')})]
}
