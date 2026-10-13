import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localGameStorage} from './local-game-storage.mjs';
test('engine upgrades keep separately migrated engine and gateway directories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ptp-storage-'));
 try{
  await mkdir(join(root,'runtime','old-engine','engine'),{recursive:true});
  await writeFile(join(root,'runtime','old-engine','engine','game.json'),'saved game');
  await assert.rejects(localGameStorage(root),/Existing alpha game storage/);
  await writeFile(join(root,'runtime-paths.json'),JSON.stringify({engine:'runtime/old-engine/engine',gateway:'runtime/older-gateway/gateway'}));
  const paths=await localGameStorage(root);
  assert.equal(await readFile(join(paths.engine,'game.json'),'utf8'),'saved game');
  assert.equal(paths.gateway,join(root,'runtime/older-gateway/gateway'));
  assert.deepEqual(await localGameStorage(root),paths);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('fresh alpha storage has stable paths independent of an engine pin',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ptp-storage-'));
 try{const first=await localGameStorage(root);assert.deepEqual(await localGameStorage(root),first);assert.equal(first.engine,join(root,'runtime/persistent/engine'));}
 finally{await rm(root,{recursive:true,force:true});}
});
