// @ts-nocheck
import './TermsOfService.css'
import { TERMS_SECTIONS } from './Legal/termsSections'

export interface TermsOfServiceProps {
  onBack?: () => void
}

function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Terms of Service</h1>
        <p className="last-updated">Last Updated: {new Date().toLocaleDateString()}</p>

        {TERMS_SECTIONS.map(section => (
          <section key={section.id}>
            <h2>{section.heading}</h2>
            {section.body}
          </section>
        ))}
      </div>
    </div>
  )
}

export default TermsOfService
