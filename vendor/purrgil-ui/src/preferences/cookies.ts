/** Non-sensitive display preferences, shared by all game paths on this host. */
export function readPreferenceCookie(key:string):string|null {
 try{const value=document.cookie.split('; ').find(part=>part.startsWith(key+'='))?.slice(key.length+1);return value===undefined?null:decodeURIComponent(value);}catch{return null;}
}
export function writePreferenceCookie(key:string,value:string){
 try{document.cookie=`${key}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}catch{/* Cookie storage may be blocked. */}
}
