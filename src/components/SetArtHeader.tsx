import { getPackArtUrl } from '../utils/packArt'
import '../styles/backgrounds.css'

/** Decorative set art above the standard PTP wallpaper. */
export default function SetArtHeader({ setCode }: { setCode?: string | null | undefined }) {
  const art = setCode ? getPackArtUrl(setCode) : null
  if (!art) return null
  return <div className="ptp-set-art-header" aria-hidden="true" style={{ backgroundImage: `url("${art}")` }} />
}
