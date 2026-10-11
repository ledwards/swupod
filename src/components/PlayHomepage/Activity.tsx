'use client'
import {Fragment} from 'react'
import {usePresence} from '../../hooks/usePresence'
import {usePublicPodsSocket} from '../../hooks/usePublicPodsSocket'

/** The production homepage's live activity breakdown, using the same subscriptions. */
export default function HomepageActivity({userId}:{userId:string|undefined}){
 const presence=usePresence(userId)
 const pods=usePublicPodsSocket()
 if(!presence.count)return null
 const activities=[
  pods.length>0&&<><strong>{pods.length}</strong> {pods.length===1?'pod':'pods'} forming</>,
  presence.drafting>0&&<><strong>{presence.drafting}</strong> drafting</>,
  presence.building>0&&<><strong>{presence.building}</strong> building</>,
  presence.browsing>0&&<><strong>{presence.browsing}</strong> solo play</>,
 ].filter(Boolean)
 return <div className="homepage-activity" aria-label="Live activity">
  <span className="homepage-activity-dot" aria-hidden="true"/>
  <span><strong>{presence.count}</strong> online{activities.map((activity,i)=><Fragment key={i}> · {activity}</Fragment>)}</span>
 </div>
}
