'use client'
import {createContext, useContext, type ReactNode} from 'react'
import {useParams, useSearchParams} from 'next/navigation'
const RouteContext = createContext<Record<string,string>>({})
export function EntryRoute({values,children}:{values:Record<string,string>;children:ReactNode}) {
 return <RouteContext.Provider value={values}>{children}</RouteContext.Provider>
}
/** Path identities take precedence over optional filters in the query string. */
export function useEntryParams() {
 const query=useSearchParams(), path=useParams(), context=useContext(RouteContext)
 const values=new URLSearchParams(query.toString())
 for(const [key,value] of Object.entries(context)) values.set(key,value)
 for(const [key,name] of [['shareId','pool'],['runId','run'],['lobbyId','invite'],['matchId','match']] as const) {
  const value=path?.[key]; if(typeof value==='string')values.set(name,value)
 }
 return values
}
