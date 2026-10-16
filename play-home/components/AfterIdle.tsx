import {useEffect,useState,type ReactNode} from 'react';
/** Mounts its children once the network has gone quiet (no resource finished for `quiet` ms, at the latest after `cap`
 * ms), so a nicety such as the release-notes check never shares the first seconds' bandwidth with the deck's own art.
 * The page's load event is no guide here: it fires before the bundle has even run. Renders nothing on the server. */
export function AfterIdle({quiet=1000,cap=10000,children}:{quiet?:number;cap?:number;children:ReactNode}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let done=false,timer:ReturnType<typeof setTimeout>|undefined;
  const now=()=>{if(done)return;done=true;setReady(true);};
  const rearm=()=>{if(timer)clearTimeout(timer);timer=setTimeout(now,quiet);};
  let observer:PerformanceObserver|undefined;
  try{observer=new PerformanceObserver(rearm);observer.observe({type:'resource',buffered:false});}catch{/* no observer: the quiet timer alone decides */}
  rearm();
  const latest=setTimeout(now,cap);
  return()=>{done=true;observer?.disconnect();clearTimeout(latest);if(timer)clearTimeout(timer);};
 },[quiet,cap]);
 return ready?<>{children}</>:null;
}
