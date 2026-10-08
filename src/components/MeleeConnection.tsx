'use client'
import {useEffect,useState} from 'react'
import Button from './Button'
import {useAuth} from '../contexts/AuthContext'
import './MeleeConnection.css'

type Link={handle:string;verified_at:string;version:number}
type Challenge={challengeId:string;marker:string;expiresAt:string;handle:string}
const noticeVersion='2026-10-08'
export default function MeleeConnection() {
  const {user,loading}=useAuth() as {user:{username:string}|null;loading:boolean}
  const [link,setLink]=useState<Link|null>(null)
  const [challenge,setChallenge]=useState<Challenge|null>(null)
  const [handle,setHandle]=useState('')
  const [ready,setReady]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [confirmDisconnect,setConfirmDisconnect]=useState(false)
  const [confirmErase,setConfirmErase]=useState(false)
  useEffect(()=>{
    if(!user)return
    let active=true
    fetch('/api/connections/melee',{cache:'no-store'}).then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Could not retrieve your connection.')
      if(active)setLink(data.link)
    }).catch(reason=>{if(active)setError(reason.message)}).finally(()=>{if(active)setReady(true)})
    return()=>{active=false}
  },[user])
  async function act(action:string) {
    setBusy(true);setError('');setMessage('')
    try {
      const response=await fetch('/api/connections/melee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,handle,challengeId:challenge?.challengeId,noticeVersion})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Could not update your connection.')
      if(action==='begin')setChallenge(data)
      if(action==='verify'){setLink(data.link);setChallenge(null);setMessage('Melee verified. You can now remove the PTP code from your Bio.')}
      if(action==='disconnect'){setLink(null);setChallenge(null);setConfirmDisconnect(false);setMessage('Melee disconnected. Attendance-based cosmetics are no longer available.')}
      if(action==='erase'){setLink(null);setChallenge(null);setConfirmErase(false);setMessage('Your private Melee connection and reward snapshot have been erased. Public Melee records are unchanged.')}
    } catch(reason){setError(reason instanceof Error?reason.message:'Try again.')} finally {setBusy(false)}
  }
  return <main className="melee-page"><div className="melee-connection">
    <nav aria-label="Account"><a className="btn btn--back btn--sm" href="/me">Your account</a></nav>
    <header className="melee-header">
    <h1>Connect Melee</h1>
    <p>Connect your event history to unlock cosmetics.</p></header>
    {(loading||(user&&!ready))?<div className="melee-skeleton" aria-busy="true" aria-label="Retrieving Melee connection"><span/><span/><span/></div>:!user?<a className="btn btn--discord" href="/api/auth/signin/discord?return_to=%2Fconnections%2Fmelee">Sign in with Discord</a>:<section className="melee-content" aria-busy={busy}>
      {error&&<p role="alert">{error}</p>}
      {message&&<p role="status">{message}</p>}
      {link?<>
        <h2>Connected to <a href={`https://melee.gg/Profile/Index/${encodeURIComponent(link.handle)}`} target="_blank" rel="noreferrer">{link.handle}</a></h2>
        <p>Verified {new Date(link.verified_at).toLocaleDateString()}. This connection is private to Protect the Pod and Wayfinder.</p>
        <p>Remove the PTP verification code from <a href="https://melee.gg/Profile/Settings" target="_blank" rel="noreferrer">your Melee Bio</a>. Preserve any other text. If Melee does not save an empty Bio, enter a single space and save again.</p>
        <a href="/api/connections/melee" download="melee-connection.json">Export connection details</a>
        {confirmDisconnect?<><p>Disconnecting removes attendance-based unlocks. Friend of the Pod access stays available.</p><Button variant="danger" disabled={busy} onClick={()=>void act('disconnect')}>Disconnect Melee</Button><Button onClick={()=>setConfirmDisconnect(false)}>Keep connection</Button></>:<Button disabled={busy} onClick={()=>setConfirmDisconnect(true)}>Disconnect…</Button>}
      </>:challenge?<>
        <h2>Verify {challenge.handle}</h2>
        <ol><li>Copy this code. It expires in 15 minutes.<code>{challenge.marker}</code><Button disabled={busy} onClick={()=>void navigator.clipboard.writeText(challenge.marker).then(()=>setMessage('Code copied.')).catch(()=>setError('Select and copy the code above.'))}>Copy code</Button></li>
          <li>Open <a href="https://melee.gg/Profile/Settings" target="_blank" rel="noreferrer">Melee Profile Settings</a>. Find <strong>Bio</strong>, click Edit, add the code on its own line, and Save. Keep your existing Bio text.</li>
          <li>Return here and verify. You can remove the code afterward.</li></ol>
        <div className="melee-actions"><Button variant="primary" disabled={busy} onClick={()=>void act('verify')}>Verify my Melee profile</Button>
        <Button disabled={busy} onClick={()=>{setChallenge(null);setMessage('You can remove the unused PTP code from your Melee Bio.')}}>Cancel</Button></div>
      </>:<form onSubmit={event=>{event.preventDefault();void act('begin')}}>
        <label htmlFor="melee-handle">Melee username</label><input id="melee-handle" autoComplete="off" required maxLength={64} value={handle} onChange={event=>setHandle(event.target.value)}/>
        <p>We’ll ask you to add a one-time code to your public Melee Bio. Sign in to Melee only on melee.gg; we never ask for your Melee password.</p>
        <p>By continuing, you connect your Discord account with this Melee account for Protect the Pod and Wayfinder event rewards. This may connect your Discord identity to your public name and tournament history. The link stays private and does not change replay or team-sharing settings. You can disconnect here. Friends of the Pod do not need to link Melee for available cosmetics.</p>
        <p><a href="/privacy-policy">PTP privacy policy</a> · <a href="https://wayfinder.news/privacy" target="_blank" rel="noreferrer">Wayfinder privacy policy</a></p>
        <Button type="submit" variant="primary" disabled={busy||!handle.trim()}>Continue to verification</Button>
      </form>}
      <div className="melee-management">{confirmErase?<div><p>Erase your private connection, verification record and reward snapshot from the active services? Attendance unlocks will stop. Your public Melee account and tournament records will not be changed.</p><Button variant="danger" disabled={busy} onClick={()=>void act('erase')}>Erase private connection</Button><Button onClick={()=>setConfirmErase(false)}>Cancel erasure</Button></div>:<Button disabled={busy} onClick={()=>setConfirmErase(true)}>Erase connection data…</Button>}</div>
    </section>}
  </div></main>
}
