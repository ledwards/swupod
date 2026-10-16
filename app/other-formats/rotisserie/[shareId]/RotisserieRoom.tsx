'use client'

import RotisseriePlayLegacy from '../../../formats/rotisserie/[shareId]/RotisseriePlayLegacy'
import SiteFooter from '../../../../src/components/SiteFooter'
import './rotisserie-room.css'

/**
 * Alpha Rotisserie room: the existing lobby / drafting / complete component,
 * unchanged, themed by a scoped stylesheet (`.rot-alpha`) that re-points its
 * hard-coded colors at theme roles. Settings picked on the setup step arrive
 * already applied; the host can still adjust them here.
 */
export default function RotisserieRoom() {
  return (
    <div className="rot-alpha">
      <RotisseriePlayLegacy/>
      <SiteFooter/>
    </div>
  )
}
