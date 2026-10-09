'use client'
import {useEffect,useRef,useState} from 'react'
import build from './build.json'

export default function PlayHomepageClient({html}:{html:string}){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 useEffect(()=>{
  let dispose:(()=>void)|undefined,active=true
  import(/* webpackIgnore: true */ `/play-home/homepage.js?v=${build.revision}`).then(module=>{
   if(active&&ref.current){dispose=module.mount(ref.current);ref.current.dataset.ready='true'}
  }).catch(error=>{if(active){console.error('Homepage failed to load',error);setError('Unable to load the homepage controls. Please refresh.')}})
  return()=>{active=false;dispose?.()}
 },[])
 return <>{error&&<p role="alert">{error}</p>}<div ref={ref} aria-label="Protect the Pod" data-ready="false" dangerouslySetInnerHTML={{__html:html}}/></>
}
