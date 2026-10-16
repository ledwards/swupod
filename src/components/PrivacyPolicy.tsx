// @ts-nocheck
import './PrivacyPolicy.css'
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from './Legal/privacySections'

export interface PrivacyPolicyProps {
  onBack?: () => void
}

function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last Updated: {PRIVACY_UPDATED}</p>
        <p>{PRIVACY_INTRO}</p>

        {PRIVACY_SECTIONS.map(section => (
          <section key={section.id}>
            <h2>{section.heading}</h2>
            {section.body}
          </section>
        ))}
      </div>
    </div>
  )
}

export default PrivacyPolicy
