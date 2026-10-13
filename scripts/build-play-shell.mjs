import {createServer} from 'vite';
import {writeFile,mkdir} from 'node:fs/promises';
const server=await createServer({configFile:'vite.play-home.config.ts',server:{middlewareMode:true},appType:'custom'});
try{
 const {renderShell}=await server.ssrLoadModule('/play-home/home/ptp-shell.tsx');
 const paths=['/play?waiting=ai','/play?waiting=queue','/play?waiting=private','/','/play','/play?format=eternal','/history','/decks','/me','/watch'];
 const shells=Object.fromEntries(paths.map(path=>[path,renderShell(path)]));
 await mkdir('dist-play-home',{recursive:true});await writeFile('dist-play-home/shells.json',JSON.stringify(shells)+'\n');
}finally{await server.close();}
