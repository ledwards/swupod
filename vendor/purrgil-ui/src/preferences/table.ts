import {normalizePlaymatId} from './playmats';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
import {createContext,useEffect, useState} from 'react';
import {defaultThemeId, normalizeThemeId} from './theme-contract';

export type Preferences = {interactionStyle?: InteractionPreset | 'custom'; tableFit: 'artwork' | 'space'; showKeybindingHints:boolean; animations:boolean; theme: string; playmat: string; cards: 'full' | 'cinematic'; placement: 'center' | 'side'; stats: 'natural' | 'intelligent'; opponentUpsideDown: boolean; tokens: 'real' | 'aggregated'; inspection:'click'|'hover'; hoverZoom:boolean; hoverDelay:'2000'; inspectionPlacement:'docked'|'floating'; decisions:'contextual'|'center'|'side'; legalEmphasis:'subtle'|'prominent'; motion:'system'|'full'|'reduced'|'minimal'; guidance:'compact'|'expanded'};
export const defaults: Preferences = {tableFit:'artwork',showKeybindingHints:true, animations:true, theme: defaultThemeId, playmat: 'none', cards: 'full', placement: 'center', stats: 'natural', opponentUpsideDown: false, tokens:'real',inspection:'hover',hoverZoom:true,hoverDelay:'2000',inspectionPlacement:'docked',decisions:'contextual',legalEmphasis:'prominent',motion:'system',guidance:'compact'};

export function sanitize(value: unknown): Preferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...(['tabletop','streamlined','guided','custom'].includes(String(v.interactionStyle)) ? {interactionStyle:v.interactionStyle as Preferences['interactionStyle']} : {}),
    theme: normalizeThemeId(v.theme),
    playmat: normalizePlaymatId(v.playmat),
    tableFit: v.tableFit === 'space' ? 'space' : 'artwork',
    showKeybindingHints:v.showKeybindingHints!==false,
    animations:v.animations!==false,
    // Older presets disabled inspection as a side effect; hover zoom is independent.
    hoverZoom:v.hoverZoom!==false,
    hoverDelay:'2000',
    inspection:v.inspection==='click'?'click':'hover',
    inspectionPlacement:v.inspectionPlacement==='floating'?'floating':'docked',
    decisions:v.decisions==='center'||v.decisions==='side'?v.decisions:'contextual',
    legalEmphasis:v.legalEmphasis==='subtle'?'subtle':'prominent',
    motion:['full','reduced','minimal'].includes(String(v.motion))?v.motion as Preferences['motion']:'system',
    guidance:v.guidance==='expanded'?'expanded':'compact',
    tokens: v.tokens === 'aggregated' ? 'aggregated' : 'real',
    stats: v.stats === 'intelligent' ? 'intelligent' : 'natural',
    opponentUpsideDown: v.opponentUpsideDown === true,
    cards: v.cards === 'cinematic' ? 'cinematic' : 'full',
    placement: (v.placement === 'side' || v.placement === 'player') ? 'side' : 'center',
  };
}

export function hasSavedPreferences(){try{return !!(readPreferenceCookie('purrgil-table-v1')||localStorage.getItem('purrgil-table-v1'));}catch{return false;}}

export function readPreferences() {
  try { const saved=readPreferenceCookie('purrgil-table-v1')??localStorage.getItem('purrgil-table-v1');const p=sanitize(JSON.parse(saved??'{}'));if(saved)writePreferenceCookie('purrgil-table-v1',JSON.stringify(p));return p; }
  catch { return {...defaults}; }
}

export function writePreferences(value: Preferences) {
  const p = sanitize(value);
  writePreferenceCookie('purrgil-table-v1',JSON.stringify(p));
  try { localStorage.setItem('purrgil-table-v1', JSON.stringify(p)); }
  catch { /* Storage can be unavailable in private browsing. */ }
  window.dispatchEvent(new Event('purrgil-preferences'));
  return p;
}

export function useTablePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    const refresh = () => setPreferences(readPreferences());
    const storage = (event: StorageEvent) => {
      if (event.key === 'purrgil-table-v1' || event.key === null) refresh();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('purrgil-preferences', refresh);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('purrgil-preferences', refresh);
    };
  }, []);
  return [preferences, setPreferences] as const;
}

export const TableInteractionContext=createContext(defaults);
type PresetSettings=Pick<Preferences,'inspection'|'inspectionPlacement'|'decisions'|'stats'|'tokens'|'legalEmphasis'|'motion'|'guidance'>;
export const interactionPresets:Record<'tabletop'|'streamlined'|'guided',{name:string;description:string;settings:PresetSettings}>={
 tabletop:{name:'Tabletop',description:'Physical stats, individual tokens, click inspection in the panel, contextual decisions, subtle legal cues, reduced motion, compact guidance.',settings:{inspection:'click',inspectionPlacement:'docked',decisions:'contextual',stats:'natural',tokens:'real',legalEmphasis:'subtle',motion:'reduced',guidance:'compact'}},
 streamlined:{name:'Streamlined',description:'Calculated stats, aggregated tokens, click inspection in the panel, side decisions where they fit, prominent legal cues, minimal motion, compact guidance.',settings:{inspection:'click',inspectionPlacement:'docked',decisions:'side',stats:'intelligent',tokens:'aggregated',legalEmphasis:'prominent',motion:'minimal',guidance:'compact'}},
 guided:{name:'Guided',description:'Calculated stats, aggregated tokens, click inspection in the panel, centered decisions where appropriate, prominent legal cues, system motion, expanded guidance.',settings:{inspection:'click',inspectionPlacement:'docked',decisions:'center',stats:'intelligent',tokens:'aggregated',legalEmphasis:'prominent',motion:'system',guidance:'expanded'}},
};
export type InteractionPreset=keyof typeof interactionPresets;
export function matchingPreset(value:Preferences):InteractionPreset|'custom'{
 if(value.interactionStyle==='custom')return 'custom';
 return (Object.keys(interactionPresets) as InteractionPreset[]).find(id=>Object.entries(interactionPresets[id].settings).every(([key,v])=>value[key as keyof Preferences]===v))??'custom';
}
export function applyInteractionPreset(value:Preferences,id:InteractionPreset):Preferences{return {...value,...interactionPresets[id].settings,interactionStyle:id};}
