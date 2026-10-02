'use client'

import {useEffect, useState, type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {type ThemeConfig} from '../../presentation/purrgil/theme-contract'

/** Full viewport scenery; gameplay's right-rail reservation is intentionally absent. */
export default function DraftScene({theme}: {theme: ThemeConfig}) {
  const [viewport, setViewport] = useState<{width:number; height:number} | null>(null)
  useEffect(() => {
    const resize = () => setViewport({width:innerWidth, height:innerHeight})
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  if (!viewport) return null
  const {background} = theme
  const layout = background.layout
  let layers
  if (layout) {
    const {scenery} = layout
    const r = scenery.tableBounds
    // Fill both viewport axes, keeping the table almost full width where possible.
    const scale = Math.max(viewport.width / r.width, viewport.height / scenery.height)
    const x = Math.max(viewport.width - scenery.width * scale, Math.min(0, viewport.width / 2 - (r.x + r.width / 2) * scale))
    const y = Math.max(viewport.height - scenery.height * scale, Math.min(0, viewport.height / 2 - (r.y + r.height / 2) * scale))
    const table = layout.tableBounds
    const tableScale = r.width * scale / table.width
    const imageStyle = (width:number, height:number, transform:string):CSSProperties => ({width, height, transform})
    layers = <>
      <img src={scenery.image} alt="" style={imageStyle(scenery.width, scenery.height, `translate(${x}px, ${y}px) scale(${scale})`)} />
      <img src={background.image} alt="" style={{...imageStyle(background.width, background.height, `translate(${x + r.x * scale - table.x * tableScale}px, ${y + r.y * scale - table.y * tableScale}px) scale(${tableScale})`), clipPath:`inset(${table.y}px ${background.width-table.x-table.width}px ${background.height-table.y-table.height}px ${table.x}px)`}} />
    </>
  } else {
    layers = <img className="draft-scene-cover" src={background.image} alt="" style={{objectPosition:`${background.framing.originX}% ${background.framing.originY}%`}} />
  }
  return createPortal(<div className="draft-viewport-scene" aria-hidden="true">{layers}</div>, document.body)
}
