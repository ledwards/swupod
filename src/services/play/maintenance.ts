import {PtpPlayError} from './playState'
/** What Play shows while the matcher is down: the operator's message and, when known, the return time (ISO 8601). */
export interface PlayMaintenance {message:string;returnAt:string|null}
/**
 * Maintenance mode is a server setting: PTP_PLAY_MAINTENANCE_MESSAGE turns it on (any non-blank text is the message
 * players see) and PTP_PLAY_MAINTENANCE_UNTIL, an ISO 8601 time, is the return time shown with it. Unset or blank
 * is off and changes nothing. PTP reads it once per page load (the Play shell's host attribute) and again on every
 * queue status poll; create, join, queue and requeue endpoints refuse with 503 while it is on. Playing Leebo stays
 * available only while the game runtime answers. Documented in docs/operations/native-play.md.
 */
export function playMaintenance(env:NodeJS.ProcessEnv=process.env):PlayMaintenance|null {
 const message=(env.PTP_PLAY_MAINTENANCE_MESSAGE??'').trim()
 if(!message)return null
 const until=(env.PTP_PLAY_MAINTENANCE_UNTIL??'').trim(),time=until?Date.parse(until):NaN
 return {message:message.slice(0,300),returnAt:Number.isNaN(time)?null:new Date(time).toISOString()}
}
/** Create, join, queue and requeue endpoints call this first: a 503 carrying the maintenance message. */
export function assertPlayAvailable(env:NodeJS.ProcessEnv=process.env):void {
 const maintenance=playMaintenance(env)
 if(maintenance)throw new PtpPlayError(503,'maintenance',maintenance.message)
}
