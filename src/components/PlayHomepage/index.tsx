"use client"
import {useMemo} from 'react'
import {useAuth} from '../../contexts/AuthContext'
import {currentPoolSets} from '../../services/play/cardPool'
import SiteFooter from '../SiteFooter'
import PlayHomepageClient from './client'
import build from './build.json'
import shells from './shells.json'

/** PTP owns the website; the shared dependency contains only game presentation. */
export default function PlayHomepage({path='/'}:{path?:string}) {
 const {user}=useAuth()
 const sets=useMemo(()=>currentPoolSets(new Date()).map(set=>({code:set.setCode,name:set.setName})),[])
 return <>
  <link rel="stylesheet" href={`/table-environments/table-environments.css?v=${build.revision}`}/>
  <link rel="stylesheet" href={`/play-home/homepage.css?v=${build.revision}`}/>
  <PlayHomepageClient html={shells[path as keyof typeof shells]??shells['/']} sets={sets} signedIn={!!user}/>
  <SiteFooter/>
 </>
}
