// /creator/voice-pack/[token] — the creator's upload form.
//
// The token in the URL is the entire authorization: it is minted by an admin from
// /admin, nothing links here, and it works exactly once. This server component is the
// door — it validates the invite before rendering anything, and an unknown, used or
// expired token all render the same 404 so the link cannot be probed.
//
// force-dynamic: the page reads the database per request; it must never be
// prerendered at build time.
import { notFound } from 'next/navigation'
import { queryRow } from '@/lib/db'
import { isInviteUsable } from '@/src/services/voicePacks'
import CreatorVoicePackForm from './CreatorVoicePackForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function CreatorVoicePackPage({ params }: PageProps) {
  const { token } = await params

  if (!token || token.length > 128) notFound()

  const invite = await queryRow(
    'SELECT id, note, used_at, expires_at FROM voice_pack_invites WHERE token = $1',
    [token]
  )

  if (!isInviteUsable(invite as never)) notFound()

  return <CreatorVoicePackForm token={token} note={(invite?.['note'] as string) ?? null} />
}
