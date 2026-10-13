import {notFound} from 'next/navigation'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import LiveStyleGuide from '../../src/components/StyleGuide/LiveStyleGuide'

export const metadata = {title: 'Style Guide | Protect the Pod'}

/** The living companion to DESIGN.md: real components, rendered under every site theme. Alpha only, like the theme itself. */
export default async function StyleGuidePage() {
  if (!(await viewerHasAlphaAccess())) notFound()
  return <LiveStyleGuide/>
}
