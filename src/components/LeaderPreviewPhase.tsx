'use client'

/**
 * LeaderPreviewPhase — the "look around the table" period between the lobby
 * and the leader draft. Packs are dealt and everyone's leader packs are
 * revealed around the table, but nobody can pick and no timers run. The host
 * opens picking with Start Draft (POST /begin-picking → 'leader_draft').
 */
import type { PlayerCircleProps } from './PlayerCircle'
import LeaderTable from './LeaderTable'
import DraftableCard, { type DraftableCardProps } from './DraftableCard'
import Button from './Button'
import { PlayIcon } from './HostControls'

type LeaderCard = DraftableCardProps['card'] & { instanceId?: string }

interface LeaderPreviewPhaseProps {
  draft: ({ maxPlayers?: number; [key: string]: unknown }) | null
  players: PlayerCircleProps['players']
  myPlayer: { id?: string; leaders?: LeaderCard[] } | null
  isHost: boolean
  onBeginPicking: () => void
  beginningPicking: boolean
  error: string | null
  /** Card packs to come, for the "Cards: 0/42" count. */
  totalPacks?: number
}

function LeaderPreviewPhase({
  draft,
  players,
  myPlayer,
  isHost,
  onBeginPicking,
  beginningPicking,
  error,
  totalPacks,
}: LeaderPreviewPhaseProps) {
  const leaders = myPlayer?.leaders || []
  // Spectators (anyone viewing who isn't one of the drafters) get no `myPlayer`.
  const isSpectator = !myPlayer

  const pack = (
    <div className="pack-grid leaders-grid">
      {leaders.map((leader) => {
        const cardId = leader.instanceId || leader.id
        return (
          <DraftableCard
            key={cardId}
            card={leader}
            disabled={true}
            useStaticPreview={true}
            allowZoom={false}
          />
        )
      })}
    </div>
  )

  // Same table as the leader and card picks — only the strip's leaders are
  // dealt and nobody can pick them yet.
  return (
    <LeaderTable
      phaseClassName="leader-preview-phase"
      draft={draft}
      players={players}
      myPlayer={myPlayer}
      isHost={isHost}
      leaderRound={1}
      totalPacks={totalPacks || 3}
      passDirection="right"
      spectatorLabel="Open Leaders"
      packLabel="Your Leader Pack"
      packCount={Math.max(1, leaders.length)}
      pack={pack}
      bottom={isHost ? (
        <div className="pick-confirmation-content preview-start-section">
          <Button variant="primary" onClick={onBeginPicking} disabled={beginningPicking}>
            <PlayIcon />
            <span>{beginningPicking ? 'Starting...' : 'Start Draft'}</span>
          </Button>
        </div>
      ) : !isSpectator ? (
        <div className="pick-confirmation-content">
          <p className="waiting-message">Waiting for host to start the draft...</p>
        </div>
      ) : null}
      error={error}
    />
  )
}

export default LeaderPreviewPhase
