import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ReleaseNotesButton} from '@purrgil/ui/components/ReleaseNotes';
import {AfterIdle} from '../components/AfterIdle';
import {ThemesModal} from '@purrgil/ui/components/ThemesButton';
import {Settings} from '@purrgil/ui/components/Settings';
import {useTablePreferences,writePreferences} from '@purrgil/ui/preferences/table';
import {useTableTheme} from '@purrgil/ui/preferences/use-table-theme';
import {artworkThumbnailUrl} from '@purrgil/ui/artwork';
import {themeById,themeProperties} from '@purrgil/ui/preferences/theme-contract';
import {lobbyRequest,type LobbyState} from '@purrgil/ui/transport/lobby';

/** The PTP root shell uses the actual Purrgil dialogs, without game-board window controls. */
export function WebsiteControls({panel,onClose,notesElement}:{panel:string|null;onClose:()=>void;notesElement?:HTMLElement}){
 const [preferences,setPreferences]=useTablePreferences();
 const {themes}=useTableTheme(preferences.theme);
 const theme=themes.length?themeById(themes,preferences.theme):undefined;
 const [account,setAccount]=useState<LobbyState['user']>(null);
 useEffect(()=>{if(panel!=='settings')return;const controller=new AbortController();void lobbyRequest<LobbyState>('',undefined,controller.signal).then(state=>setAccount(state.user)).catch(()=>{});return()=>controller.abort();},[panel]);
 return <div className="app table-themed lobby-app website-controls" style={theme?themeProperties(theme) as CSSProperties:undefined}>
  {notesElement&&createPortal(<AfterIdle><ReleaseNotesButton brand="Protect the Pod"/></AfterIdle>,notesElement)}
  {panel==='themes'&&<ThemesModal controls={false} onClose={onClose}/>}
  {panel==='settings'&&<Settings controls={false} value={preferences} onChange={value=>setPreferences(writePreferences(value))} account={account} onClose={onClose} themePicker={<div className="lobby-theme-options">{themes.map(theme=><button key={theme.id} aria-pressed={preferences.theme===theme.id} onClick={()=>setPreferences(writePreferences({...preferences,theme:theme.id}))}><img src={artworkThumbnailUrl(theme.background.image)} alt="" loading="lazy"/><span>{theme.name}</span></button>)}</div>}/>}
 </div>;
}
