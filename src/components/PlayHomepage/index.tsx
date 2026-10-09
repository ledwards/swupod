import {Suspense} from 'react'
import build from './build.json'
import shells from './shells.json'
import PlayHomepageClient from './client'
import HomepagePromoBanner from '../HomepagePromoBanner'
import SiteFooter from '../SiteFooter'

/** Send the real page layout before downloading the interactive website bundle. */
export default function PlayHomepage({path='/'}:{path?:string}){
 const html=shells[path as keyof typeof shells]??shells['/']
 return <>
  <link rel="stylesheet" href={`/table-environments/table-environments.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="stylesheet" href={`/play-home/homepage.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="modulepreload" href={`/play-home/homepage.js?v=${build.revision}`}/>
  {/* Release countdown, Friends-of-the-Pod conversion and beta activation: the same banner the legacy landing page shows. */}
  {path==='/'&&<Suspense fallback={null}><HomepagePromoBanner/></Suspense>}
  <PlayHomepageClient html={html}/>
  <SiteFooter/>
 </>
}
