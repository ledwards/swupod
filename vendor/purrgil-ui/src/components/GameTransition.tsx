import './game-transition.css';
/** Stays visible through the lobby handoff and the board's first snapshot. */
export function GameTransition({matched=false,error,onRetry}:{matched?:boolean;error?:string;onRetry?:()=>void}){
 return <section className="game-transition" aria-label={matched?'Match found':'Opening game'}>
  <div className="game-transition-mark" aria-hidden="true"><span>{matched?'VS':'✦'}</span></div>
  <h2 role="status">{matched?'Match found':'Loading game…'}</h2>
  <p>{matched?'Opening your table…':'Preparing your table…'}</p>
  {error&&<div className="game-transition-error" role="alert"><p>{error}</p>{onRetry&&<button onClick={onRetry}>Retry</button>}</div>}
 </section>;
}
