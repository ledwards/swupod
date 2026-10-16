import {copyFile,mkdir,readFile,cp,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!source)throw Error('Pass the Purrgil source directory to export the shared game UI');
// Every bundle builds on Purrgil origin/main. A stale checkout would also copy its old table art and theme JSON over PTP's.
const git=args=>execFileSync('git',args,{cwd:resolve(source),stdio:['ignore','pipe','pipe']}).toString().trim();
try{git(['fetch','--quiet','origin','main'])}catch{console.warn('Could not fetch Purrgil origin/main; checking against the last fetched copy.')}
try{git(['merge-base','--is-ancestor','origin/main','HEAD'])}catch{throw Error(`Purrgil source ${source} (${git(['rev-parse','--short','HEAD'])}) does not contain origin/main (${git(['rev-parse','--short','origin/main'])}). Build the bundle from Purrgil origin/main or a branch on top of it.`)}
// Purrgil exports shared game UI; PTP owns and builds its website source.
execFileSync(process.execPath,['scripts/export-host-ui.mjs',resolve('vendor/purrgil-ui')],{cwd:resolve(source),stdio:'inherit'});
await mkdir('play-home/data/table-themes',{recursive:true});
for(const theme of ['endor','kashyyyk','tatooine'])await copyFile(resolve(source,`public/table-environments/themes/${theme}.json`),`play-home/data/table-themes/${theme}.json`);
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.play-home.config.ts'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/build-play-shell.mjs'],{stdio:'inherit'});
await copyFile('dist-play-home/shells.json','src/components/PlayHomepage/shells.json');
await mkdir('public/play-home',{recursive:true});
for(const file of ['homepage.js','homepage.css'])await copyFile(resolve('dist-play-home',file),`public/play-home/${file}`);
// The card table is fetched by the bundle on demand (play-home/home/card-details.ts), not compiled into it.
await copyFile('vendor/purrgil-ui/src/engine/card-details.json','public/play-home/card-details.json');
// Purrgil-only server data (share-cards.json, cards.json) and its duplicate Barlow copy never ship with the homepage.
const skip=new Set(['public/assets/cards.json','public/assets/share-cards.json','public/table-environments/barlow-400.ttf']);
for(const dir of ['table-environments','assets','sounds']){try{await cp(resolve(source,'public',dir),`public/${dir}`,{recursive:true,errorOnExist:false,filter:src=>!skip.has(relative(source,src))&&!/\.(?:html|md)$/.test(src)&&!/validation\.json$|verify-themes\.mjs$/.test(src)})}catch(e){if(e.code!=='ENOENT')throw e}}
// Release notes are PTP's own: scripts/buildReleaseNotes.ts renders RELEASE_NOTES.md into public/release-notes.md.
// Table themes are Purrgil's: regenerate PTP's optimized copy from the same manifest so the two can never drift.
execFileSync(process.execPath,['scripts/presentation/import-purrgil.mjs',resolve(source)],{stdio:'inherit'});
// The revision busts caches for both files: a CSS-only Purrgil change must reach browsers too.
const revision=createHash('sha256').update(await readFile('public/play-home/homepage.js')).update(await readFile('public/play-home/homepage.css')).digest('hex').slice(0,16);
let purrgilCommit=null;try{purrgilCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:resolve(source)}).toString().trim()}catch{}
await writeFile('src/components/PlayHomepage/build.json',JSON.stringify({revision,purrgilCommit})+'\n');
