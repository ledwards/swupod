import { PATREON_URL } from '@/src/utils/membership'
import { PATREON_FEATURES } from '@/src/utils/patreonFeatures'
import '@/src/components/Button.css'
import './support-the-pod.css'

const TEAMMATES = [
  { name: 'B.A.C.T.A.', href: 'https://norcalswu.com', logo: '/about/bacta.png' },
  { name: "Dodonna's Disciples", href: 'https://bbbbbbasketball.net', logo: '/about/dd.png' },
]
const SPONSORS = [{ name: 'Root Ventures', href: 'https://root.vc', logo: '/about/root_ventures_logo.png' }]

function LogoTiles({ logos }: { logos: typeof TEAMMATES }) {
  return (
    <div className="stp-logos">
      {logos.map(l => (
        <a key={l.name} className="stp-logo" href={l.href} target="_blank" rel="noopener noreferrer">
          <img src={l.logo} alt={l.name} loading="lazy" />
        </a>
      ))}
    </div>
  )
}

/** The themed Support the Pod page (alpha): the Friend of the Pod pitch, every perk, and thanks. */
export default function SupportThePod() {
  return (
    <div className="stp-page">
      <h1>Support the Pod</h1>
      <p>Become a Friend of the Pod on Patreon</p>

      <section className="stp-panel stp-hero" aria-label="Friends of the Pod">
        <a className="stp-badge" href={PATREON_URL} target="_blank" rel="noopener noreferrer" aria-label="Friends of the Pod on Patreon">
          {/* A wide 1008×293 lockup: width-capped, height follows, never squashed. */}
          <img src="/icons/friend-of-the-pod.png" alt="" width={1008} height={293} />
        </a>
        <div className="stp-copy">
          <p>
            Protect the Pod is free to use and <a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer">Open Source</a>.
            If you enjoy online SWU limited and want to help keep us running,
            become a <strong>Friend of the Pod</strong> on Patreon to help cover hosting and development costs.
            Start with a <strong>free 7-day trial</strong> to try every patron feature.
          </p>
          <div className="stp-actions">
            <a className="btn btn--primary btn--lg" href={PATREON_URL} target="_blank" rel="noopener noreferrer">Start Your Free Trial</a>
            <a className="btn btn--secondary btn--lg" href="https://swag.protectthepod.com" target="_blank" rel="noopener noreferrer">Shop the Merch</a>
          </div>
        </div>
      </section>

      <section className="stp-panel stp-labeled" aria-labelledby="stp-features">
        <h2 id="stp-features" className="stp-label">What Friends of the Pod Get ({PATREON_FEATURES.length})</h2>
        <ul className="stp-features">
          {PATREON_FEATURES.map(f => (
            <li key={f.id} className="stp-feature">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
              <div>
                <b>{f.title}</b>
                <span>{f.description}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="stp-thanks">
        <section className="stp-panel stp-labeled" aria-labelledby="stp-teammates">
          <h2 id="stp-teammates" className="stp-label">Thanks to My Teammates</h2>
          <LogoTiles logos={TEAMMATES} />
        </section>
        <section className="stp-panel stp-labeled" aria-labelledby="stp-sponsor">
          <h2 id="stp-sponsor" className="stp-label">Thanks to Our Sponsor</h2>
          <LogoTiles logos={SPONSORS} />
        </section>
      </div>
    </div>
  )
}
