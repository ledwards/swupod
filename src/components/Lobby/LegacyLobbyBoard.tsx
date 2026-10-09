'use client'

import { type ComponentProps } from 'react'
import { useOpenGamesSocket } from '@/src/hooks/useOpenGamesSocket'
import { useKarabastLobbies } from '@/src/hooks/useKarabastLobbies'
import { useCompanionCapability } from '@/src/hooks/useCompanionCapability'
import LobbyBoardSection from './LobbyBoardSection'

/** Keep existing users on the supported external lobby during alpha rollout. */
export default function LegacyLobbyBoard({ pods, poolShareId }: { pods: ComponentProps<typeof LobbyBoardSection>['pods']; poolShareId: string | null }) {
  const board = useOpenGamesSocket()
  const karabast = useKarabastLobbies()
  const { casualCapable } = useCompanionCapability()
  return <LobbyBoardSection board={board} pods={pods} karabast={karabast}
    companionCapable={casualCapable} returnPath="/lobby" initialPoolShareId={poolShareId} />
}
