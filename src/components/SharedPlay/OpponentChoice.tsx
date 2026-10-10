import {ModeIcon} from './ModeIcon'
export type OpponentMode = 'queue' | 'private' | 'ai'
const art = {"queue": "https://assets.wayfinder.news/purrgil/artwork/v1/f25bc35cb8094f7622891ee4d760a202b8c5eaf82ef1ed99c03356b1fd433987/opponent-queue.jpg", "private": "https://assets.wayfinder.news/purrgil/artwork/v1/cb4637728541e6a4d6c519e09530782e97970830fe986f78e1945d691d1284ec/opponent-private.jpg", "ai": "https://assets.wayfinder.news/purrgil/artwork/v1/8c272f438ea41fb260d48930985d07fa622704f212bd92a3bd7475bdb15f4c27/opponent-ai.jpg"}
const names = { queue: 'Matchmaking', private: 'Private room', ai: 'Leebo' }
/** Adapted from Claude's imperial-holotable opponent chooser. */
export default function OpponentChoice({value,onChange,disabled,invite}:{value:OpponentMode;onChange:(mode:OpponentMode)=>void;disabled:boolean;invite:boolean}) {
 return <div className="lobby-opponent">
  <h2>Opponent</h2>
  <div className="lobby-mode-switch" role="radiogroup" aria-label="Opponent">
   {(['queue','private','ai'] as const).map(mode=><button key={mode} type="button" role="radio" aria-checked={value===mode} disabled={disabled||(invite&&mode!=='private')} onClick={()=>onChange(mode)}>
    <span className="lobby-mode-art" style={{backgroundImage:`url(${art[mode]})`}}/>
    <span className="lobby-mode-check" aria-hidden="true">✓</span>
    <span className="lobby-mode-copy"><span className="lobby-mode-name"><ModeIcon mode={mode}/>{names[mode]}</span></span>
   </button>)}
  </div>
  <p>{value==='queue'?'Join the queue for an opponent playing the same format.':value==='private'?'Create a room and share its link with a friend.':'Leebo is experimental and still learning. He is not very good yet, but playing against him helps him learn.'}</p>
 </div>
}
