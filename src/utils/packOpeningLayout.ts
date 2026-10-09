/** Fit the whole reveal into its measured viewport, including rotated corners. */
export function packOpeningLayout(width:number,height:number,cards:readonly {isLeader?:boolean;isBase?:boolean}[],packCount:number){
 const margin=width<600?10:20, gap=width<600?7:12
 const compact=height<660||width<600
 const top=64
 // Controls always sit under the packs: one row (counter · actions · skip) or, when compact, actions above a counter/skip row.
 const footer=100
 // Sealed pools show the entire six/eight-pack set, even in a split pane.
 // Size the packs to the available row before choosing a carousel for boxes.
 const packRowWidth=Math.max(1,width-margin*2)
 const fitPackWidth=packCount>0&&packCount<=8?(packRowWidth-(packCount-1)*gap)/packCount:Infinity
 const packWidth=Math.max(24,Math.min(150,height*.17,(height-top-footer)*.27,fitPackWidth))
 const packHeight=packWidth*1.4
 const packsTop=height-footer-packHeight-12
 const areaHeight=Math.max(1,packsTop-top-18)
 const areaWidth=Math.max(1,width-margin*2)
 const types=cards.length?cards:Array.from({length:16},(_,i)=>({isLeader:i===0,isBase:i===1}))
 // 5° rotation plus a small shadow allowance: both portrait and landscape
 // cards fit inside these boxes at every stage of the resting animation.
 const angle=5*Math.PI/180, c=Math.cos(angle),s=Math.sin(angle)
 const bounds=types.map(card=>{
  const landscape=card.isLeader||card.isBase
  const w=landscape?1.4:1,h=landscape?1:1.4
  return {w,h,bw:w*c+h*s,bh:h*c+w*s}
 })
 let best={size:0,rows:[] as typeof bounds[]}
 for(let columns=2;columns<=Math.min(8,types.length);columns++){
  const rows=Array.from({length:Math.ceil(types.length/columns)},(_,i)=>bounds.slice(i*columns,(i+1)*columns))
  const rowHeights=rows.map(row=>Math.max(...row.map(b=>b.bh)))
  const byHeight=(areaHeight-gap*(rows.length-1))/rowHeights.reduce((a,b)=>a+b,0)
  const size=Math.min(byHeight,...rows.map(row=>(areaWidth-gap*(row.length-1))/row.reduce((sum,b)=>sum+b.bw,0)))
  if(size>best.size)best={size,rows}
 }
 // Single-card promotional packs are also valid.
 if(types.length===1)best={size:Math.min(areaWidth/bounds[0]!.bw,areaHeight/bounds[0]!.bh),rows:[bounds]}
 const size=Math.max(1,best.size)
 const totalHeight=best.rows.reduce((sum,row)=>sum+Math.max(...row.map(b=>b.bh))*size,0)+gap*(best.rows.length-1)
 let y=top+(areaHeight-totalHeight)/2
 const positions:{x:number;y:number;width:number;height:number}[]=[]
 for(const row of best.rows){
  const h=Math.max(...row.map(b=>b.bh))*size
  const rowWidth=row.reduce((sum,b)=>sum+b.bw*size,0)+gap*(row.length-1)
  let x=(width-rowWidth)/2
  for(const b of row){positions.push({x:x+b.bw*size/2,y:y+h/2,width:b.w*size,height:b.h*size});x+=b.bw*size+gap}
  y+=h+gap
 }
 const carousel=packCount*packWidth+(packCount-1)*gap>areaWidth+.01
 return {positions,compact,packWidth,packHeight,packsTop,gap,carousel,footer,top}
}
