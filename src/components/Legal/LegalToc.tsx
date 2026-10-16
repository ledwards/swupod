'use client'

import { useEffect, useState } from 'react'
import type { LegalSection } from './types'

/** Sticky "On This Page" contents; the section in view is marked current. */
export default function LegalToc({ sections }: { sections: Array<Pick<LegalSection, 'id'> & { label: string }> }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    const targets = sections.map(s => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el))
    if (!targets.length || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setCurrent(visible[0].target.id)
    }, { rootMargin: '0px 0px -70% 0px' })
    targets.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav className="legal-alpha-panel legal-alpha-toc" aria-labelledby="legal-alpha-toc-label">
      <h2 id="legal-alpha-toc-label" className="legal-alpha-label">On This Page</h2>
      <ol>
        {sections.map(s => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={s.id === current ? 'is-current' : undefined} aria-current={s.id === current ? 'location' : undefined}>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
