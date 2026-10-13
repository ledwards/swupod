'use client'

import { type ComponentProps } from 'react'
import { useKarabastLobbies } from '@/src/hooks/useKarabastLobbies'
import { useCompanionCapability } from '@/src/hooks/useCompanionCapability'
import LobbyBoardSection from './LobbyBoardSection'

type Props = ComponentProps<typeof LobbyBoardSection>

/**
 * Keep existing users on the supported external lobby during alpha rollout.
 * The page holds `board` so the same socket also feeds its live counts.
 */
export default function LegacyLobbyBoard({ board, pods, poolShareId }: { board: Props['board']; pods: Props['pods']; poolShareId: string | null }) {
  const karabast = useKarabastLobbies()
  const { casualCapable } = useCompanionCapability()
  return <LobbyBoardSection board={board} pods={pods} karabast={karabast}
    companionCapable={casualCapable} returnPath="/lobby" initialPoolShareId={poolShareId} />
}
