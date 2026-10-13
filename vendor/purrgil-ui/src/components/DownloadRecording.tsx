import {useEffect,useRef,useState} from 'react';
import {gameApiPath} from '../transport/client';

/** Downloads through the authenticated gateway; never accepts an artifact URL. */
export function DownloadRecording({path=gameApiPath('/api/recording'),label='Download log',className='',icon=false}:{path?:string;label?:string;className?:string;icon?:boolean}){
 const [busy,setBusy]=useState(false),[building,setBuilding]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[path]);
 async function download(){
  if(request.current)return;
  const abort=new AbortController();request.current=abort;
  const timeout=setTimeout(()=>abort.abort(new DOMException('Timed out','TimeoutError')),60000);
  setBusy(true);setError('');
  try{
   let response:Response;
   for(;;){
    response=await fetch(path,{credentials:'same-origin',signal:abort.signal});
    if(response.status!==409)break;
    setBuilding(true);
    await new Promise<void>((resolve,reject)=>{
     const cancel=()=>{clearTimeout(timer);reject(abort.signal.reason);};
     const timer=setTimeout(()=>{abort.signal.removeEventListener('abort',cancel);resolve();},1000);
     if(abort.signal.aborted)cancel();else abort.signal.addEventListener('abort',cancel,{once:true});
    });
   }
   if(!response.ok)throw Error(response.status===404?'This game has no downloadable recording.':'Unable to download the recording. Please try again.');
   if(!response.headers.get('content-type')?.startsWith('application/vnd.swu-pgn'))throw Error('The server returned an invalid recording. Please try again.');
   const blob=await response.blob();
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='game.swupgn';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(!abort.signal.aborted||abort.signal.reason?.name==='TimeoutError')setError(e instanceof Error&&e.name==='TimeoutError'?'The log is taking longer than expected. Try downloading again.':e instanceof Error?e.message:'Unable to download the recording. Please try again.');}
  finally{clearTimeout(timeout);request.current=null;setBusy(false);setBuilding(false);}
 }
 return <span className={`recording-download${icon?' recording-download-icon':''}`}><button className={className} aria-label={label} title={label} aria-busy={busy} disabled={busy} onClick={()=>void download()}>{busy?<span className="recording-spinner" aria-hidden="true"/>:icon?<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg>:label}</button>{busy&&<span role="status">{building?'Building game log…':'Downloading game log…'}</span>}{error&&<span role="alert">{error}</span>}</span>;
}
