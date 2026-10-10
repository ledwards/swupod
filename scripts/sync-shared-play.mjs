// Copies the canonical shared play workspace from PTP into Purrgil.
// Usage (from the swupod root): node scripts/sync-shared-play.mjs [target-dir]
// The default target assumes purrgil is checked out next to swupod.
import {copyFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const target=resolve(process.argv[2]??'../purrgil/src/components/SharedPlay');
mkdirSync(target,{recursive:true});
for(const name of ['OpponentChoice.tsx','ModeIcon.tsx','PlayWorkspace.tsx','deck-library.ts','shared-play.css'])copyFileSync(resolve('src/components/SharedPlay',name),resolve(target,name));
