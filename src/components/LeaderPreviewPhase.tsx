'use client'

/**
 * LeaderPreviewPhase — the "look around the table" period between the lobby
 * and the leader draft. Packs are dealt and everyone's leader packs are
 * revealed around the table, but nobody can pick and no timers run. The host
 * opens picking with Start Draft (POST /begin-picking → 'leader_draft').
 */
import PlayerCircle, { type PlayerCircleProps } from './PlayerCircle'
import DraftableCard, { type DraftableCardProps } from './DraftableCard'
import Button from './Button'
import { PlayIcon } from './HostControls'
import './LeaderDraftPhase.css'

type LeaderCard = DraftableCardProps['card'] & { instanceId?: string }

interface LeaderPreviewPhaseProps {
  draft: ({ maxPlayers?: number; [key: string]: unknown }) | null
  players: PlayerCircleProps['players']
  myPlayer: { id?: string; leaders?: LeaderCard[] } | null
  isHost: boolean
  onBeginPicking: () => void
  beginningPicking: boolean
  error: string | null
}

function LeaderPreviewPhase({
  draft,
  players,
  myPlayer,
  isHost,
  onBeginPicking,
  beginningPicking,
  error,
}: LeaderPreviewPhaseProps) {
  const leaders = myPlayer?.leaders || []
  // Spectators (anyone viewing who isn't one of the drafters) get no `myPlayer`.
  const isSpectator = !myPlayer

  return (
    <div className="leader-preview-phase">
      <div className="draft-layout">
        <div className="players-section">
          {/* Same table view as the leader draft — everyone's 3-leader packs visible */}
          <PlayerCircle
            players={players}
            maxPlayers={draft?.maxPlayers || 8}
            {...(myPlayer?.id ? { currentUserId: myPlayer.id } : {})}
            showStatus={true}
            {...(draft ? { draft } : {})}
            hideEmptySeats={true}
            showLeaderInfo={true}
            passDirection="right"
            leaderRound={1}
          />
        </div>

        <div className="cards-section">
          {isSpectator ? (
            <div className="draft-info-header">
              <div className="draft-progress-info">
                <span className="progress-item">
                  <span className="info-label">Spectating —</span>
                  <span className="info-value">Leaders Revealed</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="available-leaders">
              <h3>Your Leader Pack</h3>
              <div className="leaders-grid">
                {leaders.map((leader) => {
                  const cardId = leader.instanceId || leader.id
                  return (
                    <DraftableCard
                      key={cardId}
                      card={leader}
                      disabled={true}
                      useStaticPreview={true}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {isHost ? (
            <div className="preview-start-section">
              <Button
                variant="primary"
                onClick={onBeginPicking}
                disabled={beginningPicking}
              >
                <PlayIcon />
                <span>{beginningPicking ? 'Starting...' : 'Start Draft'}</span>
              </Button>
            </div>
          ) : !isSpectator ? (
            <p className="waiting-message">Waiting for host to start the draft...</p>
          ) : null}
        </div>
      </div>

      {error && <div className="phase-error">{error}</div>}
    </div>
  )
}

export default LeaderPreviewPhase
