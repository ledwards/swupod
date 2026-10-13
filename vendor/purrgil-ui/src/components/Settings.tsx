import {MeleeSettings} from './MeleeSettings';
import {useId,useState,type ReactNode} from 'react';
import {lobbyRequest,type LobbyState} from '../transport/lobby';
import {KeybindingHintsToggle} from './KeybindingHints';
import {DecisionDialog} from './DecisionDialog';
import {applyInteractionPreset,interactionPresets,matchingPreset,type InteractionPreset,type Preferences} from '../preferences/table';

export function Settings({value,onChange,onClose,visibilityOnly=false,controls=true,account,themePicker}:{themePicker?:ReactNode;account?:LobbyState['user'];controls?:boolean;visibilityOnly?:boolean;value:Preferences;onChange:(p:Preferences)=>void;onClose:()=>void}){
 const [tab,setTab]=useState<'Account'|'Gameplay'|'Theme'>('Account');const tabsId=useId();const tabbed=account!==undefined;
 const [loggingOut,setLoggingOut]=useState(false),[logoutError,setLogoutError]=useState('');
 async function logout(){setLoggingOut(true);setLogoutError('');try{await lobbyRequest('/logout',{});location.assign('/')}catch(error){setLogoutError(error instanceof Error?error.message:'Unable to log out.');setLoggingOut(false)}}
 const tabs:('Account'|'Gameplay'|'Theme')[]=themePicker?['Account','Gameplay','Theme']:['Account','Gameplay'];
 const title=tabbed?'Settings':'Table settings';
 const current=matchingPreset(value);
 const select=<K extends keyof Preferences>(key:K,label:string,options:[Preferences[K],string][])=> <div className="setting-choice"><span>{label}</span><div className="preset-options setting-options" role="group" aria-label={label}>{options.map(([id,name])=><button type="button" key={String(id)} aria-pressed={value[key]===id} onClick={()=>onChange({...value,[key]:id})}>{name}</button>)}</div></div>;
 return <DecisionDialog controls={controls} label={title} className="settings-panel gameplay-settings" onClose={onClose}>
  <header><h2>{title}</h2><button className="modal-close" aria-label="Close" title="Close" onClick={onClose}><span aria-hidden="true">×</span></button></header>
  {tabbed&&<div className="settings-tabs" role="tablist" aria-label="Settings sections">{tabs.map(name=><button key={name} type="button" role="tab" id={`${tabsId}-${name}`} aria-controls={`${tabsId}-panel`} aria-selected={tab===name} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:tabs[(tabs.indexOf(name)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setTab(next);document.getElementById(`${tabsId}-${next}`)?.focus();}}}>{name}</button>)}</div>}
  {tabbed&&tab==='Account'?<div className="settings-body account-settings" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-Account`}><h3>Connected accounts</h3><div className="settings-discord"><div className="settings-discord-heading"><strong>Discord</strong>{account&&<span>Connected</span>}</div>{account?<div className="settings-discord-profile">{account.avatarUrl?<img src={account.avatarUrl} alt="" referrerPolicy="no-referrer"/>:<span className="settings-account-initial">{Array.from(account.name)[0]?.toUpperCase()}</span>}<div><strong>{account.name}</strong></div></div>:<p><a href="/login">Log in with Discord</a> to connect your account.</p>}{account&&<><div className="settings-connection-actions"><button type="button" disabled={loggingOut} onClick={()=>void logout()}>{loggingOut?'Logging out…':'Log out'}</button></div>{logoutError&&<p role="alert">{logoutError}</p>}</>}</div>{account&&<MeleeSettings/>}</div>:tabbed&&tab==='Theme'?<div className="settings-body settings-theme-body" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-Theme`}>{themePicker}</div>:<div className="settings-body" role={tabbed?'tabpanel':undefined} id={tabbed?`${tabsId}-panel`:undefined} aria-labelledby={tabbed?`${tabsId}-Gameplay`:undefined}>{!visibilityOnly&&<><KeybindingHintsToggle/>
   <fieldset className="interaction-style"><legend>Interaction style</legend>
    <p className="setting-help">Choose from a fixed set of common presets or customize your own</p>
    <div className="preset-options" role="group" aria-label="Interaction style">{Object.entries(interactionPresets).map(([id,p])=><button type="button" key={id} aria-pressed={current===id} title={p.description} onClick={()=>onChange(applyInteractionPreset(value,id as InteractionPreset))}>{p.name}</button>)}<button type="button" aria-pressed={current==='custom'} onClick={()=>onChange({...value,interactionStyle:'custom'})}>Custom</button></div>

   </fieldset>
   </>}
   {!visibilityOnly&&current==='custom'&&<><fieldset><legend>Inspection</legend>
    {select('hoverZoom','Enlarge on hover',[[false,'Off'],[true,'On']])}
    <p className="setting-help">Hold the pointer over a card for two seconds to enlarge it. Ctrl shows it immediately.</p>
    {select('inspectionPlacement','Click inspection opens',[['docked','Game panel'],['floating','Floating inspector']])}
   </fieldset>
   <fieldset><legend>Decisions</legend>
    {select('decisions','Decision placement',[['contextual','Contextual'],['center','Prefer center'],['side','Prefer side']])}
   </fieldset>
   </>}
   {(visibilityOnly||current==='custom')&&<fieldset><legend>Readability</legend>
    {!visibilityOnly&&select('legalEmphasis','Legal-action emphasis',[['subtle','Subtle'],['prominent','Prominent']])}
    {select('stats','Stat display',[['natural','Physical tokens'],['intelligent','Calculated values']])}
    {select('tokens','Tokens',[['real','Real tokens'],['aggregated','Aggregated tokens']])}
   </fieldset>}
   <fieldset><legend>Animation</legend>
    {select('animations','Animations',[[true,'On'],[false,'Off']])}
   </fieldset>
   <fieldset><legend>Table</legend>
    {select('tableFit','Table fit',[['artwork','Maximize artwork'],['space','Maximize table space']])}
    {select('opponentUpsideDown','Opponent’s cards',[[false,'Right side up'],[true,'Upside down (mirrored)']])}
    {select('cards','Card presentation',[['full','Full cards'],['cinematic','Cinematic art']])}
    {select('placement','Leader and base',[['center','Center of board'],['side','Player area']])}
   </fieldset>
  </div>}
 </DecisionDialog>;
}
