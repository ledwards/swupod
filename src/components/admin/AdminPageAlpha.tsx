/**
 * /admin for alpha viewers: the two admin panels on the themed page shell.
 * The admin gate stays in app/admin/page.tsx and runs before this renders.
 */
import ThemedPage from '@/src/components/ThemedPage/ThemedPage'
import { LogIcon } from '@/src/components/PodHub/icons'
import AdminGrantPanelAlpha from './AdminGrantPanelAlpha'
import AdminVoicePackInvitePanelAlpha from './AdminVoicePackInvitePanelAlpha'
import './admin-alpha.css'

export default function AdminPageAlpha() {
  return (
    <ThemedPage title="Admin" subtitle="Access grants and creator invites" className="adma-page">
      <nav className="adma-nav" aria-label="Admin tools">
        <a className="btn btn--secondary btn--sm" href="/admin/game-notes">
          <LogIcon />
          <span>Game Notes</span>
        </a>
      </nav>
      <div className="adma-grid">
        <AdminGrantPanelAlpha />
        <AdminVoicePackInvitePanelAlpha />
      </div>
    </ThemedPage>
  )
}
