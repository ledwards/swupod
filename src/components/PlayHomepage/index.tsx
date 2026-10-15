import {Suspense} from 'react'
import build from './build.json'
import shells from './shells.json'
import PlayHomepageClient from './client'
import HomepagePromoBanner from '../HomepagePromoBanner'
import SiteFooter from '../SiteFooter'
import {currentPoolSets} from '../../services/play/cardPool'
import {viewerSession} from '../../../lib/viewerAccess'
import {playMaintenance} from '../../services/play/maintenance'
import HomepageActivity from './Activity'
import './play-homepage.css'

/** Send the real page layout before downloading the interactive website bundle. */
export default async function PlayHomepage({path='/'}:{path?:string}){
 const html=shells[path as keyof typeof shells]??shells['/']
 // The set pickers read this directly, so they never wait on (or fail with) the lobby state call.
 const sets=currentPoolSets(new Date()).map(c=>({code:c.setCode,name:c.setName}))
 // Play trusts this over the lobby state call, so a signed-in player is never asked to log in.
 const viewer=await viewerSession()
 const signedIn=!!viewer
 return <>
  <link rel="stylesheet" href={`/table-environments/table-environments.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="stylesheet" href={`/play-home/homepage.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="modulepreload" href={`/play-home/homepage.js?v=${build.revision}`}/>
  {path==='/'&&<HomepageActivity userId={viewer?.id}/>}
  {/* Release countdown, Friends-of-the-Pod conversion and beta activation: the same banner the legacy landing page shows. */}
  {path==='/'&&<Suspense fallback={null}><HomepagePromoBanner/></Suspense>}
  {/* Maintenance is read once per page load here and again with every queue status poll; the shell shows it only from one of those real answers. */}
  <PlayHomepageClient html={html} sets={sets} signedIn={signedIn} maintenance={playMaintenance()}/>
  <SiteFooter/>
 </>
}
