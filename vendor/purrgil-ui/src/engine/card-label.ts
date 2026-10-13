import details from './card-details.json';
import names from './card-names.json';

/** Display names only. Engine identity and action values keep their original codes. */
export function cardLabel(value:string):string {
 const code=value.match(/\b(?:[A-Z0-9]+[_-]\d{3}|TOKEN[_-][A-Z]+)\b/)?.[0].replaceAll('_','-');
 const detail=code?(details as Record<string,{name:string;subtitle?:string}>)[code]:undefined;
 if(detail)return [detail.name,detail.subtitle].filter(Boolean).join(', ');
 if(code&&(names as Record<string,string>)[code])return (names as Record<string,string>)[code];
 const label=value.replace(/\s*\([^)]*\b[A-Z0-9]+[_-]\d{3}\b[^)]*\)/g,'').trim();
 return !label||/^[A-Z0-9]+[_-]\d{3}$/.test(label)?'Card':label;
}
export function namedCardReferences(text:string):string {
 return text.replace(/(?:([\p{L}\p{N}][\p{L}\p{N} ,’'!:\-]*?)\s+)?\(([A-Z0-9]+[_-]\d{3})\)/gu,(_whole,prefix:string|undefined,code:string)=>{
  // Parenthetical IDs follow names in action labels; preserve the surrounding prose.
  const name=cardLabel(code), title=(details as Record<string,{name:string}>)[code.replace('_','-')]?.name;
  return prefix&&title?prefix.replace(new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`),name):prefix??name;
 }).replace(/\b[A-Z0-9]+[_-]\d{3}\b/g,code=>cardLabel(code));
}
/** The card's title without its subtitle, for action captions such as "Deploy Tarfful". */
export function cardTitle(value:string):string {
 const code=value.match(/\b(?:[A-Z0-9]+[_-]\d{3}|TOKEN[_-][A-Z]+)\b/)?.[0].replaceAll('_','-');
 const detail=code?(details as Record<string,{name:string}>)[code]:undefined;
 return detail?.name??cardLabel(value);
}
