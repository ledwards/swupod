// @ts-nocheck
import './About.css'

export interface AboutProps {
  onBack?: () => void
}

function About({ onBack }: AboutProps) {
  return (
    <div className="about-page">
      <div className="about-content">
        <section className="support-section">
          <a
            href="https://patreon.com/ProtectthePod"
            target="_blank"
            rel="noopener noreferrer"
            className="patreon-logo-link"
          >
            <img
              src="/patreon/friendofthepod.png"
              alt="Friends of the Pod - Patreon"
              className="patreon-logo"
            />
          </a>
          <h2>Support the Pod</h2>
          <p>
            Protect the Pod is free to use and <a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer" className="about-link">Open Source</a>.
            If you enjoy online SWU limited and want to help keep us running,
            consider becoming a <strong>Friend of the Pod</strong> on Patreon to help cover hosting and development costs.
            Start with a <strong>free 7-day trial</strong> to try all the patron features!
          </p>
          <ul className="patreon-benefits">
            <li><strong>Professional Stats</strong> — Access draft and sealed data across top limited players</li>
            <li><strong>Beta Access</strong> — Access early features and pre-release sets by becoming an exclusive beta tester</li>
            <li><strong>Discord Access</strong> — Join the supporters-only Discord channel with the dev team</li>
            <li><strong>Avatar Flair</strong> — Special avatar treatment so everyone knows you're a supporter</li>
            <li><strong>Support the Pod</strong> — Earn the eternal gratitude of the community for being a supporter of the pod!</li>
          </ul>
          <a
            href="https://patreon.com/ProtectthePod"
            target="_blank"
            rel="noopener noreferrer"
            className="patreon-cta"
          >
            Start Your Free Trial
          </a>
          <a
            href="https://swag.protectthepod.com"
            target="_blank"
            rel="noopener noreferrer"
            className="swag-cta"
          >
            Shop the Merch
          </a>
        </section>

        <div className="thanks-row">
          <section className="teammates-section">
            <h2>Thanks to My Teammates</h2>
            <div className="teammate-logos">
              <a href="https://norcalswu.com" target="_blank" rel="noopener noreferrer" className="teammate-link">
                <img src="/about/NorCalSWU.png" alt="NorCal SWU" className="teammate-logo" />
              </a>
              <a href="https://bbbbbbasketball.net" target="_blank" rel="noopener noreferrer" className="teammate-link">
                <img src="/about/dd.png" alt="Dodonna's Disciples" className="teammate-logo" />
              </a>
            </div>
          </section>

          <section className="sponsor-section">
            <h2>Thanks to Our Sponsor</h2>
            <div className="sponsor-logos">
              <a href="https://root.vc" target="_blank" rel="noopener noreferrer" className="sponsor-link">
                <img src="/about/root_ventures_logo.png" alt="Root Ventures" className="sponsor-logo" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default About
