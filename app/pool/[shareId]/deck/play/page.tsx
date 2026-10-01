import { redirect } from 'next/navigation'

// Keep existing builder completion links valid. Native admission checks saved
// deck legality, supported cards and source format before reserving any seat.
export default async function DeckPlayPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  redirect(`/play?pool=${encodeURIComponent(shareId)}`)
}
