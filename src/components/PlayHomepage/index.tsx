'use client'
import {useEffect,useRef,useState} from 'react'
import build from './build.json'

/** Shared Purrgil website bundle; the game board stays on the play host. */
export default function PlayHomepage(){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 useEffect(()=>{
  let dispose:(()=>void)|undefined,active=true
  // The standalone app loads the table artwork rules from index.html.
  // Include them here too so catalog previews retain their framing and size.
  const styles=['/table-environments/table-environments.css','/play-home/homepage.css'].map(path=>{
   const style=document.createElement('link');style.rel='stylesheet';style.href=`${path}?v=${build.revision}`;document.head.append(style);return style
  })
  import(/* webpackIgnore: true */ `/play-home/homepage.js?v=${build.revision}`).then(module=>{if(active&&ref.current)dispose=module.mount(ref.current)}).catch(error=>{console.error('Homepage failed to load',error);setError('Unable to load the homepage. Please refresh.')})
  return()=>{active=false;dispose?.();styles.forEach(style=>style.remove())}
 },[])
 return <>{error&&<p role="alert">{error}</p>}<div ref={ref} aria-label="Protect the Pod">{!error&&<p>Loading Protect the Pod…</p>}</div></>
}
