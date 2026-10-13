import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import ptpCssScope from './scripts/ptp-css-scope.mjs';
export default defineConfig({plugins:[react()],resolve:{alias:{'@purrgil/ui':resolve('vendor/purrgil-ui/src')}},css:{postcss:{plugins:[ptpCssScope()]}},define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:'dist-play-home',emptyOutDir:true,lib:{entry:'play-home/home/ptp-entry.tsx',formats:['es'],fileName:()=> 'homepage.js',cssFileName:'homepage'},rollupOptions:{output:{inlineDynamicImports:true}}}});
