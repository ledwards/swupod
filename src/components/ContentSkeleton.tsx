import './ContentSkeleton.css'
/** Reserve content geometry without replacing the page with a status message. */
export default function ContentSkeleton({kind='text',count=1}:{kind?:'text'|'row'|'card'|'control';count?:number}) {
 return <div className={`content-skeleton content-skeleton--${kind}`} aria-busy="true" aria-label="Content pending">{Array.from({length:count},(_,i)=><div className="content-skeleton-item" aria-hidden="true" key={i}>{kind==='row'&&<span className="content-skeleton-art"/>}{(kind==='text'||kind==='row')&&<div className="content-skeleton-copy"><span/><span/><span/></div>}</div>)}</div>
}
