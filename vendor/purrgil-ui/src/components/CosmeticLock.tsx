export function CosmeticLock({id,reason,requirement}:{id:string;reason:string;requirement?:string}) {
 const label=requirement??(reason.includes('not available')?'Verification pending':reason.includes('result')?'Verified Melee result':reason.includes('participation')?'Event participation': 'Friend of the Pod');
 return <><span className="cosmetic-lock-overlay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="10" width="16" height="12" rx="3"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/><path d="M12 14v4"/></svg><span className="cosmetic-lock-requirement">{label}</span></span><span id={id} className="cosmetic-lock-reason" role="tooltip">{reason}</span></>;
}
