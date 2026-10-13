import {useEffect,useState} from 'react';
import {lobbyRequest} from '../transport/lobby';
type Link={handle:string;verified_at:string};
type Challenge={handle:string;marker:string;challengeId:string;expiresAt:string};
export function MeleeSettings(){
 const [pollMessage,setPollMessage]=useState('');
 const [link,setLink]=useState<Link|null>(null),[challenge,setChallenge]=useState<Challenge|null>(null),[handle,setHandle]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(false),[attempt,setAttempt]=useState(0),[checked,setChecked]=useState(false);
 useEffect(()=>{const c=new AbortController();setReady(false);setError('');void lobbyRequest<{link:Link|null}>('/melee',undefined,c.signal).then(r=>{setLink(r.link);setChecked(true)}).catch(e=>{if(!c.signal.aborted){setChecked(false);setError(e.message)}}).finally(()=>{if(!c.signal.aborted)setReady(true)});return()=>c.abort()},[attempt]);
 useEffect(()=>{
  if(!challenge)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function check(){
   if(!challenge)return;
   if(Date.now()>=Date.parse(challenge.expiresAt)){setPollMessage('This check expired. Start again to continue.');return;}
   try{
    const saved=await lobbyRequest<{link:Link|null}>('/melee',undefined,controller.signal);
    const result=saved.link?{link:saved.link,rewards:undefined}:await lobbyRequest<{link:Link;rewards?:{status:string;allowedItemIds:string[]}}>('/melee',{action:'verify',challengeId:challenge.challengeId},controller.signal);
    if(controller.signal.aborted)return;
    setLink(result.link);setChallenge(null);setEditing(false);setError('');
    setNotice(result.rewards?.status==='ready'?'Melee connected. Your eligible event rewards are ready.':'Melee connected. Event rewards will refresh when you open the collection.');
    window.dispatchEvent(new Event('melee-connection-changed'));return;
   }catch(error){
    if(controller.signal.aborted)return;
    const message=error instanceof Error?error.message:'Could not check Melee.';
    setPollMessage(message.includes('not in your public Melee Bio')||message.includes('checked too recently')?'Waiting for your Discord username in your Melee Bio…':`${message} We’ll retry automatically.`);
   }
   timer=setTimeout(()=>void check(),12000);
  }
  setPollMessage('Checking your Melee Bio automatically…');void check();
  return()=>{controller.abort();clearTimeout(timer)};
 },[challenge]);
 async function act(action:'begin'|'verify'|'disconnect'){setBusy(true);setError('');setNotice('');try{const r=await lobbyRequest<{link?:Link|null}&Partial<Challenge>>('/melee',{action,handle:handle.trim(),challengeId:challenge?.challengeId,noticeVersion:'2026-10-08'});if(action==='begin')setChallenge(r as Challenge);else{setLink(r.link??null);setChallenge(null);setEditing(false);window.dispatchEvent(new Event('melee-connection-changed'));setNotice(action==='verify'?'Melee connected. Remove the code from your Bio; the connection will stay verified.':'Melee disconnected. Event-result unlocks are no longer available.')}}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}}
 return <section className="settings-melee" aria-labelledby="settings-melee-title"><div className="settings-discord-heading"><strong id="settings-melee-title">Melee</strong><span>{!ready?'Checking…':!checked?'Unavailable':link?'Connected':'Not connected'}</span></div>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!ready?<p role="status">Checking connection…</p>:!checked?<button onClick={()=>setAttempt(value=>value+1)}>Retry connection check</button>:<>
 {link?<><p>Connected as <a href={`https://melee.gg/Profile/Index/${encodeURIComponent(link.handle)}`} target="_blank" rel="noreferrer">{link.handle}</a>.</p><p className="setting-help">Verified {new Date(link.verified_at).toLocaleDateString()}. Your connection stays private.</p><p className="setting-help">Open <a href="/themes?section=playmats&collection=trophy" target="_blank" rel="noopener noreferrer">Trophy Mats</a> in the Playmats collection to check unlocks and eligible events. A connection alone does not unlock a trophy. Results still awaiting review stay locked.</p><div className="settings-connection-actions"><button onClick={()=>void act('disconnect')} disabled={busy}>{busy?'Disconnecting…':'Disconnect'}</button></div></>:challenge?<><p>In <a href="https://melee.gg/Profile/Settings" target="_blank" rel="noreferrer">Melee Profile Settings</a>, find <strong>Bio</strong>, select Edit, and add your Discord username on its own line:</p><code className="settings-melee-code">{challenge.marker}</code><div className="settings-connection-actions"><button onClick={()=>void navigator.clipboard.writeText(challenge.marker).then(()=>setNotice('Username copied.')).catch(()=>setError('Select and copy your username above.'))}>Copy username</button><a href="https://melee.gg/Profile/Settings" target="_blank" rel="noreferrer">Open Melee settings</a></div><p className="setting-help">Keep your existing Bio text and save. We’ll verify automatically and unlock your earned cosmetics.</p><p role="status">{pollMessage}</p><div className="settings-connection-actions"><button disabled={busy} onClick={()=>void act('begin')}>Start again</button><button disabled={busy} onClick={()=>void act('disconnect')}>Cancel</button></div></>:editing?<form onSubmit={e=>{e.preventDefault();void act('begin')}}><label htmlFor="settings-melee-handle">Melee username</label><input id="settings-melee-handle" value={handle} onChange={e=>setHandle(e.target.value)} required maxLength={64} autoComplete="off"/><p className="setting-help">Use the username at the end of your public profile URL: melee.gg/Profile/Index/username. This may differ from your display name.</p><p className="setting-help">Add your Discord username to your Melee Bio; we’ll verify it automatically. Sign in only on melee.gg; we never ask for your Melee password.</p><p className="setting-help">By continuing, you connect your Discord account to this Melee account for PTP and Wayfinder event rewards. This may connect your Discord identity to your public name and tournament history. Your link stays private; replay and team sharing stay unchanged.</p><p className="setting-help"><a href="https://www.protectthepod.com/privacy-policy" target="_blank" rel="noreferrer">PTP privacy</a> · <a href="https://wayfinder.news/privacy" target="_blank" rel="noreferrer">Wayfinder privacy</a></p><div className="settings-connection-actions"><button disabled={busy||!handle.trim()}>{busy?'Preparing…':'Continue'}</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div></form>:<><p>Unlock playmats and sleeves for attending and winning events.</p><p className="setting-help">Add your Discord username to your Melee Bio. We’ll verify it automatically.</p><button onClick={()=>setEditing(true)}>Connect Melee</button></>}
 </>}
 </section>
}
