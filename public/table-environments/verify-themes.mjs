import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('./', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const manifest = await read('manifest.json');
const roles = 'canvas surface surfaceRaised surfaceHover text textMuted accent accentHover onAccent highlight border focus success warning danger info'.split(' ');
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(a,b) {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const results=[];
for (const record of manifest.themes) {
 const t=await read(record.config), c=t.colors, checks=[];
 assert.equal(t.schemaVersion,1);assert.equal(t.id,record.id);
 assert.deepEqual(Object.keys(c).sort(),roles.toSorted());
 for(const value of Object.values(c))assert.match(value,/^#[0-9a-f]{6}$/i);
 assert.equal(t.background.image,'/table-environments/'+record.image);
 assert.deepEqual(t.background.framing,record.framing);
 const bytes=await readFile(new URL(record.image,root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),t.background.sha256);
 const check=(fg,bg,min)=>{const ratio=contrast(c[fg],c[bg]);assert.ok(ratio>=min,`${t.id}: ${fg}/${bg}: ${ratio}`);checks.push({foreground:fg,background:bg,ratio:Number(ratio.toFixed(3)),minimum:min});};
 for(const surface of ['canvas','surface','surfaceRaised','surfaceHover']) {
  for(const text of ['text','textMuted','accent','highlight','success','warning','danger','info'])check(text,surface,4.5);
  for(const control of ['border','focus'])check(control,surface,3);
 }
 for(const fill of ['accent','accentHover'])check('onAccent',fill,4.5);
 results.push({id:t.id,checks});
}
assert.equal(new Set(results.map(r=>r.id)).size,manifest.themes.length);
await writeFile(new URL('palette-validation.json',root),JSON.stringify({themes:results.length,checks:results.reduce((n,r)=>n+r.checks.length,0),results},null,2)+'\n');
console.log(`${results.length} themes: images, framing, color roles and ${results.reduce((n,r)=>n+r.checks.length,0)} contrast pairs passed`);
