import {namedCardReferences} from '../engine/card-label';
import {keywords,traits} from './rules-lexicon';
const aspects=['vigilance','command','aggression','cunning','villainy','heroism'];
export const unavailableText='This choice could not be displayed. Please reconnect.';

/** Decode presentation syntax only. Variables must be resolved by the engine adapter. */
export function formatRulesText(input:string):{text:string;unresolved:boolean}{
 let unresolved=/\[object Object\]|\b(?:undefined|NaN)\b/.test(input);
 let text=namedCardReferences(input).replace(/\{([^{}]+)\}/g,(_whole,token:string)=>{
  const [kind,value]=token.split(':');
  if(kind==='keyword'&&value&&keywords.includes(value.toUpperCase()))return value.toUpperCase();
  if(kind==='trait'&&value&&traits.some(t=>t.toLowerCase()===value.toLowerCase()))return value.toUpperCase();
  if(kind==='resource'&&/^\d+$/.test(value??''))return `[${value} resources]`;
  if(kind==='exhaust'&&!value)return '[exhaust]';
  if(kind==='aspect'&&aspects.includes(value))return `[${value}]`;
  unresolved=true;return '';
 });
 text=text.replace(/:(vigilance|command|aggression|cunning|villainy|heroism|exhaust):/gi,'[$1]')
  .replace(/<uq>/gi,'\uF6D9UNIQUE')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/<[^>]*>/g,'')
  .replace(/\uF6D9UNIQUE/g,'<uq>')
  .replace(/!?\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/(\*\*|__|~~|`+)([\s\S]*?)\1/g,'$2')
  .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?]|$)/g,'$1$2')
  .replace(/^\s{0,3}#{1,6}\s+/gm,'')
  .replace(/\[([^\]]+)\]/g,(whole,content:string)=>/^(?:\d+ resources?|exhaust|vigilance|command|aggression|cunning|villainy|heroism|\uF6D9)(?:[,\s]|$)/i.test(content)?whole:content);
 if(/[{}]|\$\{|\[object Object\]|\b(?:undefined|NaN)\b/.test(text))unresolved=true;
 return {text:unresolved?unavailableText:text,unresolved};
}

/** Accessible labels must describe symbols, not expose their serialization. */
export function rulesTextLabel(input:string):string{
 return formatRulesText(input).text.replace(/<uq>/g,'unique ').replace(/\uF6D9/g,'exhaust').replace(/\[([^\]]+)\]/g,'$1');
}
