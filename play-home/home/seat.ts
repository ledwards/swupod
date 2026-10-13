// The deck you just sent to a queue or private room, so the waiting screen can show your seat.
// Session-only and best effort: a missing or blocked store just shows the seat without art.
export type Seat={leader?:string;base?:string;format?:'premier'|'eternal';name?:string;leaderName?:string;baseName?:string;set?:string;src?:string};
const key='ph-seat';
export function rememberSeat(seat:Seat){try{sessionStorage.setItem(key,JSON.stringify(seat));}catch{/* storage unavailable */}}
export function readSeat():Seat|undefined{try{const v=sessionStorage.getItem(key);return v?JSON.parse(v) as Seat:undefined;}catch{return undefined;}}
