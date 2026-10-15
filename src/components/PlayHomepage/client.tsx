'use client'
import {useEffect,useRef,useState} from 'react'
import build from './build.json'

export default function PlayHomepageClient({html,sets,signedIn,maintenance=null}:{html:string;sets:{code:string;name:string}[];signedIn:boolean;maintenance?:{message:string;returnAt:string|null}|null}){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 useEffect(()=>{
  let dispose:(()=>void)|undefined,active=true
  import(/* webpackIgnore: true */ `/play-home/homepage.js?v=${build.revision}`).then(module=>{
   if(active&&ref.current){dispose=module.mount(ref.current);ref.current.dataset.ready='true'}
  }).catch(error=>{if(active){console.error('Homepage failed to load',error);setError('Unable to load the homepage controls. Please refresh.')}})
  return()=>{active=false;dispose?.()}
 },[])
 return <>{error&&<p role="alert">{error}</p>}<div ref={ref} aria-label="Protect the Pod" data-ready="false" data-play-sets={JSON.stringify(sets)} data-play-signed-in={String(signedIn)} data-play-maintenance={JSON.stringify(maintenance)} dangerouslySetInnerHTML={{__html:html}}/></>
}
