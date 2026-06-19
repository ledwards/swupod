// @ts-nocheck
import { useEffect, useRef, useState, useMemo } from 'react'
import MatchCard from './MatchCard'
import Button from './Button'
import CompetitivePracticeRules from './CompetitivePracticeRules'
import {
  nextActiveTabAfterRoundChange,
  type PracticeLaunchMessage,
  roundProgressLabel,
  roundTabState,
  shouldShowInstallNudge,
  statusLine,
  wayfinderMatchState,
} from './MatchmakingPanel.helpers'
import WayfinderStoreButtons from './WayfinderStoreButtons'
import {
  computeRankedStandings,
  hasConfirmedMatch,
  recordsThroughRound,
} from '../services/matchmaking/standings'
import './MatchmakingPanel.css'

interface MatchPlayer {
  id: string
  username: string
  avatarUrl?: string
}

interface MatchData {
  id: string
  player1: MatchPlayer | null
  player2: MatchPlayer | null
  isBye: boolean
  game1Result: string | null
  game2Result: string | null
  game3Result: string | null
  player1Submitted: boolean
  player2Submitted: boolean
  finalConfirmed: boolean
  matchWinner: string | null
  podOwnerOverride: boolean
  wayfinderMatchId?: string | null
}

interface Round {
  roundNumber: number
  status: string
  matches: MatchData[]
}

interface MatchmakingPanelProps {
  rounds: Round[]
  currentRound: number
  matchmakingStatus: string
  currentUserId: string
  isHost: boolean
  players: { id: string; username: string; dropped?: boolean }[]
  onReport: (matchId: string) => void
  onOverride: (matchId: string) => void
  onBoot: (userId: string) => void
  onAssignBye: (targetUserId: string) => void
  onStartMatches: () => void
  onPracticeLaunch?: (matchId: string) => void | Promise<void>
  practiceLaunchPendingMatchId?: string | null
  practiceLaunchMessage?: PracticeLaunchMessage | null
  wayfinderDetected?: boolean
  wayfinderSettled?: boolean
  hasCompanionBetaAccess?: boolean
}

export function MatchmakingPanel({
  rounds,
  currentRound,
  matchmakingStatus,
  currentUserId,
  isHost,
  players,
  onReport,
  onOverride,
  onBoot,
  onAssignBye,
  onStartMatches,
  onPracticeLaunch,
  practiceLaunchPendingMatchId = null,
  practiceLaunchMessage = null,
  wayfinderDetected = false,
  wayfinderSettled = true,
  hasCompanionBetaAccess = false,
}: MatchmakingPanelProps) {
  const totalRounds = Math.max(rounds.length, 3)
  const tabs = []
  for (let i = 1; i <= totalRounds; i++) {
    tabs.push({ label: `Round ${i}`, key: `round-${i}` })
  }
  tabs.push({ label: 'Standings', key: 'results' })

  const defaultTab = matchmakingStatus === 'complete' ? 'results' : `round-${currentRound}`
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const previousCurrentRoundRef = useRef(currentRound)

  useEffect(() => {
    const previousCurrentRound = previousCurrentRoundRef.current
    setActiveTab(tab => nextActiveTabAfterRoundChange(tab, previousCurrentRound, currentRound, matchmakingStatus))
    previousCurrentRoundRef.current = currentRound
  }, [currentRound, matchmakingStatus])

  // Find current user's match in the active round
  const myMatch = useMemo(() => {
    const activeRound = rounds.find(r => r.roundNumber === currentRound)
    if (!activeRound) return null
    return activeRound.matches.find(
      m => m.player1?.id === currentUserId || m.player2?.id === currentUserId
    ) || null
  }, [rounds, currentRound, currentUserId])

  const standings = useMemo(() => computeRankedStandings(rounds, players), [rounds, players])
  const hasResults = useMemo(() => hasConfirmedMatch(rounds), [rounds])

  // Find bye player for the active round's bye dropdown
  const activeRound = rounds.find(r => r.roundNumber === currentRound)
  const currentByePlayerId = activeRound?.matches.find(m => m.isBye)?.player1?.id || null

  // Players available for bye reassignment (exclude current bye holder)
  const byeCandidates = useMemo(() => {
    if (!activeRound) return []
    const allPlayerIds = new Set<string>()
    for (const m of activeRound.matches) {
      if (m.player1) allPlayerIds.add(m.player1.id)
      if (m.player2) allPlayerIds.add(m.player2.id)
    }
    return players.filter(p => allPlayerIds.has(p.id) && p.id !== currentByePlayerId)
  }, [activeRound, players, currentByePlayerId])

  const showStartButton = isHost && matchmakingStatus === 'deck_building' && rounds.length === 0
  const hasActiveRound = activeRound && activeRound.status === 'active'
  const progressLabel = roundProgressLabel(currentRound, totalRounds, activeRound)
  const playerStatus = statusLine({ matchmakingStatus, currentRound, currentUserId, myMatch })
  const showInstallNudge = shouldShowInstallNudge(wayfinderDetected, hasCompanionBetaAccess, wayfinderSettled)
  const liveLaunchEnabled = Boolean(wayfinderDetected && hasCompanionBetaAccess && onPracticeLaunch)

  return (
    <div
      className="matchmaking-panel"
      data-testid="matchmaking-panel"
      data-matchmaking-status={matchmakingStatus}
      data-current-round={currentRound}
      data-active-tab={activeTab}
      data-wayfinder-detected={wayfinderDetected ? 'true' : 'false'}
    >
      <div className="matchmaking-panel-header">
        <span className="matchmaking-panel-label">Swiss Practice</span>
        <Button
          variant="secondary"
          size="sm"
          textOnly
          className="matchmaking-how-toggle"
          onClick={() => setShowHowItWorks(v => !v)}
          aria-expanded={showHowItWorks}
        >
          How it works <span className={`matchmaking-how-caret${showHowItWorks ? ' is-open' : ''}`}>▸</span>
        </Button>
      </div>

      {showHowItWorks && (
        <div className="matchmaking-how-panel">
          <CompetitivePracticeRules showTitle={false} swissOnly />
        </div>
      )}

      <div className="matchmaking-status-band">
        <span className="matchmaking-round-progress">{progressLabel}</span>
        <span className="matchmaking-status-line">{playerStatus}</span>
      </div>

      {showInstallNudge && (
        <div className="matchmaking-wayfinder-nudge">
          <div className="matchmaking-wayfinder-copy">
            <strong>Install Wayfinder</strong>
            <span>Auto-record and auto-confirm your Practice games.</span>
          </div>
          <WayfinderStoreButtons orientation="inline" />
        </div>
      )}

      {/* Current match callout */}
      {myMatch && matchmakingStatus === 'active' && (
        <div className="matchmaking-my-match">
          {myMatch.isBye ? (
            <span>You have a bye this round</span>
          ) : (
            <span>
              Your match: You vs.{' '}
              <strong>
                {myMatch.player1?.id === currentUserId
                  ? myMatch.player2?.username || '???'
                  : myMatch.player1?.username || '???'}
              </strong>
            </span>
          )}
        </div>
      )}

      {/* Pod owner: start matches */}
      {showStartButton && (
        <div className="matchmaking-host-controls" data-testid="start-matches-button-container">
          <Button variant="primary" glowColor="yellow" onClick={onStartMatches}>
            Start Round 1
          </Button>
        </div>
      )}

      {/* Round tabs */}
      <div className="matchmaking-tabs">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            variant="toggle"
            glowColor="yellow"
            active={activeTab === tab.key}
            className={`matchmaking-tab${tab.key.startsWith('round-') ? ` matchmaking-tab--${roundTabState(parseInt(tab.key.replace('round-', '')), currentRound, matchmakingStatus)}` : ''}`}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`matchmaking-tab-${tab.key}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div className="matchmaking-tab-content">
        {activeTab === 'results' ? (
          <div className="matchmaking-standings">
            {!hasResults ? (
              <p className="matchmaking-empty">No results yet</p>
            ) : (
              <ol className="matchmaking-standings-list">
                {standings.map((player, i) => (
                  <li
                    key={player.id}
                    className={`matchmaking-standing-row${player.id === currentUserId ? ' matchmaking-standing-row--mine' : ''}${player.dropped ? ' matchmaking-standing-row--dropped' : ''}`}
                    data-testid={`standing-row-${i + 1}`}
                    data-player-id={player.id}
                    data-rank={player.rank}
                    data-wins={player.wins}
                    data-losses={player.losses}
                    data-draws={player.draws}
                    data-omw={Math.round(player.omwPercent * 100)}
                  >
                    <span className="matchmaking-standing-rank">{player.rank}.</span>
                    <span className="matchmaking-standing-name">
                      {player.username}
                      {player.dropped && <span className="matchmaking-standing-dropped">dropped</span>}
                    </span>
                    <span className="matchmaking-standing-record">
                      {player.wins}W-{player.losses}L{player.draws > 0 ? `-${player.draws}D` : ''}
                    </span>
                    <span className="matchmaking-standing-omw">
                      {Math.round(player.omwPercent * 100)}% <span>OMW</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <>
            {(() => {
              const roundNum = parseInt(activeTab.replace('round-', ''))
              const round = rounds.find(r => r.roundNumber === roundNum)
              if (!round) {
                return <p className="matchmaking-empty">Round not yet started</p>
              }
              return (
                <div className="matchmaking-matches-grid">
                  {(() => {
                    const playerRecords = recordsThroughRound(rounds, round.roundNumber)
                    return round.matches.map(match => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        currentUserId={currentUserId}
                        isHost={isHost}
                        playerRecords={playerRecords}
                        liveLaunchEnabled={liveLaunchEnabled}
                        onPracticeLaunch={onPracticeLaunch}
                        practiceLaunchPending={practiceLaunchPendingMatchId === match.id}
                        practiceLaunchMessage={
                          practiceLaunchMessage?.matchId === match.id
                            ? practiceLaunchMessage
                            : null
                        }
                        wayfinderState={wayfinderMatchState(
                          wayfinderDetected,
                          match.wayfinderMatchId,
                          Boolean(
                            !match.finalConfirmed &&
                            !match.isBye &&
                            (match.player1?.id === currentUserId || match.player2?.id === currentUserId)
                          )
                        )}
                        onReport={onReport}
                        onOverride={onOverride}
                        onBoot={onBoot}
                      />
                    ))
                  })()}
                </div>
              )
            })()}

            {/* Bye override dropdown for host */}
            {isHost && hasActiveRound && currentByePlayerId && byeCandidates.length > 0 && (
              <div className="matchmaking-bye-control">
                <label className="matchmaking-bye-label">Reassign bye to:</label>
                <select
                  className="matchmaking-bye-select"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onAssignBye(e.target.value)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="" disabled>Select player...</option>
                  {byeCandidates.map(p => (
                    <option key={p.id} value={p.id}>{p.username}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default MatchmakingPanel
