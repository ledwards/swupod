// /creator/voice-pack/[token] — the creator's pack, for as long as they have it.
//
// The token in the URL is the entire authorization: it is minted by an admin from
// /admin, nothing links here, and it is the only door. It is NOT single-use. The
// first submit publishes a pack; every later visit reopens that same pack for
// editing, because this URL is the creator's only handle on a voice their audience
// has already unlocked.
//
// Still a flat 404 (see loadVoicePackInviteContext): an unknown token, a malformed
// one, and an expired link that never published anything. Expiry bounds the offer to
// CREATE, not the right to fix what is already live.
//
// force-dynamic: the page reads the database per request; it must never be
// prerendered at build time.
import { notFound } from 'next/navigation'
import { loadVoicePackInviteContext } from '@/lib/voicePackInvite'
import CreatorVoicePackForm from './CreatorVoicePackForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function CreatorVoicePackPage({ params }: PageProps) {
  const { token } = await params

  const { invite, pack, access } = await loadVoicePackInviteContext(token)
  if (access === 'denied' || !invite) notFound()

  return <CreatorVoicePackForm token={token} note={invite.note} published={pack} />
}
