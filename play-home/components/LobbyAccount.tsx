import {useId,useState} from 'react';
import type {LobbyState} from '@purrgil/ui/transport/lobby';

export function LobbyAccount({user}:{user:NonNullable<LobbyState['user']>}){
 const id=useId();const [failed,setFailed]=useState(false);
 const avatar=user.avatarUrl&&!failed?<img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>{Array.from(user.name)[0]?.toUpperCase()??'U'}</span>;
 return <div className="lobby-account-menu">
  <button className="lobby-avatar-button" aria-label="User menu" popoverTarget={id}>{avatar}</button>
  <div className="lobby-account-popover" id={id} popover="auto" aria-label="Your account">
   <div className="lobby-account-heading"><div className="lobby-user-avatar">{avatar}</div><div><strong>{user.name}</strong><p>Online ELO <b>{user.lifetimeElo??1500}</b></p></div></div>
   <nav aria-label="Account"><a href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Home</a><a href="/history"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>History</a></nav>
  </div>
 </div>;
}
