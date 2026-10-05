'use client'
import {useEffect,useState} from 'react'
import {useParams} from 'next/navigation'
import {EntryRoute} from './EntryRoute'
import EntryAi from './EntryAi'
import EntryBracket from './EntryBracket'
import EntryShell from './EntryShell'
import {EntrySkeleton} from './EntrySkeleton'
import Button from '../Button'
export default function EntryRun(){
 const {runId}=useParams<{runId:string}>(),[data,setData]=useState<{pool:string;request:string;format:string}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');fetch(`/api/entry/runs/${encodeURIComponent(runId)}`,{signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);if(!controller.signal.aborted)setData(j)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[runId,retry])
 if(error)return <EntryShell><h1>Unable to open this game</h1><p role="alert">{error}</p><Button onClick={()=>setRetry(n=>n+1)}>Try again</Button></EntryShell>
 if(!data)return <EntrySkeleton page="run"/>
 return <EntryRoute values={{pool:data.pool,request:data.request}}>{data.format==='ai'?<EntryAi/>:<EntryBracket format={data.format==='elimination'?'elimination':'swiss'}/>}</EntryRoute>
}
