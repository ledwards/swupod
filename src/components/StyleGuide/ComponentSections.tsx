'use client'
import {useState, type ReactNode} from 'react'
import Button from '../Button'
import Modal from '../Modal'
import ContentSkeleton from '../ContentSkeleton'
import {SearchInput} from '../SearchInput'
import {useToast} from '../Toast'
import {DRIFT} from './drift'
import { KindLabel, RarityLabel } from '../CardIcons'

function Section({id, title, lede, children}: {id: string; title: string; lede: string; children: ReactNode}) {
  return (
    <section className="sg-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="sg-lede">{lede}</p>
      {children}
    </section>
  )
}

export function TypeSection() {
  return (
    <Section id="sg-type" title="Typography" lede="Barlow only. Hierarchy comes from weight and the muted ink, not size.">
      <div className="sg-panel sg-type">
        <p className="sg-type-page-title">Page Title · 800 · 1.625rem</p>
        <p className="sg-type-subtitle">Subtitle · 500 · 0.875rem · text-muted</p>
        <p className="sg-type-headline">Headline · 800 · 1.5rem</p>
        <p className="sg-type-title">Title · 700 · 1.125rem</p>
        <p className="sg-type-body">Body · 400 · 1rem. Draft against seven bots, build from what you open, and play the deck the same night. Prose caps at 65 to 75 characters a line.</p>
        <p className="sg-type-small">Body small · 400 · 0.875rem, for dialog copy and descriptions.</p>
        <p className="sg-type-label">Label · 600 · 0.875rem</p>
        <p className="sg-type-meta">Meta · 500 · 0.75rem · timestamps, counts, footer</p>
      </div>
    </Section>
  )
}

export function ButtonSection() {
  const [view, setView] = useState('grid')
  return (
    <Section id="sg-buttons" title="Buttons" lede="One accent-filled primary per view. Everything else sits on surface-raised.">
      <div className="sg-panel sg-stack">
        <div className="sg-row">
          <Button variant="primary">Start Draft</Button>
          <Button>Cancel</Button>
          <Button variant="danger"><TrashIcon/> Discard Pool</Button>
          <Button variant="interactive">Details</Button>
          <Button variant="discord">Sign In with Discord</Button>
          <Button variant="warning">Action Required</Button>
        </div>
        <div className="sg-row">
          <Button variant="primary" size="xs">Extra Small</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
        </div>
        <div className="sg-row">
          <Button variant="primary" disabled>Disabled Primary</Button>
          <Button disabled>Disabled Secondary</Button>
          <Button variant="icon" size="sm" aria-label="Close">&times;</Button>
          <Button variant="icon" aria-label="Close">&times;</Button>
          <Button variant="icon" size="lg" aria-label="Close">&times;</Button>
        </div>
        <div className="sg-row" role="group" aria-label="Deck view">
          {['grid', 'list', 'stacks'].map(option => (
            <Button key={option} variant="toggle" active={view === option} aria-pressed={view === option} onClick={() => setView(option)}>
              {option[0]!.toUpperCase() + option.slice(1)}
            </Button>
          ))}
          <span className="sg-caption">Toggle with <code>aria-pressed</code></span>
        </div>
        <div className="sg-row">
          <Button variant="toggle" active>Active</Button>
          <Button variant="toggle">Inactive</Button>
          <span className="sg-caption">The <code>active</code> prop alone sets <code>aria-pressed</code></span>
        </div>
        <div className="sg-row">
          <Button variant="primary" textOnly>Add All</Button>
          <Button variant="danger" textOnly>Remove All</Button>
          <span className="sg-caption">Text-only: no chrome, accent or danger ink</span>
        </div>
        <div className="sg-row">
          <Button glowColor="green">Glow Green</Button>
          <Button glowColor="blue">Glow Blue</Button>
          <Button glowColor="red">Glow Red</Button>
          <Button glowColor="yellow">Glow Yellow</Button>
          <span className="sg-caption">Hover: accent, highlight, danger, warning</span>
        </div>
      </div>
    </Section>
  )
}

export function InputSection() {
  const [query, setQuery] = useState('')
  return (
    <Section id="sg-inputs" title="Inputs" lede="Surface fill, border stroke, one focus ring drawn over the border. Tab through to see it.">
      <div className="sg-panel sg-form">
        <label>Pod name<input type="text" placeholder="Friday Night Pod"/></label>
        <label>Set<select defaultValue="LOF"><option value="SOR">Spark of Rebellion</option><option value="LOF">Legends of the Force</option></select></label>
        <label className="sg-form-wide">Notes<textarea rows={2} placeholder="Bots take the strongest pick"/></label>
        <div className="sg-form-wide"><span className="sg-form-label">Search</span><SearchInput value={query} onChange={setQuery} placeholder="Search cards" clearable/></div>
        <label className="sg-check"><input type="checkbox" defaultChecked/> Fill empty seats with bots</label>
        <label className="sg-check"><input type="radio" name="sg-timer" defaultChecked/> Pick timer on</label>
        <label className="sg-check"><input type="radio" name="sg-timer"/> Pick timer off</label>
      </div>
    </Section>
  )
}

export function PanelSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section id="sg-panels" title="Panels and Dialogs" lede="Opaque surfaces with equal 12px insets. Titled panels mount the label on the border.">
      <div className="sg-panels">
        <div className="sg-panel">
          <h3 className="sg-panel-title">Plain Panel</h3>
          <p className="sg-muted">Surface fill, 1px border, 12px radius. Nested emphasis steps up the ladder:</p>
          <div className="sg-raised">Surface raised</div>
        </div>
        <fieldset className="sg-panel sg-legend-panel">
          <legend>Your Drafted Leaders (2/3)</legend>
          <p className="sg-muted">The title sits on the border like a fieldset legend. No separate header row.</p>
        </fieldset>
        <div className="sg-panel">
          <h3 className="sg-panel-title">Dialog</h3>
          <p className="sg-muted">The Modal component, themed to surface.</p>
          <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        </div>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Delete Pool?" variant="danger">
        <Modal.Body><p>This removes the pool and its decks. It can't be undone.</p></Modal.Body>
        <Modal.Actions>
          <Button onClick={() => setOpen(false)}>Keep It</Button>
          <Button variant="danger" onClick={() => setOpen(false)}><TrashIcon/> Delete</Button>
        </Modal.Actions>
      </Modal>
    </Section>
  )
}

export function FeedbackSection() {
  const {showToast} = useToast()
  return (
    <Section id="sg-feedback" title="Feedback" lede="Skeletons for anything pending, never a spinner. Status uses the four status roles.">
      <div className="sg-panels">
        <div className="sg-panel"><h3 className="sg-panel-title">Skeleton Rows</h3><ContentSkeleton kind="row" count={2}/></div>
        <div className="sg-panel"><h3 className="sg-panel-title">Skeleton Text</h3><ContentSkeleton kind="text"/></div>
        <div className="sg-panel sg-stack">
          <h3 className="sg-panel-title">Status</h3>
          <div className="sg-row">
            <span className="sg-status sg-status--success">Win</span>
            <span className="sg-status sg-status--warning">Draw</span>
            <span className="sg-status sg-status--danger">Loss</span>
            <span className="sg-status sg-status--info">Bye</span>
          </div>
          <div className="sg-row">
            <Button size="sm" onClick={() => showToast({text: 'Deck saved', kind: 'success'})}>Success Toast</Button>
            <Button size="sm" onClick={() => showToast({text: 'Pool could not be loaded', kind: 'danger'})}>Danger Toast</Button>
          </div>
        </div>
      </div>
    </Section>
  )
}

const ASPECTS = ['vigilance', 'command', 'aggression', 'cunning', 'villainy', 'heroism']
const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'special']
const KINDS = ['ground', 'space', 'event', 'upgrade']

export function GameDataSection() {
  return (
    <Section id="sg-game" title="Game Data" lede="Aspect, rarity and card-kind colors never change with the theme, and always travel with their icon.">
      <div className="sg-panel sg-stack">
        <div className="sg-row">{ASPECTS.map(aspect => <span key={aspect} className="sg-token"><img src={`/icons/${aspect}.png`} alt="" width={22} height={22}/>{aspect[0]!.toUpperCase() + aspect.slice(1)}</span>)}</div>
        <div className="sg-row">{RARITIES.map(rarity => <span key={rarity} className="sg-token"><RarityLabel rarity={rarity} size={16}/></span>)}</div>
        <div className="sg-row">{KINDS.map(kind => <span key={kind} className="sg-token"><KindLabel kind={kind} size={16}/></span>)}</div>
        <p className="sg-caption">One icon per rarity and per card kind, site-wide: <code>RarityIcon</code> / <code>RarityLabel</code> and <code>KindIcon</code> / <code>KindLabel</code> from <code>src/components/CardIcons.tsx</code>.</p>
      </div>
    </Section>
  )
}

const withCode = (text: string) => text.split('`').map((part, i) => i % 2 ? <code key={i}>{part}</code> : part)

export function DriftSection() {
  return (
    <Section id="sg-drift" title="Known Issues" lede="Places where the code still breaks DESIGN.md. Each one is a planned fix.">
      {DRIFT.length ? (
        <ol className="sg-panel sg-drift-list">
          {DRIFT.map((item, index) => (
            <li key={item.title} id={`sg-drift-${index + 1}`}><strong>{item.title}.</strong> {withCode(item.detail)}</li>
          ))}
        </ol>
      ) : <p className="sg-panel sg-muted">None right now. Add an entry to <code>src/components/StyleGuide/drift.ts</code> when the code drifts from DESIGN.md.</p>}
    </Section>
  )
}

/** Same glyph as HostControls' Cancel Draft: one trash icon site-wide. */
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
)
