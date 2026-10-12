import type { GameResult, MatchWinner, Stage, TournamentSettings } from './tournament'

/** What the pod page renders. Built on the server (hubView.ts); no secrets, no other players' lists. */
/** Hyperspace art: the leader's front, its unit side (for tall boxes) and the base. */
export interface HubDeck {
  leaderName: string; leaderArt: string | null; leaderUnitArt?: string | null; baseName: string; baseArt: string | null
  /** The base's colour aspect, for the divider between leader and base art. */
  baseAspect?: 'vigilance' | 'command' | 'aggression' | 'cunning' | null
  /** "Baylan Red": the name the "Decks from this pool" chips use. */
  archetype?: string | null
}
export interface HubPlayer {
  id: string; name: string; seat: number; isBot: boolean; isReady: boolean; isYou: boolean; deck: HubDeck | null
  /** The pool to open this deck from, when the viewer may see it (owner, host, or every member once decks are public). */
  deckPoolShareId: string | null
}
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
  /** A bot-vs-bot table that resolves once a human in its round starts a game. */
  waiting: boolean
  overridden: boolean
}
export interface HubTab { key: string; label: string; state: 'done' | 'current' | 'upcoming' }
export interface HubRound { key: string; label: string; stage: Stage; round: number; matches: HubMatch[] }
export interface HubStanding { rank: number; id: string; name: string; isBot: boolean; isYou: boolean; points: number; record: string; omw: number }
export interface HubTournament {
  status: 'running' | 'complete'
  stage: Stage
  currentKey: string
  rounds: HubRound[]
  standings: HubStanding[]
  champion: string | null
}
export interface HubView {
  pod: { shareId: string; name: string; setCode: string; setName: string; status: string }
  viewer: { id: string | null; isHost: boolean; isPlayer: boolean }
  nativePlay: boolean
  /** A competitive pod's old Swiss Practice event, read in place: no play, fixes or settings here. */
  legacy: boolean
  settings: TournamentSettings
  /** Host's "Decks and pools public": every pod member can open every deck and pool. */
  decksPublic: boolean
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
