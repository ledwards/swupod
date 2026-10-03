'use client'
import { useEffect, useState } from 'react'

/** Crop the illustration in source coordinates before fitting it to any tile. */
export default function LeaderArtwork({ src, className }: { src: string; className?: string }) {
  const [image, setImage] = useState<{src: string; width: number; height: number} | null>(null)
  useEffect(() => {
    let active = true
    const loader = new Image()
    loader.onload = () => {
      if (active) setImage({src, width: loader.naturalWidth, height: loader.naturalHeight})
    }
    loader.src = src
    return () => { active = false }
  }, [src])
  if (!image || image.src !== src) return null
  const { width, height } = image
  // Unit faces: below the title/cost, above the traits/stats/rules.
  // Landscape leader faces: illustration on the left, excluding the text box.
  const rect = width > height ? [0.06, 0.18, 0.36, 0.62] : [0.1, 0.2, 0.8, 0.3]
  return (
    <svg className={className} viewBox={`${rect[0]! * width} ${rect[1]! * height} ${rect[2]! * width} ${rect[3]! * height}`} preserveAspectRatio="xMidYMid slice" overflow="hidden" aria-hidden="true">
      <image href={src} width={width} height={height} />
    </svg>
  )
}
