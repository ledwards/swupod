'use client'

/**
 * /lobby — kept alive so existing links and bookmarks keep working now that
 * the lobby is also the homepage. Both routes render the same component.
 */
import LobbyHome from '@/src/components/Lobby/LobbyHome'

export default function LobbyPage(): React.JSX.Element {
  return <LobbyHome />
}
