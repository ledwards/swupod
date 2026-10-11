import type { GameResult, MatchWinner, Stage, TournamentSettings } from './tournament'

/** What the pod page renders. Built on the server (hubView.ts); no secrets, no other players' lists. */
/** Hyperspace art: the leader's front, its unit side (for tall boxes) and the base. */
export interface HubDeck { leaderName: string; leaderArt: string | null; leaderUnitArt?: string | null; baseName: string; baseArt: string | null }
export interface HubPlayer { id: string; name: string; seat: number; isBot: boolean; isReady: boolean; isYou: boolean; deck: HubDeck | null }
export interface HubSide { id: string; name: string; isBot: boolean; isYou: boolean; points: number; deck: HubDeck | null }
export interface HubMatch {
  id: string; stage: Stage; round: number; table: number
  p1: HubSide; p2: HubSide | null
  score: [number, number]; games: GameResult[]; winner: MatchWinner | null
  status: 'finished' | 'playing' | 'bye'
  /** The game being played now (or next), while the match is undecided. */
  gameNumber: number | null
  /** A native game is in progress and can be watched. */
  live: boolean
  isYours: boolean
  overridden: boolean
}
export interface HubTab { key: string; label: string; state: 'done' | 'current' | 'upcoming' }
export interface HubRound { key: string; label: string; stage: Stage; round: number; matches: HubMatch[] }
export interface HubStanding { rank: number; id: string; name: string; isBot: boolean; isYou: boolean; points: number; record: string; omw: number }
export interface HubTournament {
  status: 'running' | 'complete'
  stage: Stage
  currentKey: string
  cutStartsAt: number | null
  rounds: HubRound[]
  standings: HubStanding[]
  champion: string | null
}
export interface HubView {
  pod: { shareId: string; name: string; setCode: string; setName: string; status: string }
  viewer: { id: string | null; isHost: boolean; isPlayer: boolean }
  nativePlay: boolean
  settings: TournamentSettings
  recommendedRounds: number
  entrantCount: number
  /** Seat numbers of bots, for "Seats 7 and 8". */
  botSeats: number[]
  summary: string
  subtitle: string
  tabs: HubTab[]
  players: HubPlayer[]
  tournament: HubTournament | null
  myPoolShareId: string | null
  serverNow: number
}
