/** Reserve content space while data arrives, without transient status copy. */
export function ContentSkeleton(){return <span className="content-skeleton" aria-busy="true" aria-label="Content"><span/><span/><span/></span>;}
