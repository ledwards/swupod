// The homepage's Sealed fan shows packs about 150px tall; the source PNGs are up to 1.4 MB and 1733px.
// Small WebP copies make the fan paint on a slow phone. Re-run after adding a set's pack-images/<set>-pack-N.png.
import sharp from 'sharp';
import {mkdir,readdir} from 'node:fs/promises';
await mkdir('public/pack-images/home',{recursive:true});
for(const file of (await readdir('public/pack-images')).filter(f=>/^[a-z0-9]+-pack-[123]\.png$/.test(f))){
 await sharp(`public/pack-images/${file}`).resize({height:400,withoutEnlargement:true}).webp({quality:80}).toFile(`public/pack-images/home/${file.replace(/\.png$/,'.webp')}`);
}
