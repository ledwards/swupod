import {test} from 'node:test'
import assert from 'node:assert/strict'
import {packOpeningLayout} from './packOpeningLayout'
test('rotated cards fit above packs at phone, tablet, split-pane and desktop sizes',()=>{
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1024,768],[820,600],[1280,720],[1920,1080],[2560,1440]]){
  for(const count of [1,12,16]){
   const cards=Array.from({length:count},(_,i)=>({isLeader:i===0,isBase:i===1}))
   const l=packOpeningLayout(width!,height!,cards,8)
   assert.equal(l.positions.length,count)
   const c=Math.cos(Math.PI/36),s=Math.sin(Math.PI/36)
   for(const p of l.positions){
    const w=p.width*c+p.height*s,h=p.height*c+p.width*s
    assert.ok(p.x-w/2>=0&&p.x+w/2<=width!,`${width} wide`)
    assert.ok(p.y-h/2>=l.top-.001&&p.y+h/2<l.packsTop,`${height} high`)
   }
   assert.ok(l.packsTop+l.packHeight<height!-l.footer)
  }
 }
})

test('all six or eight sealed packs fit together instead of entering the carousel',()=>{
 for(const width of [320,390,600,820,1024,1920]) {
  for(const packCount of [6,8]) {
   const layout=packOpeningLayout(width,768,[],packCount)
   assert.equal(layout.carousel,false,`${packCount} packs at ${width}px`)
   assert.ok(packCount*layout.packWidth+(packCount-1)*layout.gap<=width)
  }
 }
})
