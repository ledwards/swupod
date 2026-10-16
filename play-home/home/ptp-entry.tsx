import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import Lobby from '../components/Lobby';
import {LiveStripHost} from './LiveStrip';
import {markPtpSite} from './shared';
import '../lobby.css';
import './home.css';
import '@purrgil/ui/styles.css';
import '@purrgil/ui/styles/select.css';
import '../fonts.css';
markPtpSite();
/** PTP mounts the same website UI; the game board remains on play. */
export function mount(element:HTMLElement){const root=createRoot(element);flushSync(()=>root.render(<React.StrictMode><Lobby ptpHome/></React.StrictMode>));return()=>root.unmount();}

import {WebsiteControls} from './WebsiteControls';
/** Host navigation opens the same dialogs on every PTP route. */
export function mountWebsiteControls(element:HTMLElement,notesElement?:HTMLElement){
 const root=createRoot(element);
 const open=(panel:string|null)=>flushSync(()=>root.render(<WebsiteControls notesElement={notesElement} panel={panel} onClose={()=>open(null)}/>));
 open(null);
 return {open,dispose:()=>root.unmount()};
}

/** The live-games strip alone, for PTP pages outside the shell. Returns dispose. */
export function mountLiveStrip(element:HTMLElement){const root=createRoot(element);flushSync(()=>root.render(<React.StrictMode><LiveStripHost/></React.StrictMode>));return()=>root.unmount();}
