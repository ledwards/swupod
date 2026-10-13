import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';

/** Storage identity survives engine upgrades; the runtime validates journal compatibility. */
export async function localGameStorage(local){
 const file=resolve(local,'runtime-paths.json');
 let saved;
 try{saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!saved){
  const legacy=await readdir(resolve(local,'runtime'),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  if(legacy.some(entry=>entry.isDirectory()&&entry.name!=='persistent'))throw Error('Existing alpha game storage needs runtime-paths.json before startup. Preserve its engine and gateway directories; do not create an empty game history for a new engine revision.');
  saved={engine:'runtime/persistent/engine',gateway:'runtime/persistent/gateway'};
  await mkdir(local,{recursive:true});
  await writeFile(file,JSON.stringify(saved,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 const paths={};
 for(const key of ['engine','gateway']){
  if(typeof saved[key]!=='string'||!saved[key])throw Error(`Missing alpha ${key} storage path`);
  const path=resolve(local,saved[key]),within=relative(resolve(local,'runtime'),path);
  if(!within||within.startsWith('..')||within.startsWith('/'))throw Error(`Alpha ${key} storage must stay inside its runtime directory`);
  await mkdir(path,{recursive:true});paths[key]=path;
 }
 return paths;
}
