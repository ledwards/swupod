import {useEffect,useState} from 'react';
import {lobbyRequest} from '@purrgil/ui/transport/lobby';
import {DecisionDialog} from '@purrgil/ui/components/DecisionDialog';

type Reservation={kind:'game';matchId:string;action:'cancel'|'forfeit'}|{kind:'queue';joinedAt:number;action:'leave'};
const labels={cancel:'End existing game',forfeit:'Forfeit existing game',leave:'Leave existing queue'};
const confirms={cancel:'End the game you already have open? Nobody is in it yet.',forfeit:'Forfeit the game in progress? It counts as a loss.',leave:'Leave the queue you are already in?'};
/** One line: what blocked you, and the link that clears it. Confirm, then the caller proceeds. */
export function ReservationError({message,onCleared}:{message:string;onCleared:()=>void}){
 const [reservation,setReservation]=useState<Reservation|null>(null),[busy,setBusy]=useState(false),[confirming,setConfirming]=useState(false),[line,setLine]=useState(message);
 const recoverable=/already have a game or queue reservation/i.test(message);
 useEffect(()=>{setLine(message.replace(/\s*Not found\.?$/i,''));},[message]);
 useEffect(()=>{
  if(!recoverable)return;const controller=new AbortController();
  void lobbyRequest<{reservation:Reservation|null}>('/reservation',undefined,controller.signal).then(r=>setReservation(r.reservation)).catch(()=>{});
  return()=>controller.abort();
 },[message,recoverable]);
 async function recover(){
  if(!reservation||busy)return;setConfirming(false);setBusy(true);
  try{await lobbyRequest('/reservation',reservation);onCleared();}
  catch(error){setLine(error instanceof Error?error.message:'Unable to clear it. Try again.');
   try{const next=await lobbyRequest<{reservation:Reservation|null}>('/reservation');setReservation(next.reservation);}catch{/* keep the link for a retry */}
  }finally{setBusy(false);}
 }
 return <>
  <p className="ph-problem ph-problem-line" role="alert">{line}{recoverable&&reservation&&<> <button type="button" className="reservation-recovery-link" disabled={busy} onClick={()=>setConfirming(true)}>{busy?'Working…':labels[reservation.action]}</button></>}</p>
  {confirming&&reservation&&<DecisionDialog controls={false} label={labels[reservation.action]} className="lobby-dialog reservation-confirm" onClose={()=>setConfirming(false)}>
   <header><h2>{labels[reservation.action]}</h2><button aria-label="Close" onClick={()=>setConfirming(false)}>×</button></header>
   <p>{confirms[reservation.action]}</p>
   <div className="reservation-confirm-actions"><button type="button" className="ph-btn" onClick={()=>setConfirming(false)}>Keep it</button><button type="button" className="ph-btn ph-danger" onClick={()=>void recover()}>{labels[reservation.action]}</button></div>
  </DecisionDialog>}
 </>;
}
