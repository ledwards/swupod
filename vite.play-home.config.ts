import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import ptpCssScope from './scripts/ptp-css-scope.mjs';
/** card-details.json (750 KB) stays out of the bundle: every import of it, Purrgil's included, resolves to the table that
 * play-home/home/card-details.ts fetches on demand. The build copies the JSON next to the bundle (scripts/sync-play-home.mjs). */
const cardDetailsOnDemand=()=>({name:'card-details-on-demand',enforce:'pre' as const,resolveId(source:string,importer?:string){if(importer&&/(^|\/)card-details\.json$/.test(source)&&!importer.endsWith('card-details.ts'))return resolve('play-home/home/card-details.ts');}});
export default defineConfig({plugins:[react(),cardDetailsOnDemand()],resolve:{alias:{'@purrgil/ui':resolve('vendor/purrgil-ui/src')}},css:{postcss:{plugins:[ptpCssScope()]}},define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:'dist-play-home',emptyOutDir:true,lib:{entry:'play-home/home/ptp-entry.tsx',formats:['es'],fileName:()=> 'homepage.js',cssFileName:'homepage'},rollupOptions:{output:{inlineDynamicImports:true}}}});
