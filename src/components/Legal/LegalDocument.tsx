import type { ReactNode } from 'react'
import LegalToc from './LegalToc'
import type { LegalSection } from './types'
import '@/src/components/Button.css'
import './legal-alpha.css'

export type LegalDoc = 'privacy' | 'terms'

const DOCS: Array<{ id: LegalDoc; label: string; href: string }> = [
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy-policy' },
  { id: 'terms', label: 'Terms of Service', href: '/terms-of-service' },
]

/**
 * The themed legal page (alpha): a Privacy / Terms switch, sticky On This Page
 * contents, and the document in one panel. Server-rendered; the legal text
 * comes from the shared section lists.
 */
export default function LegalDocument({ doc, title, updated, intro, sections }: {
  doc: LegalDoc
  title: string
  updated: string
  intro?: ReactNode
  sections: LegalSection[]
}) {
  const heading = (s: LegalSection) => s.alphaHeading ?? s.heading
  return (
    <div className="legal-alpha">
      <h1>{title}</h1>
      <p>Last Updated: {updated}</p>

      <nav className="legal-alpha-switch" aria-label="Legal documents">
        {DOCS.map(d => (
          <a
            key={d.id}
            href={d.href}
            className={`btn btn--toggle btn--sm${d.id === doc ? ' btn--active' : ''}`}
            aria-current={d.id === doc ? 'page' : undefined}
          >
            {d.label}
          </a>
        ))}
      </nav>

      <div className="legal-alpha-layout">
        <LegalToc sections={sections.map(s => ({ id: s.id, label: heading(s) }))} />
        <article className="legal-alpha-panel legal-alpha-doc">
          {intro && (
            <>
              <p className="legal-alpha-intro">{intro}</p>
              <hr className="legal-alpha-divider" />
            </>
          )}
          {sections.map(s => (
            <section key={s.id} id={s.id} className="legal-alpha-sec">
              <h2>{heading(s)}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
