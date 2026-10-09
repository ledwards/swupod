import build from './build.json'
import shells from './shells.json'
import PlayHomepageClient from './client'

/** Send the real page layout before downloading the interactive website bundle. */
export default function PlayHomepage({path='/'}:{path?:string}){
 const html=shells[path as keyof typeof shells]??shells['/']
 return <>
  <link rel="stylesheet" href={`/table-environments/table-environments.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="stylesheet" href={`/play-home/homepage.css?v=${build.revision}`} precedence="play-home"/>
  <link rel="modulepreload" href={`/play-home/homepage.js?v=${build.revision}`}/>
  <PlayHomepageClient html={html}/>
 </>
}
