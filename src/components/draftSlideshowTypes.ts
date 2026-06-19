import type { CardData } from './Card'
import type { DraftLogPick } from '../utils/draftLogReconstruction'

export interface SlideshowCard extends CardData {
  instanceId: string
  [key: string]: unknown
}

export interface SlideshowPick extends Omit<DraftLogPick, 'visibleCards'> {
  visibleCards: SlideshowCard[]
}

export interface SlideshowBase {
  name: string
  aspects: unknown[]
  imageUrl: string | null
  backImageUrl: string | null
}

export interface SlideshowSeat {
  seatNumber: number
  username: string
  avatarUrl: string | null
  isBot: boolean
  activeLeaderName: string | null
  chosenBase: SlideshowBase | null
  locked: boolean
  picks?: SlideshowPick[]
}

export interface DraftSlideshowData {
  draft: {
    shareId: string
    name: string | null
    setCode: string | null
    setName: string | null
    status: string
    maxPlayers: number | null
    currentPlayers: number
    isLogPublic: boolean
    completedAt: string | null
  }
  viewerSeat: number | null
  slideCount: number
  cardsPerPack: number
  seats: SlideshowSeat[]
}

export type SeatSelection = Set<number>
