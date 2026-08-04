'use client'

/**
 * The site footer: utility links + the FFG/Disney disclaimer.
 *
 * Extracted from LandingPage when the lobby became the homepage — both render
 * it, so Terms/Privacy/Support and the disclaimer can never be missing from
 * whichever page is serving `/`. One copy, so the links can't drift apart.
 */
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { PATREON_URL } from '../utils/membership'
import { wayfinderCompanionUrl } from '../utils/wayfinderUrls'

export default function SiteFooter(): React.JSX.Element {
  const router = useRouter()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user } = useAuth() as { user: { is_beta_tester?: boolean; is_admin?: boolean } | null }
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  const internal = (href: string, label: string): React.JSX.Element => (
    <a
      href={href}
      onClick={e => {
        e.preventDefault()
        router.push(href)
      }}
    >
      {label}
    </a>
  )

  return (
    <div className="landing-disclaimer">
      <div className="landing-footer-links">
        {internal('/stats', 'Stats')}
        <span className="footer-separator">·</span>
        {internal('/qa', 'QA')}
        <span className="footer-separator">·</span>
        {internal('/api', 'API')}
        <span className="footer-separator">·</span>
        <a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer">GitHub</a>
        <span className="footer-separator">·</span>
        <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Patreon</a>
        <span className="footer-separator">·</span>
        <a href="https://swag.protectthepod.com" target="_blank" rel="noopener noreferrer">Swag</a>
        <span className="footer-separator">·</span>
        {hasBetaAccess && (
          <>
            <a href={wayfinderCompanionUrl()} target="_blank" rel="noopener noreferrer">Companion</a>
            <span className="footer-separator">·</span>
          </>
        )}
        {internal('/support-the-pod', 'Support the Pod')}
        <span className="footer-separator">·</span>
        {internal('/terms-of-service', 'Terms')}
        <span className="footer-separator">·</span>
        {internal('/privacy-policy', 'Privacy')}
      </div>
      <p>Protect the Pod is in no way affiliated with Disney or Fantasy Flight Games. Star Wars characters, cards, logos, and art are property of Disney and/or Fantasy Flight Games.</p>
    </div>
  )
}
