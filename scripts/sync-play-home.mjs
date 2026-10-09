import {copyFile,mkdir,readFile,cp,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!source)throw Error('Pass the Purrgil source directory after building with vite.ptp.config.ts');
execFileSync(process.execPath,['scripts/build-play-shell.mjs'],{cwd:resolve(source),stdio:'inherit'});
await copyFile(resolve(source,'dist-ptp/shells.json'),'src/components/PlayHomepage/shells.json');
await mkdir('public/play-home',{recursive:true});
for(const file of ['homepage.js','homepage.css'])await copyFile(resolve(source,'dist-ptp',file),`public/play-home/${file}`);
// Purrgil-only server data (share-cards.json, cards.json) and its duplicate Barlow copy never ship with the homepage.
const skip=new Set(['public/assets/cards.json','public/assets/share-cards.json','public/table-environments/barlow-400.ttf']);
for(const dir of ['table-environments','assets','sounds']){try{await cp(resolve(source,'public',dir),`public/${dir}`,{recursive:true,errorOnExist:false,filter:src=>!skip.has(relative(source,src))})}catch(e){if(e.code!=='ENOENT')throw e}}
// Release notes are PTP's own: scripts/buildReleaseNotes.ts renders RELEASE_NOTES.md into public/release-notes.md.
const revision=createHash('sha256').update(await readFile('public/play-home/homepage.js')).digest('hex').slice(0,16);
await writeFile('src/components/PlayHomepage/build.json',JSON.stringify({revision})+'\n');
