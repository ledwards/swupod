'use client'

import { useEffect, useState, type ComponentProps } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import { useDraftSocket } from '@/src/hooks/useDraftSocket'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { useWayfinderPracticeLaunch } from '@/src/hooks/useWayfinderPracticeLaunch'
import { getKarabastCardPool } from '@/src/utils/setConfigs/latest'
import MatchmakingPanel from '@/src/components/MatchmakingPanel'
import ResultReportModal from '@/src/components/ResultReportModal'
import ChatPanel from '@/src/components/ChatPanel'
import './play.css'

type Panel = ComponentProps<typeof MatchmakingPanel>
type Player = Omit<Panel['players'][number], 'id'> & { odId: string }

/** Existing Swiss events still use the authorized Companion lifecycle. */
export default function CompetitivePlay({ shareId, podShareId, setCode }: { shareId: string; podShareId: string; setCode: string }) {
  const { user, loading: authLoading } = useAuth() as { user: { id: string; is_beta_tester?: boolean; is_admin?: boolean } | null; loading: boolean }
  const { draft, players, isHost, loading, error: loadError, refresh } = useDraftSocket(podShareId, { enabled: Boolean(user) })
  const { detected, settled } = useWayfinderDetection()
  const launch = useWayfinderPracticeLaunch({ draftShareId: podShareId, poolShareId: shareId, wayfinderDetected: detected, cardPool: getKarabastCardPool(setCode), format: 'pool' })
  const [error, setError] = useState('')
  const [report, setReport] = useState<{ id: string; override: boolean } | null>(null)
  const rounds = (draft?.rounds ?? []) as Panel['rounds']
  const match = rounds.flatMap(round => round.matches).find(item => item.id === report?.id)

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    // Entering Play submits the saved builder state for Swiss readiness.
    void fetch(`/api/pools/${encodeURIComponent(shareId)}/build`, { method: 'POST', signal: controller.signal })
      .then(async response => { if (!response.ok) { const value = await response.json(); throw new Error(value.message || 'Save your deck before starting matches.') } await refresh() })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to save your deck.') })
    return () => controller.abort()
  }, [shareId, user?.id, refresh])

  async function mutate(path: string, body?: Record<string, unknown>) {
    setError('')
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(podShareId)}/${path}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || value.message || 'Unable to update this event.')
      await refresh()
      return true
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update this event.'); return false }
  }

  if (authLoading || loading) return <main aria-busy="true" />
  if (!user) return <main className="play-page"><a href={`/api/auth/signin/discord?return_to=${encodeURIComponent(`/pools/${shareId}/deck/play`)}`}>Sign in with Discord</a></main>
  return <main className="play-page">
    <div className="play-content">
      <header className="play-header"><h1>Swiss Practice</h1></header>
      {error && <p role="alert">{error}</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <MatchmakingPanel
        rounds={rounds} currentRound={draft?.currentRound ?? 1}
        matchmakingStatus={draft?.matchmakingStatus ?? 'deck_building'} currentUserId={user.id} isHost={isHost}
        players={(players as unknown as Player[]).map(player => ({ ...player, id: player.odId, username: player.username || 'Unknown' }))}
        wayfinderDetected={detected} wayfinderSettled={settled}
        hasCompanionBetaAccess={Boolean(user.is_beta_tester || user.is_admin)}
        onPracticeLaunch={launch.launchPracticeMatch}
        practiceLaunchPendingMatchId={launch.pendingMatchId} practiceLaunchMessage={launch.launchMessage}
        onReport={id => setReport({ id, override: false })} onOverride={id => setReport({ id, override: true })}
        onBoot={id => { void mutate(`boot/${encodeURIComponent(id)}`) }}
        onSelfDrop={() => { void mutate('matchmaking/drop') }}
        onAssignBye={targetUserId => { void mutate('assign-bye', { targetUserId }) }}
        onStartMatches={() => { void mutate('start-matches') }}
        decksUnlocked={draft?.decksUnlocked === true}
        onToggleDeckLock={() => { void mutate('unlock-decks', { unlocked: draft?.decksUnlocked !== true }) }}
        onCancelEvent={() => { void mutate('cancel-event') }}
      />
      {report && match && <ResultReportModal matchId={report.id} isOverride={report.override}
        player1Name={match.player1?.username ?? 'Unknown'} player2Name={match.player2?.username ?? 'Unknown'}
        currentGame1={match.game1Result ?? null} currentGame2={match.game2Result ?? null} currentGame3={match.game3Result ?? null}
        onSubmit={async (id, game1, game2, game3) => { if (await mutate(`match/${encodeURIComponent(id)}/${report.override ? 'override' : 'report'}`, { game1, game2, game3 })) setReport(null) }}
        onClose={() => setReport(null)} />}
    </div>
    <ChatPanel shareId={podShareId} defaultOpen={false} />
  </main>
}
