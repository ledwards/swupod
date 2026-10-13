import {artworkUrl} from '../artwork';
import {useState, useRef, useEffect, useLayoutEffect} from 'react';
import type {Playmat} from '../preferences/playmats';
import {playmatProjection} from '../preferences/playmat-framing';

/** Keep perspective transforms in HTML: Safari mis-scales them inside SVG foreignObject. */
export function PlaymatArt({mat, eager=false}: {mat: Playmat; eager?: boolean}) {
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(eager);
  const [scale, setScale] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const frame = mat.corners
    ? {x:0, y:0, width:1000, height:1000/(mat.aspectRatio ?? 1000/600)}
    : mat.frame ?? {x:0, y:0, width:mat.width ?? 1000, height:mat.height ?? 600};
  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {setVisible(true); observer.disconnect();}
    }, {rootMargin:'200px'});
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  useLayoutEffect(() => {
    const element=ref.current;
    if (!visible || !element) return;
    const measure=()=>setScale(Math.min(element.clientWidth/frame.width,element.clientHeight/frame.height));
    const observer=new ResizeObserver(measure);
    observer.observe(element); measure();
    return ()=>observer.disconnect();
  }, [visible,frame.width,frame.height]);
  return <div ref={ref} className="playmat-art" style={{position:'relative',aspectRatio:frame.width/frame.height}} aria-hidden="true">
    {failed ? <span className="playmat-image-unavailable">Image unavailable</span> : visible && <div style={{position:'absolute',left:'50%',top:'50%',width:frame.width,height:frame.height,overflow:'hidden',transform:`translate(-50%, -50%) scale(${scale})`,transformOrigin:'center'}}>
      <img src={artworkUrl(mat.image)} alt="" draggable={false} onError={()=>setFailed(true)} style={{position:'absolute',display:'block',left:mat.corners?0:-frame.x,top:mat.corners?0:-frame.y,width:mat.width??1000,height:mat.height??600,maxWidth:'none',transformOrigin:'0 0',transform:mat.corners?playmatProjection(mat.corners,mat.aspectRatio):undefined}}/>
    </div>}
  </div>;
}
