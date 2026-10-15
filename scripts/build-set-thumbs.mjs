// Play's set tiles (the format drawer, the set carousel, Leebo's pool) are about 220px wide; the expansion art they crop
// is up to 1 MB and 2000px. Small WebP copies make the tiles paint on a slow phone without delaying the deck's own art.
// Re-run after adding a set's expansion-art/<set>.png (or .jpg).
import sharp from 'sharp';
import {mkdir,readdir} from 'node:fs/promises';
await mkdir('public/expansion-art/home',{recursive:true});
for(const file of (await readdir('public/expansion-art')).filter(f=>/^[a-z0-9]+\.(?:png|jpg)$/.test(f))){
 await sharp(`public/expansion-art/${file}`).resize({width:480,withoutEnlargement:true}).webp({quality:80}).toFile(`public/expansion-art/home/${file.replace(/\.(?:png|jpg)$/,'.webp')}`);
}
