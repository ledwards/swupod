import {
  bracketRoundName, bracketRoundNames, champion, computeStandings, gameScore, nextGameNumber, normalizeSettings,
  recommendedRounds, settingsSubtitle, settingsSummary,
  type Entrant, type TournamentMatch, type TournamentSettings,
} from './tournament'
import type { StoredTournament } from './tournamentDb'
import type { HubDeck, HubMatch, HubPlayer, HubRound, HubSide, HubStanding, HubTab, HubTournament, HubView } from './hubTypes'

export interface HubInputPlayer {
  id: string; name: string; seat: number; isBot: boolean; dropped: boolean; isReady: boolean
  deck: HubDeck | null; poolShareId: string | null
}

/** "Decks and pools public": off unless the host turned it on. */
export function decksPublicOf(podSettings: unknown): boolean {
  return !!podSettings && typeof podSettings === 'object' && (podSettings as Record<string, unknown>).decksPublic === true
}
export interface HubInput {
  pod: { shareId: string; name: string; setCode: string; setName: string; status: string; hostId: string; settings: unknown }
  viewerId: string | null
  nativePlay: boolean
  players: HubInputPlayer[]
  tournament: StoredTournament | null
  /** The tournament is a competitive pod's old Swiss Practice event, shown read-only. */
  legacy?: boolean
  /** Per undecided match: whether its current native game is live. */
  liveMatches: Set<string>
  now: number
}

const recordText = (w: number, l: number, d: number) => `${w}–${l}${d ? `–${d}` : ''}`

/** Pre-start settings: what the host saved, else what Create a Pod chose. */
export function pendingSettings(podSettings: unknown, entrantCount: number): TournamentSettings {
  const s = (podSettings && typeof podSettings === 'object' ? podSettings : {}) as Record<string, unknown>
  const saved = s.tournament && typeof s.tournament === 'object' ? s.tournament : { afterDraft: s.afterDraft }
  return normalizeSettings(saved, entrantCount)
}

function roundKey(m: Pick<TournamentMatch, 'stage' | 'round'>) {
  return m.stage === 'swiss' ? `swiss-${m.round}` : `elim-${m.round}`
}

export function buildHubView(input: HubInput): HubView {
  const { pod, viewerId, tournament: t } = input
  const settingsRaw = (pod.settings && typeof pod.settings === 'object' ? pod.settings : {}) as Record<string, unknown>
  const preliminary = pendingSettings(settingsRaw, 8)
  const roster = input.players.filter(p => !p.dropped && (preliminary.botsPlay || !p.isBot))
  const entrantCount = t ? t.entrants.length : roster.length
  const settings = t ? t.settings : pendingSettings(settingsRaw, entrantCount)
  const names = new Map(input.players.map(p => [p.id, p]))
  const isBot = (id: string) => names.get(id)?.isBot ?? false
  const me = input.players.find(p => p.id === viewerId)
  const isHost = !!viewerId && viewerId === pod.hostId
  const decksPublic = decksPublicOf(settingsRaw)
  // A deck and its pool open for their owner and the host; for every pod member when the host made them public.
  const canOpen = (p: HubInputPlayer) => p.id === viewerId || isHost || (decksPublic && !!me && !me.isBot)
  const players: HubPlayer[] = input.players.filter(p => !p.dropped).map(p => ({
    id: p.id, name: p.name, seat: p.seat, isBot: p.isBot, isReady: p.isReady, isYou: p.id === viewerId, deck: p.deck,
    deckPoolShareId: p.isReady && p.deck && canOpen(p) ? p.poolShareId : null,
  }))

  let tournament: HubTournament | null = null
  let currentKey = 'deckbuilding'
  if (t) {
    const entrants: Entrant[] = t.entrants
    const swissMatches = t.matches.filter(m => m.stage === 'swiss')
    const pointsBefore = new Map<number, Map<string, number>>()
    const pointsAt = (round: number) => {
      if (!pointsBefore.has(round)) pointsBefore.set(round, new Map(computeStandings(entrants, swissMatches.filter(m => m.round < round)).map(s => [s.id, s.points])))
      return pointsBefore.get(round)!
    }
    const side = (id: string, round: number, stage: string): HubSide => ({
      id, name: names.get(id)?.name ?? 'Player', isBot: isBot(id), isYou: id === viewerId,
      points: (stage === 'swiss' ? pointsAt(round) : pointsAt(Infinity)).get(id) ?? 0, deck: names.get(id)?.deck ?? null,
    })
    const byKey = new Map<string, HubRound>()
    for (const m of t.matches) {
      const key = roundKey(m)
      const roundMatches = t.matches.filter(x => x.stage === m.stage && x.round === m.round)
      const round = byKey.get(key) ?? { key, stage: m.stage, round: m.round, matches: [],
        label: m.stage === 'swiss' ? `Round ${m.round}` : bracketRoundName(roundMatches.length) }
      byKey.set(key, round)
      const hub: HubMatch = {
        id: m.id, stage: m.stage, round: m.round, table: m.table,
        p1: side(m.player1, m.round, m.stage), p2: m.player2 ? side(m.player2, m.round, m.stage) : null,
        score: gameScore(m.games), games: m.games, winner: m.winner,
        status: !m.player2 ? 'bye' : m.winner ? 'finished' : 'playing',
        gameNumber: nextGameNumber(m), live: input.liveMatches.has(m.id),
        isYours: !!viewerId && (m.player1 === viewerId || m.player2 === viewerId), overridden: t.overridden.has(m.id),
      }
      round.matches.push(hub)
    }
    const rounds = [...byKey.values()].sort((a, b) => (a.stage === b.stage ? a.round - b.round : a.stage === 'swiss' ? -1 : 1))
    rounds.forEach(r => r.matches.sort((a, b) => a.table - b.table))
    const last = rounds.at(-1)
    if (t.status === 'complete' && settings.format === 'swiss') currentKey = 'standings'
    else currentKey = last?.key ?? 'deckbuilding'
    const standings: HubStanding[] = computeStandings(entrants, t.matches).map(s => ({
      rank: s.rank, id: s.id, name: names.get(s.id)?.name ?? 'Player', isBot: isBot(s.id), isYou: s.id === viewerId,
      points: s.points, record: recordText(s.wins, s.losses, s.draws), omw: s.omw,
    }))
    tournament = {
      status: t.status, stage: last?.stage ?? 'swiss', currentKey, rounds, standings,
      champion: champion(t),
    }
  } else if (settings.format === 'none') currentKey = 'deckbuilding'

  const existing = new Set((tournament?.rounds ?? []).map(r => r.key))
  const tab = (key: string, label: string): HubTab => ({ key, label,
    state: key === currentKey ? 'current' : key === 'standings' || existing.has(key) || (key === 'deckbuilding' && !!t) ? 'done' : 'upcoming' })
  const tabs: HubTab[] = [tab('deckbuilding', 'Deckbuilding')]
  if (settings.format === 'swiss') {
    for (let r = 1; r <= settings.rounds; r++) tabs.push(tab(`swiss-${r}`, `Round ${r}`))
    tabs.push(tab('standings', 'Standings'))
  } else if (settings.format === 'elimination') {
    bracketRoundNames(Math.max(2, entrantCount)).forEach((label, i) => tabs.push(tab(`elim-${i + 1}`, label)))
  }

  return {
    pod: { shareId: pod.shareId, name: pod.name, setCode: pod.setCode, setName: pod.setName, status: pod.status },
    viewer: { id: viewerId, isHost, isPlayer: !!me && !me.isBot },
    nativePlay: input.nativePlay && !input.legacy, legacy: input.legacy === true,
    settings, decksPublic, recommendedRounds: recommendedRounds(entrantCount), entrantCount,
    botSeats: input.players.filter(p => p.isBot && !p.dropped).map(p => p.seat).sort((a, b) => a - b),
    summary: settingsSummary(settings), subtitle: settingsSubtitle(settings),
    tabs, players, tournament, myPoolShareId: me?.poolShareId ?? null, serverNow: input.now,
  }
}
