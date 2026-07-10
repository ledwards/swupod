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
  onJoin: (listing: OpenGameListing) => void
  onNewGame: () => void
  onJoinKarabast: (lobby: KarabastLobby) => void
}

/**
 * Two-column live board (R1/AE4): Open Games (wider) beside Pods Forming.
 * When the pods column is empty it collapses and Open Games takes the row —
 * an empty board never reads as a ghost town, it reads as an invitation.
 */
export default function LobbyBoard({
  board,
  pods,
  karabast,
  onJoin,
  onNewGame,
  onJoinKarabast,
}: LobbyBoardProps): React.JSX.Element {
  const podsEmpty = pods.length === 0

  return (
    <div className={`lobby-board${podsEmpty ? ' lobby-board-single' : ''}`}>
      <OpenGamesColumn
        board={board}
        karabast={karabast}
        onJoin={onJoin}
        onNewGame={onNewGame}
        onJoinKarabast={onJoinKarabast}
      />
      {!podsEmpty && <PodsFormingColumn pods={pods} />}
    </div>
  )
}
