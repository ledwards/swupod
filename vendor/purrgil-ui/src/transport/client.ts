/** Each isolated seat has its own HttpOnly cookie path; tabs cannot replace one another. */
export function gameApiPath(path:string):string {
 const scope=typeof location==='undefined'?null:location.pathname.match(/^(?:\/table\/[a-zA-Z0-9_-]{1,128}\/[01]\/|\/watch\/[a-f0-9]{64}\/|\/spectate\/[a-zA-Z0-9_-]{1,128}\/)/)?.[0];
 return scope?scope+path.replace(/^\//,''):path;
}
import {parseMessage,type ServerMessage} from '../engine/protocol';
export type Session = {standalone?:boolean;publicObserver?:boolean;bestOfThree?:boolean;seriesId?:string;ai?:boolean;mode?:'live'|'replay'|'observe';sessionId:string;seat:number;returnUrl?:string;eventFormat?:'swiss'|'elimination';opponentUrl?:string;hostName?:string;preferences?:unknown};
export type MessageHandler = (message:ServerMessage)=>void;
export type ConnectionStatus = 'Connecting'|'Connected'|'Retrying action'|'Resynchronizing'|'Connection lost; retrying'|'Disconnected';
type Options = {onSession?:(session:Session)=>void;onNotice?:(message:string)=>void;onUnavailable?:(reason:'ended'|'expired')=>void;fetchImpl?:typeof fetch;pollMs?:number;timeoutMs?:number;reconnectTimeoutMs?:number;reconnectPollMs?:number;now?:()=>number};
class GatewayError extends Error {constructor(readonly status:number){super(status===401?'Your game session has expired. Return to your host to resume.':status===404?'This game has ended.':`Unable to connect to your game (${status}).`);}}
function messages(value:unknown):ServerMessage[]{
 const raw=Array.isArray(value)?value:(value && typeof value==='object' && 'messages' in value)?(value as {messages:unknown}).messages:[value];
 if(!Array.isArray(raw))throw Error('The game returned an incompatible response.');
 return raw.map(v=>parseMessage(JSON.stringify(v)));
}
/** Same-origin gateway only. Serialize polling and commands; retry a command with the SAME id. */
export class GameTransport {
 private stopped=false;
 private initialized=false;
 private disconnected=false;
 private failureSince:number|null=null;
 private lastStep=-1;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private operations:Promise<unknown>=Promise.resolve();
 private abort=new AbortController();
 constructor(private onMessage:MessageHandler,private onStatus:(status:ConnectionStatus)=>void,private options:Options={}){}
 private status(value:ConnectionStatus){if(value==='Resynchronizing'||value==='Connection lost; retrying')this.lastStep=-1;if(!this.stopped)this.onStatus(value);}
 private async request(path:string,init?:RequestInit){
  const r=await (this.options.fetchImpl??fetch)(gameApiPath(path),{credentials:'same-origin',...init,signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(this.options.timeoutMs??15000)])});
  if(!r.ok)throw new GatewayError(r.status);
  return r.json();
 }
 private enqueue<T>(operation:()=>Promise<T>):Promise<T>{
  const next=this.operations.then(()=>{if(this.stopped)throw Error('Connection closed');return operation();});
  this.operations=next.catch(()=>undefined);return next;
 }
 async connect():Promise<Session>{
  try{return await this.initialize();}
  catch(error){if(!this.stopped)this.connectionFailure(error);throw error;}
  finally{this.schedule();}
 }
 private async initialize():Promise<Session>{
  let session:Session;
  try {session=await this.request('/api/session') as Session;}
  catch(error){
   if(error instanceof GatewayError && error.status===401 && typeof location!=='undefined' && location.pathname.startsWith('/table/')){
    const key=`purrgil-resume:${location.pathname}`;
    const previous=Number(sessionStorage.getItem(key)??0);
    if(Date.now()-previous>60000){sessionStorage.setItem(key,String(Date.now()));location.replace(gameApiPath('/resume'));}
   }
   throw error;
  }
  if(typeof location!=='undefined')sessionStorage.removeItem(`purrgil-resume:${location.pathname}`);
  if(!session.sessionId || ![0,1].includes(session.seat))throw Error('This game session is incompatible.');
  if(this.stopped)return session;
  // Seat and identity must be installed before the first observation is rendered.
  this.options.onSession?.(session);
  if(session.mode==='replay'){this.disconnected=true;return session;}
  if(session.ai)await this.request('/api/ai/retry',{method:'POST'});
  this.initialized=true;
  await this.enqueue(()=>this.refresh());
  return session;
 }
 private deliver(value:unknown){
  if(this.stopped)return;
  for(const message of messages(value)){
   if(message.type==='view'){
    if(message.step<this.lastStep)continue;
    this.lastStep=message.step;
   }
   this.onMessage(message);
  }
 }
 private async refresh(){this.deliver(await this.request(`/api/game?afterStep=${this.lastStep}`));this.failureSince=null;this.disconnected=false;this.status('Connected');}
 private connectionFailure(error:unknown){
  if(this.stopped)return;
  const now=(this.options.now??Date.now)();this.failureSince??=now;
  if(error instanceof GatewayError&&(error.status===401||error.status===404)){
   this.disconnected=true;this.status('Disconnected');
   this.options.onUnavailable?.(error.status===404?'ended':'expired');
  }else this.status('Connection lost; retrying');
 }
 private schedule(){
  if(this.timer)clearTimeout(this.timer);
  if(this.stopped||this.disconnected)return;
  const prolonged=this.failureSince!==null&&(this.options.now??Date.now)()-this.failureSince>=(this.options.reconnectTimeoutMs??30000);
  this.timer=setTimeout(()=>{
   if(!this.initialized){void this.connect().catch(()=>{});return;}
   void this.enqueue(()=>this.refresh()).catch(error=>this.connectionFailure(error)).finally(()=>this.schedule());
  },prolonged?(this.options.reconnectPollMs??5000):(this.options.pollMs??1000));
 }
 private async command(path:string,payload:Record<string,unknown>){
  const body=JSON.stringify({...payload,commandId:crypto.randomUUID()});
  let failure:unknown;
  for(let attempt=0;attempt<2;attempt++){
   try{this.deliver(await this.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body}));this.status('Connected');return;}
   catch(e){failure=e;if(this.stopped)throw e;if(e instanceof GatewayError && e.status<500)break;if(!attempt)this.status('Retrying action');}
  }
  // We cannot know whether an ambiguous command committed. Never assign it a new ID.
  // Read current authoritative state; stale selections are discarded by the UI.
  this.status('Resynchronizing');
  try{await this.refresh();this.options.onNotice?.('The board was refreshed from the server.');}
  catch(error){this.connectionFailure(error);throw failure;}
 }
 act(step:number,index:number){return this.enqueue(()=>this.command('/api/action',{step,index}));}
 concede(step:number){return this.enqueue(()=>this.command('/api/concede',{step}));}
 close(){this.stopped=true;this.abort.abort();if(this.timer)clearTimeout(this.timer);}
}
