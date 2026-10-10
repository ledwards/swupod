'use client'
import {useEffect,useRef} from 'react'
import build from './build.json'

/**
 * The homepage shell's live-games strip, for PTP pages that render outside the
 * shell (/draft, /sealed). The play-home bundle owns its markup: it mounts here
 * through `mountLiveStrip(element)` and returns a dispose function. Bundles
 * without that export leave this empty and take no space.
 */
export default function LiveStrip(){
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  let dispose:(()=>void)|undefined,active=true
  import(/* webpackIgnore: true */ `/play-home/homepage.js?v=${build.revision}`).then(module=>{
   if(active&&ref.current&&typeof module.mountLiveStrip==='function')dispose=module.mountLiveStrip(ref.current)
  }).catch(()=>{/* the page works without the strip */})
  return()=>{active=false;dispose?.()}
 },[])
 return <div ref={ref} className="ptp-live-strip"/>
}
