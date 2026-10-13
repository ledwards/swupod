/** Extra seats are allowed only for the local development instance's terronk admin. */
export function developmentQueueSeat(user:{username?:unknown;is_admin?:unknown}|null,seat:unknown,env:NodeJS.ProcessEnv=process.env):string|undefined {
 if(env.NODE_ENV!=='development'||user?.is_admin!==true||user.username!=='terronk'||typeof seat!=='string'||!/^[a-f0-9-]{36}$/.test(seat))return undefined
 const local=(value:string|undefined)=>{try{const url=new URL(value??'');return url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)}catch{return false}}
 if(!local(env.PTP_PUBLIC_ORIGIN||env.APP_URL)||!local(env.PURRGIL_PUBLIC_ORIGIN))return undefined
 return seat
}
