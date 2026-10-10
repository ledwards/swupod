import dotenv from 'dotenv';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
const ptpRoot=process.cwd(),purrgilRoot=process.env.PURRGIL_SOURCE,envRoot=process.env.PTP_ENV_SOURCE??ptpRoot,runtimeEnv=process.env.PTP_RUNTIME_ENV,runtimeBinary=process.env.PTP_RUNTIME_BINARY;
if(!purrgilRoot||!runtimeEnv||!runtimeBinary)throw Error('Set PURRGIL_SOURCE, PTP_RUNTIME_ENV, and PTP_RUNTIME_BINARY.');
// Do not launch a second stack on top of another worktree.
for(const port of [3000,8080,4332])await new Promise((accept,reject)=>{const server=createServer();server.once('error',()=>reject(Error(`Port ${port} is occupied. Stop the existing local stack first.`)));server.listen(port,()=>server.close(accept));});
dotenv.config({path:resolve(envRoot,'.env'),quiet:true});dotenv.config({path:resolve(envRoot,'.env.local'),override:true,quiet:true});
const runtime=dotenv.parse(await readFile(runtimeEnv));
const local=resolve(ptpRoot,'.alpha-local');await mkdir(local,{recursive:true});
const revision=runtime.BAIZE_ENGINE_REVISION;
if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('Local runtime needs its exact engine revision.');
const gameStorage=resolve(local,'runtime',revision);
await mkdir(gameStorage,{recursive:true});
const env={...process.env,NODE_OPTIONS:process.env.NODE_OPTIONS||'--max-old-space-size=8192',DISCORD_BOT_TOKEN:'',DISCORD_GUILD_ID:'',PTP_NATIVE_PLAY_ENABLED:'true',PTP_SOLO_AI_ENABLED:'true',PTP_BETA_EXPERIENCE_ENABLED:'true',PTP_SITE_THEME_ENABLED:'true',PTP_NATIVE_SUPPORT_PATH:resolve(local,'support.json'),BAIZE_PVP_SERVICE_KEY:runtime.BAIZE_PVP_SERVICE_KEY,BAIZE_PVP_URL:'http://localhost:4332',APP_URL:'http://localhost:3000',PTP_PUBLIC_ORIGIN:'http://localhost:3000',PURRGIL_INTERNAL_URL:'http://localhost:8080',PURRGIL_PUBLIC_ORIGIN:'http://localhost:8080'};
const children=new Set();let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children){if(!child.pid)continue;try{process.kill(-child.pid,'SIGTERM');}catch{}const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);timer.unref();}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
function start(args,cwd,environment,persistent=true){const child=spawn(args[0],args.slice(1),{cwd,env:environment,stdio:'inherit',detached:true});children.add(child);child.on('error',error=>{console.error(error.message);process.exitCode=1;stop();});child.on('exit',code=>{children.delete(child);if(persistent&&!stopping){process.exitCode=code||1;stop();}});return child;}
try{
 const engine=start([runtimeBinary],ptpRoot,{...process.env,...runtime,PORT:'4332',BAIZE_PVP_DATA_DIR:resolve(gameStorage,'engine')});
 let ready=false;
 for(let i=0;i<60;i++){
  if(engine.exitCode!==null||stopping)throw Error('Local engine stopped during startup.');
  try{await fetch('http://localhost:4332/health',{signal:AbortSignal.timeout(500)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}
 }
 if(!ready)throw Error('Local engine did not start within 15 seconds.');
 // Admission must use this binary's actual card support and exact rules revision.
 await new Promise((accept,reject)=>{const child=start([process.execPath,'node_modules/tsx/dist/cli.mjs','scripts/native-play/build-support-manifest.ts','--env-file',runtimeEnv,'--output',env.PTP_NATIVE_SUPPORT_PATH,'--engine',env.BAIZE_PVP_URL,'--sets','all'],ptpRoot,env,false);child.on('error',reject);child.on('exit',code=>code===0?accept():reject(Error('Local engine support generation failed')));});
 start([process.execPath,'server/index.mjs'],purrgilRoot,{...env,PUBLIC_ORIGIN:'http://localhost:8080',HOST_ORIGIN:'http://localhost:3000',HOST_SERVICE_KEY:env.PURRGIL_HOST_SERVICE_KEY,BAIZE_URL:env.BAIZE_PVP_URL,PORT:'8080',LOBBY_ENABLED:'true',LOBBY_SHARED_PLAY_ENABLED:'true',SESSION_DIR:resolve(gameStorage,'gateway')});
 start([process.execPath,'node_modules/tsx/dist/cli.mjs','scripts/play-home-local-server.ts'],ptpRoot,env);
 console.log('Alpha: PTP http://localhost:3000 · Purrgil http://localhost:8080');
}catch(error){stop();throw error;}
