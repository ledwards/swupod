// @ts-nocheck
import { useEffect, useRef, useState, useMemo } from 'react'
import MatchCard from './MatchCard'
import Button from './Button'
import Modal from './Modal'
import CompetitivePracticeRules from './CompetitivePracticeRules'
import { avatarSrc } from '../utils/avatar'
import {
  liveConsoleRoundOrder,
  liveRoundMatchGroups,
  nextActiveTabAfterRoundChange,
  type PracticeLaunchMessage,
  roundProgressLabel,
  roundTabState,
  selfDropState,
  shouldShowInstallNudge,
  statusLine,
  wayfinderMatchState,
} from './MatchmakingPanel.helpers'
import { wayfinderPracticeTier } from '../utils/wayfinderCapabilities'
import { buildUsagePieStops, usagePieColor } from './YourStats/usagePie'
import WayfinderStoreButtons from './WayfinderStoreButtons'
import {
  computeRankedStandings,
  hasConfirmedMatch,
  recordsThroughRound,
} from '../services/matchmaking/standings'
import {
  computeSwissPracticeEventSummary,
  type EventMetaRow,
} from '../services/matchmaking/eventAnalytics'
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
  startedAt?: string | Date | null
  matches: MatchData[]
}

interface MatchmakingPanelProps {
  rounds: Round[]
  currentRound: number
  matchmakingStatus: string
  currentUserId: string
  isHost: boolean
  players: {
    id: string
    username: string
    dropped?: boolean
    poolShareId?: string | null
    activeLeaderName?: string | null
    baseName?: string | null
    baseAspects?: string[] | null
    baseHp?: number | null
    archetypeName?: string | null
    leaderImageUrl?: string | null
    baseImageUrl?: string | null
    poolCardCount?: number | null
    isHost?: boolean
  }[]
  onReport: (matchId: string) => void
  onOverride: (matchId: string) => void
  onBoot: (userId: string) => void
  onSelfDrop: () => void
  onAssignBye: (targetUserId: string) => void
  onStartMatches: () => void
  /** Pod owner only: the pod-level primary-deck lock state, and a toggle for it.
   *  Lets the host unlock everyone's deck mid-event (e.g. to fix a deck) and
   *  re-lock — the same control as the deckbuilder, surfaced in the Swiss panel. */
  decksUnlocked?: boolean
  onToggleDeckLock?: () => void
  /** Pod owner only: cancel the whole event (tears down rounds + returns the pod
   *  to deck building). Gated behind a confirm dialog. */
  onCancelEvent?: () => void
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
  onSelfDrop,
  onAssignBye,
  onStartMatches,
  decksUnlocked = false,
  onToggleDeckLock,
  onCancelEvent,
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
  const [showDropConfirm, setShowDropConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [elapsedNow, setElapsedNow] = useState(() => Date.now())
  const previousCurrentRoundRef = useRef(currentRound)

  useEffect(() => {
    const previousCurrentRound = previousCurrentRoundRef.current
    setActiveTab(tab => nextActiveTabAfterRoundChange(tab, previousCurrentRound, currentRound, matchmakingStatus))
    previousCurrentRoundRef.current = currentRound
  }, [currentRound, matchmakingStatus])

  const hasInProgressGame = useMemo(() => hasInProgressLiveGame(rounds), [rounds])

  useEffect(() => {
    if (!hasInProgressGame) return
    setElapsedNow(Date.now())
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [hasInProgressGame])

  const displayRounds = useMemo(() => roundsWithLiveElapsed(rounds, elapsedNow), [rounds, elapsedNow])
  const roundOrder = useMemo(
    () => liveConsoleRoundOrder(displayRounds, currentRound, matchmakingStatus),
    [displayRounds, currentRound, matchmakingStatus]
  )
  const primaryRound = roundOrder.primaryRoundNumber
    ? displayRounds.find(r => r.roundNumber === roundOrder.primaryRoundNumber) || null
    : null
  const focusedRoundNumber = activeTab.startsWith('round-')
    ? parseInt(activeTab.replace('round-', ''))
    : null
  // The round tabs ARE the history navigation: the console shows the round for
  // the selected tab (falling back to the live round), so there's no separate
  // "previous rounds" box repeating them. A past round renders in its completed
  // ('history') form; the live round in its 'active' form.
  const consoleRound = focusedRoundNumber != null
    ? (displayRounds.find(r => r.roundNumber === focusedRoundNumber) || null)
    : primaryRound
  const consoleVariant: 'active' | 'history' =
    consoleRound && consoleRound.roundNumber === currentRound && matchmakingStatus !== 'complete'
      ? 'active'
      : 'history'

  // Find current user's match in the active round
  const myMatch = useMemo(() => {
    const activeRound = displayRounds.find(r => r.roundNumber === currentRound)
    if (!activeRound) return null
    return activeRound.matches.find(
      m => m.player1?.id === currentUserId || m.player2?.id === currentUserId
    ) || null
  }, [displayRounds, currentRound, currentUserId])

  const standings = useMemo(() => computeRankedStandings(displayRounds, players), [displayRounds, players])
  // Rank by Swiss standing (1 = top) so match cards can be numbered Table 1..N
  // by record — Table 1 trends toward the winners as rounds progress.
  const rankByPlayer = useMemo(() => new Map(standings.map(s => [s.id, s.rank])), [standings])
  const hasResults = useMemo(() => hasConfirmedMatch(displayRounds), [displayRounds])
  const eventSummary = useMemo(
    () => computeSwissPracticeEventSummary({ players, rounds: displayRounds }),
    [players, displayRounds]
  )
  const playerById = useMemo(() => {
    const byId = new Map<string, MatchmakingPanelProps['players'][number]>()
    for (const player of players) byId.set(player.id, player)
    return byId
  }, [players])
  const playerRecordsByRound = useMemo(() => {
    const records = new Map<number, ReturnType<typeof recordsThroughRound>>()
    for (const round of displayRounds) {
      records.set(round.roundNumber, recordsThroughRound(displayRounds, round.roundNumber))
    }
    return records
  }, [displayRounds])

  // Find bye player for the active round's bye dropdown
  const activeRound = displayRounds.find(r => r.roundNumber === currentRound)
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
  // Tier: 'none' (no Companion) | 'ready' (Companion detected). We don't gate on
  // plugin version/capability — a detected Companion can launch. Manual reporting
  // works either way.
  const practiceTier = wayfinderPracticeTier(wayfinderDetected)
  const showInstallNudge = shouldShowInstallNudge(wayfinderDetected, hasCompanionBetaAccess, wayfinderSettled)
  // Live launch + auto-report whenever the Companion is detected.
  const liveLaunchEnabled = Boolean(practiceTier === 'ready' && onPracticeLaunch)
  const dropState = selfDropState({ isHost, matchmakingStatus, currentUserId, players })

  const confirmSelfDrop = () => {
    setShowDropConfirm(false)
    onSelfDrop()
  }

  const confirmCancelEvent = () => {
    setShowCancelConfirm(false)
    onCancelEvent?.()
  }

  // Organizer can cancel the event while it's running (not after it's complete).
  const canCancelEvent = Boolean(isHost && matchmakingStatus === 'active' && onCancelEvent)

  const renderMatchCard = (match: MatchData, roundNumber: number, tableNumber?: number, roundStartedAt?: string | Date | null) => (
    <MatchCard
      key={match.id}
      match={match}
      tableNumber={tableNumber}
      roundNumber={roundNumber}
      roundStartedAt={roundStartedAt}
      currentUserId={currentUserId}
      isHost={isHost}
      playerRecords={playerRecordsByRound.get(roundNumber)}
      liveLaunchEnabled={liveLaunchEnabled}
      onPracticeLaunch={onPracticeLaunch}
      practiceLaunchPending={practiceLaunchPendingMatchId === match.id}
      practiceLaunchMessage={
        practiceLaunchMessage?.matchId === match.id
          ? practiceLaunchMessage
          : null
      }
      wayfinderState={wayfinderMatchState(
        practiceTier === 'ready',
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
      wayfinderDetected={wayfinderDetected}
    />
  )

  const renderRoundSection = (round: Round, variant: 'active' | 'history') => {
    const focused = variant === 'history' && focusedRoundNumber === round.roundNumber
    const matchGroups = variant === 'active' ? liveRoundMatchGroups(round) : null
    const shouldGroupMatches = Boolean(matchGroups && matchGroups.completed.length > 0)
    // Number every match in the round by Swiss rank (best player's standing),
    // stable across the live/completed groupings below.
    const rankOf = (m: MatchData) => Math.min(
      rankByPlayer.get(m.player1?.id ?? '') ?? Number.MAX_SAFE_INTEGER,
      rankByPlayer.get(m.player2?.id ?? '') ?? Number.MAX_SAFE_INTEGER,
    )
    const tableByMatch = new Map<string, number>()
    ;[...round.matches].sort((a, b) => rankOf(a) - rankOf(b)).forEach((m, i) => tableByMatch.set(m.id, i + 1))
    const renderMatchGrid = (matches: MatchData[], className = '') => (
      <div className={`matchmaking-matches-grid${className ? ` ${className}` : ''}`}>
        {matches.map(match => renderMatchCard(match, round.roundNumber, tableByMatch.get(match.id), round.startedAt))}
      </div>
    )

    return (
      <section
        key={round.roundNumber}
        className={`matchmaking-round-section matchmaking-round-section--${variant}${focused ? ' matchmaking-round-section--focused' : ''}`}
        data-testid={`matchmaking-round-section-${round.roundNumber}`}
        data-round-number={round.roundNumber}
        data-round-status={round.status}
      >
        <div className="matchmaking-round-section-header">
          <div className="matchmaking-round-section-title">
            <span className="matchmaking-round-section-kicker">
              {variant === 'active' ? 'Live round' : 'History'}
            </span>
            <h4>Round {round.roundNumber}</h4>
          </div>
          <span className="matchmaking-round-section-progress">
            {roundProgressLabel(round.roundNumber, totalRounds, round)}
          </span>
        </div>
        {shouldGroupMatches && matchGroups ? (
          <div className="matchmaking-round-match-groups">
            {matchGroups.live.length > 0 && (
              <div className="matchmaking-round-match-group matchmaking-round-match-group--live">
                <div className="matchmaking-round-match-group-header">
                  <h5>Live matches</h5>
                  <span>{matchGroups.live.length} active</span>
                </div>
                {renderMatchGrid(matchGroups.live)}
              </div>
            )}

            <div className="matchmaking-round-match-group matchmaking-round-match-group--completed">
              <div className="matchmaking-round-match-group-header">
                <h5>Completed matches</h5>
                <span>{matchGroups.completed.length} done</span>
              </div>
              {renderMatchGrid(matchGroups.completed, 'matchmaking-matches-grid--completed')}
            </div>
          </div>
        ) : (
          renderMatchGrid(round.matches)
        )}
      </section>
    )
  }

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
        <div className="matchmaking-panel-heading">
          <span className="matchmaking-panel-eyebrow">Swiss Practice</span>
          <span className="matchmaking-panel-label">Competitive</span>
        </div>
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

      {/* Pre-round roster: who's in the pod, deck-ready status, and the host
          (plain "Host" tag — no crown). No deck-image links. */}
      {matchmakingStatus === 'deck_building' && rounds.length === 0 && players.length > 0 && (
        <div className="matchmaking-roster" data-testid="matchmaking-roster">
          {players.map(p => {
            const ready = Boolean(p.activeLeaderName && p.baseName)
            return (
              <div
                key={p.id}
                className="matchmaking-roster-row"
                data-player-id={p.id}
                data-ready={ready ? 'true' : 'false'}
              >
                <span className="matchmaking-roster-name">
                  {p.username}
                  {p.isHost && <span className="matchmaking-roster-host">Host</span>}
                </span>
                <span className={`matchmaking-roster-ready${ready ? ' is-ready' : ''}`}>
                  {ready ? 'Ready' : 'Building…'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {showInstallNudge && (
        <div className="matchmaking-wayfinder-nudge">
          <div className="matchmaking-wayfinder-copy">
            <strong>Install Wayfinder</strong>
            <span>Auto-record and auto-confirm your Practice games. You can also report results manually below.</span>
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
            <span className="matchmaking-my-match-line">
              Your Round {currentRound} match:{' '}
              <img className="matchmaking-avatar" src={avatarSrc((myMatch.player1?.id === currentUserId ? myMatch.player1 : myMatch.player2)?.avatarUrl, (myMatch.player1?.id === currentUserId ? myMatch.player1 : myMatch.player2)?.id)} alt="" />
              You vs.{' '}
              <img className="matchmaking-avatar" src={avatarSrc((myMatch.player1?.id === currentUserId ? myMatch.player2 : myMatch.player1)?.avatarUrl, (myMatch.player1?.id === currentUserId ? myMatch.player2 : myMatch.player1)?.id)} alt="" />
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

      {/* Pod owner only: lock / unlock everyone's primary deck mid-event. Decks
          freeze when Swiss begins; the host can release them (e.g. so a player can
          fix a deck) and re-lock. Mirrors the deckbuilder lock control. */}
      {isHost && matchmakingStatus === 'active' && onToggleDeckLock && (
        <div className="matchmaking-host-controls matchmaking-deck-lock" data-testid="deck-lock-control">
          <Button
            variant="warning"
            size="sm"
            onClick={onToggleDeckLock}
            title={decksUnlocked
              ? 'Lock every player’s primary deck for this pod again'
              : 'Unlock every player’s primary deck so they can edit'}
          >
            {decksUnlocked ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            )}
            <span>{decksUnlocked ? 'Lock player decks' : 'Unlock player decks'}</span>
          </Button>
          <span className="matchmaking-deck-lock-note">
            {decksUnlocked
              ? 'Decks are unlocked — players can edit. Tap to freeze them again.'
              : 'Decks are locked for Swiss. Tap to let players edit.'}
          </span>
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
              <>
                <ol className="matchmaking-standings-list">
                  {standings.map((player, i) => {
                    const playerMeta = playerById.get(player.id)
                    const identity = playerMeta?.archetypeName
                      || [playerMeta?.activeLeaderName, playerMeta?.baseName].filter(Boolean).join(' · ')
                    return (
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
                          <span className="matchmaking-standing-name-line">
                            {player.username}
                            {player.dropped && <span className="matchmaking-standing-dropped">dropped</span>}
                          </span>
                          {identity && (
                            <span className="matchmaking-standing-identity">{identity}</span>
                          )}
                          {(playerMeta?.leaderImageUrl || playerMeta?.baseImageUrl) && (
                            <span className="matchmaking-standing-cards" aria-hidden="true">
                              {playerMeta?.leaderImageUrl && (
                                <img className="matchmaking-standing-card" src={playerMeta.leaderImageUrl} alt="" loading="lazy" />
                              )}
                              {playerMeta?.baseImageUrl && (
                                <img className="matchmaking-standing-card" src={playerMeta.baseImageUrl} alt="" loading="lazy" />
                              )}
                            </span>
                          )}
                        </span>
                        <span className="matchmaking-standing-record">
                          {player.wins}W-{player.losses}L{player.draws > 0 ? `-${player.draws}D` : ''}
                        </span>
                        <span className="matchmaking-standing-omw">
                          {Math.round(player.omwPercent * 100)}% <span>OMW</span>
                        </span>
                      </li>
                    )
                  })}
                </ol>

                {matchmakingStatus === 'complete' && (
                  <SwissPracticeEventSummary summary={eventSummary} />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="matchmaking-live-console" data-testid="matchmaking-live-console">
            {consoleRound ? (
              renderRoundSection(consoleRound, consoleVariant)
            ) : (
              <p className="matchmaking-empty">Round not yet started</p>
            )}

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

          </div>
        )}
      </div>

      {(dropState !== 'hidden' || canCancelEvent) && (
        <div className="matchmaking-self-drop">
          {canCancelEvent && (
            <Button
              variant="danger"
              size="sm"
              className="matchmaking-cancel-event-button"
              data-testid="cancel-event-button"
              onClick={() => setShowCancelConfirm(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M15 9l-6 6M9 9l6 6"></path>
              </svg>
              Cancel Swiss Practice
            </Button>
          )}
          {dropState === 'dropped' ? (
            <span className="matchmaking-self-drop-note" data-testid="self-drop-dropped-note">
              You&apos;ve dropped from this event.
            </span>
          ) : dropState !== 'hidden' ? (
            <Button
              variant="danger"
              size="sm"
              className="matchmaking-self-drop-button"
              data-testid="self-drop-button"
              onClick={() => setShowDropConfirm(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Drop from event
            </Button>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={showDropConfirm}
        onClose={() => setShowDropConfirm(false)}
        variant="danger"
        title="Drop from Swiss Practice?"
      >
        <Modal.Body>
          <p>
            You&apos;ll be removed from the rest of this event. Your current match is recorded
            as a loss for you, and you won&apos;t be paired in future rounds. This can&apos;t be undone.
          </p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setShowDropConfirm(false)}>
            Stay in
          </Button>
          <Button variant="danger" data-testid="self-drop-confirm" onClick={confirmSelfDrop}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Drop
          </Button>
        </Modal.Actions>
      </Modal>

      <Modal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        variant="danger"
        title="Cancel this Swiss Practice event?"
      >
        <Modal.Body>
          <p>
            Every round, pairing, and reported result will be deleted and all players
            return to deck building. This ends the event for everyone and can&apos;t be undone.
          </p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setShowCancelConfirm(false)}>
            Keep playing
          </Button>
          <Button variant="danger" data-testid="cancel-event-confirm" onClick={confirmCancelEvent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M15 9l-6 6M9 9l6 6"></path>
            </svg>
            Cancel Swiss Practice
          </Button>
        </Modal.Actions>
      </Modal>
    </div>
  )
}

function hasInProgressLiveGame(rounds: Round[]): boolean {
  return rounds.some(round => round.matches.some(match => match.currentGame?.status === 'in_progress'))
}

function roundsWithLiveElapsed(rounds: Round[], nowMs: number): Round[] {
  if (!hasInProgressLiveGame(rounds)) return rounds

  return rounds.map(round => ({
    ...round,
    matches: round.matches.map(match => {
      const currentGame = currentGameWithLiveElapsed(match.currentGame, nowMs)
      return currentGame === match.currentGame ? match : { ...match, currentGame }
    }),
  }))
}

function currentGameWithLiveElapsed(currentGame: any, nowMs: number) {
  if (!currentGame || currentGame.status !== 'in_progress') return currentGame

  const startedMs = timestampMs(currentGame.game?.startedAt)
  if (!startedMs) return currentGame

  return {
    ...currentGame,
    elapsedSeconds: Math.max(0, Math.floor((nowMs - startedMs) / 1000)),
  }
}

function timestampMs(value: unknown): number | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value !== 'string') return null

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function SwissPracticeEventSummary({
  summary,
}: {
  summary: ReturnType<typeof computeSwissPracticeEventSummary>
}) {
  return (
    <div className="matchmaking-event-summary" data-testid="swiss-practice-event-summary">
      <div className="matchmaking-event-summary-header">
        <span className="matchmaking-event-summary-kicker">Event summary</span>
        <span className="matchmaking-event-summary-note">
          {summary.totalDecks} decks · {summary.knownArchetypeDecks} identified
        </span>
      </div>
      <div className="matchmaking-event-summary-grid">
        <EventMetaPanel title="Archetypes" rows={summary.archetypeMeta.slice(0, 5)} />
        <EventMetaPanel title="Leaders" rows={summary.leaderMeta.slice(0, 5)} />
      </div>
    </div>
  )
}

function EventMetaPanel({ title, rows }: { title: string; rows: EventMetaRow[] }) {
  const pieStops = buildUsagePieStops(rows.map((r, i) => ({ matches: Math.max(1, Math.round((r.metaShare || 0) * 1000)), color: usagePieColor(i) })))
  return (
    <div className="matchmaking-event-card">
      <span className="matchmaking-event-card-title">{title}</span>
      {rows.length === 0 ? (
        <p className="matchmaking-event-empty">No deck identity yet</p>
      ) : (
        <div className="matchmaking-event-meta-body">
          <div
            className="matchmaking-event-pie"
            style={{ background: pieStops ? `conic-gradient(${pieStops})` : 'rgba(255,255,255,0.08)' }}
            aria-hidden="true"
          />
          <div className="matchmaking-event-meta-list">
            {rows.map((row, i) => (
              <div className="matchmaking-event-meta-row" key={`${title}-${row.name}`}>
                <span className="matchmaking-event-meta-swatch" style={{ background: usagePieColor(i) }} aria-hidden="true" />
                <span className="matchmaking-event-meta-name">{row.name}</span>
                <span className="matchmaking-event-meta-share">{formatPercent(row.metaShare)}</span>
                <span className="matchmaking-event-meta-record">
                  {row.matchWins}-{row.matchLosses}{row.matchDraws > 0 ? `-${row.matchDraws}` : ''}
                  {row.smallSample && <span>small sample</span>}
                </span>
                <span className="matchmaking-event-meta-rate">
                  {row.matchWinRate == null ? 'No matches' : `${formatPercent(row.matchWinRate)} WR`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default MatchmakingPanel
