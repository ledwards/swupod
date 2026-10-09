// The shared Play workspace is authored here and copied verbatim to Purrgil:
//   node scripts/sync-shared-play.mjs <purrgil checkout>
import {copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const target=process.argv[2];if(!target)throw Error('Pass the Purrgil checkout to sync to');
for(const file of ['PlayWorkspace.tsx','shared-play.css','deck-library.ts'])await copyFile(`src/components/SharedPlay/${file}`,resolve(target,'src/components/SharedPlay',file));
console.log('Synced the shared Play workspace to Purrgil.');
