import {getAllCards} from '../../utils/cardData'
import {SET_CONFIGS,isCurrentPoolSet} from '../../utils/setConfigs'
import {getPremierLegalSets} from '../../utils/setConfigs/latest'
import {PLAY_POLICY} from './formats'
import type {LegalityCard} from './constructedValidation'

export function currentPoolSets(now=new Date()) {
 return Object.values(SET_CONFIGS).filter(c=>isCurrentPoolSet(c,now)).sort((a,b)=>b.setNumber-a.setNumber)
}
export function currentPolicy(now=new Date()) {
 return `${PLAY_POLICY}:${currentPoolSets(now).map(c=>c.setCode).sort().join(',')}`
}
export function cardCatalog(now=new Date()):LegalityCard[] {
 const premier=getPremierLegalSets(now),current=new Set<string>(currentPoolSets(now).map(c=>c.setCode))
 return getAllCards().map(c=>({id:String(('collectorSetAndNumber' in c?c.collectorSetAndNumber:null)??c.cardId).replace('-','_'),name:c.name,subtitle:c.subtitle,type:c.type,set:c.set,released:current.has(c.set),premier:premier.has(c.set),placeholder:Boolean(c.isPlaceholder)})).filter(c=>c.id!=='undefined')
}
