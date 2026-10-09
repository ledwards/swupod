import {copyFile,mkdir,readFile,cp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=process.argv[2];if(!source)throw Error('Pass the Purrgil source directory after building with vite.ptp.config.ts');
await mkdir('public/play-home',{recursive:true});
for(const file of ['homepage.js','homepage.css'])await copyFile(resolve(source,'dist-ptp',file),`public/play-home/${file}`);
for(const dir of ['table-environments','assets','sounds']){try{await cp(resolve(source,'public',dir),`public/${dir}`,{recursive:true,errorOnExist:false})}catch(e){if(e.code!=='ENOENT')throw e}}
await copyFile(resolve(source,'public/release-notes.md'),'public/release-notes.md');
const revision=createHash('sha256').update(await readFile('public/play-home/homepage.js')).digest('hex').slice(0,16);
await writeFile('src/components/PlayHomepage/build.json',JSON.stringify({revision})+'\n');
