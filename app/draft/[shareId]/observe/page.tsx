'use client'

/**
 * Privileged Observer — a PUBLIC, no-login live slideshow / kiosk for streaming.
 *
 * The host enables it from the live draft page (sets pods.observer_public); the
 * shareable link is `${origin}/draft/${shareId}/observe`. Renders the draft
 * report Slideshow in live, follow-tail, timer, public-kiosk mode. If the host
 * hasn't enabled the link, the gated API 403s and the slideshow shows the
 * "not enabled" message.
 */

import { use } from 'react'
import DraftSlideshow from '../../../../src/components/DraftSlideshow'
import '../../../../src/App.css'
import '../../../../src/styles/backgrounds.css'

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function PrivilegedObserverPage({ params }: PageProps) {
  const { shareId } = use(params)

  return (
    <DraftSlideshow
      shareId={shareId}
      live
      mode="observer"
      showTimer
      followTail
      publicMode
      onClose={() => {}}
    />
  )
}
