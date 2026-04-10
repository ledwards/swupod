// @ts-nocheck
import { useState, useMemo } from 'react'
import MatchCard from './MatchCard'
import Button from './Button'
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
  players: { id: string; username: string }[]
  onReport: (matchId: string) => void
  onOverride: (matchId: string) => void
  onBoot: (userId: string) => void
  onAssignBye: (targetUserId: string) => void
  onStartMatches: () => void
}

function computeStandings(rounds: Round[]) {
  const records: Record<string, { id: string; username: string; wins: number; losses: number; draws: number }> = {}

  const ensurePlayer = (p: MatchPlayer | null) => {
    if (!p) return
    if (!records[p.id]) {
      records[p.id] = { id: p.id, username: p.username, wins: 0, losses: 0, draws: 0 }
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      ensurePlayer(match.player1)
      ensurePlayer(match.player2)

      if (!match.finalConfirmed) continue

      if (match.isBye && match.player1) {
        records[match.player1.id].wins += 1
        continue
      }

      if (match.matchWinner === 'player1' && match.player1) {
        records[match.player1.id].wins += 1
        if (match.player2) records[match.player2.id].losses += 1
      } else if (match.matchWinner === 'player2' && match.player2) {
        records[match.player2.id].wins += 1
        if (match.player1) records[match.player1.id].losses += 1
      } else if (match.matchWinner === 'draw') {
        if (match.player1) records[match.player1.id].draws += 1
        if (match.player2) records[match.player2.id].draws += 1
      }
    }
  }

  return Object.values(records).sort((a, b) => {
    // Sort by wins desc, then losses asc, then draws desc
    if (b.wins !== a.wins) return b.wins - a.wins
    if (a.losses !== b.losses) return a.losses - b.losses
    return b.draws - a.draws
  })
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
}: MatchmakingPanelProps) {
  const totalRounds = Math.max(rounds.length, 3)
  const tabs = []
  for (let i = 1; i <= totalRounds; i++) {
    tabs.push({ label: `Round ${i}`, key: `round-${i}` })
  }
  tabs.push({ label: 'Results', key: 'results' })

  const defaultTab = matchmakingStatus === 'complete' ? 'results' : `round-${currentRound}`
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Find current user's match in the active round
  const myMatch = useMemo(() => {
    const activeRound = rounds.find(r => r.roundNumber === currentRound)
    if (!activeRound) return null
    return activeRound.matches.find(
      m => m.player1?.id === currentUserId || m.player2?.id === currentUserId
    ) || null
  }, [rounds, currentRound, currentUserId])

  const standings = useMemo(() => computeStandings(rounds), [rounds])

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

  return (
    <div className="matchmaking-panel">
      <div className="matchmaking-panel-header">
        <span className="matchmaking-panel-label">COMPETITIVE PRACTICE</span>
      </div>

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
        <div className="matchmaking-host-controls">
          <Button variant="primary" glowColor="yellow" onClick={onStartMatches}>
            Start Round 1
          </Button>
        </div>
      )}

      {/* Round tabs */}
      <div className="matchmaking-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`matchmaking-tab${activeTab === tab.key ? ' matchmaking-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="matchmaking-tab-content">
        {activeTab === 'results' ? (
          <div className="matchmaking-standings">
            {standings.length === 0 ? (
              <p className="matchmaking-empty">No results yet</p>
            ) : (
              <ol className="matchmaking-standings-list">
                {standings.map((player, i) => (
                  <li key={player.id} className={`matchmaking-standing-row${player.id === currentUserId ? ' matchmaking-standing-row--mine' : ''}`}>
                    <span className="matchmaking-standing-rank">{i + 1}.</span>
                    <span className="matchmaking-standing-name">{player.username}</span>
                    <span className="matchmaking-standing-record">
                      {player.wins}W-{player.losses}L{player.draws > 0 ? `-${player.draws}D` : ''}
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
                  {round.matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      currentUserId={currentUserId}
                      isHost={isHost}
                      onReport={onReport}
                      onOverride={onOverride}
                      onBoot={onBoot}
                    />
                  ))}
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
