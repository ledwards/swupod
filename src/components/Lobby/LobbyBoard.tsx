'use client'

import OpenGamesColumn from './OpenGamesColumn'
import PodsFormingColumn from './PodsFormingColumn'
import type { OpenGamesBoard, OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import type { KarabastLobby } from '@/src/hooks/useKarabastLobbies'

interface PublicPod {
  shareId: string
  podType: string
  setCode: string
  setName: string
  name?: string | null
  maxPlayers: number
  currentPlayers: number
  host: { username: string; avatarUrl: string }
  createdAt: string
}

interface LobbyBoardProps {
  board: OpenGamesBoard
  pods: PublicPod[]
  karabast: { available: boolean; lobbies: KarabastLobby[] }
  currentUsername?: string | null
  onJoin: (listing: OpenGameListing) => void
  onLeave: (listing: OpenGameListing) => void
  onNewGame: () => void
  onJoinKarabast: (lobby: KarabastLobby) => void
}

/** Two glass boxes side by side (R1): Open Games and Pods Forming — always both. */
export default function LobbyBoard({
  board,
  pods,
  karabast,
  currentUsername = null,
  onJoin,
  onLeave,
  onNewGame,
  onJoinKarabast,
}: LobbyBoardProps): React.JSX.Element {
  return (
    <div className="lobby-board">
      <OpenGamesColumn
        board={board}
        karabast={karabast}
        currentUsername={currentUsername}
        onJoin={onJoin}
        onLeave={onLeave}
        onNewGame={onNewGame}
        onJoinKarabast={onJoinKarabast}
      />
      <PodsFormingColumn pods={pods} />
    </div>
  )
}
