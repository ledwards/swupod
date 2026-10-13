import {renderToString} from 'react-dom/server';
import Lobby from '../components/Lobby';
import {markPtpSite} from './shared';
markPtpSite();
/** Build the initial HTML from the real UI, so the host never shows a loading interstitial. */
export function renderShell(path:string){return renderToString(<Lobby ptpHome initialUrl={path}/>);}
