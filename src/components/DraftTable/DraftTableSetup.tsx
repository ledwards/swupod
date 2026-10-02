'use client'

import {useState, type CSSProperties} from 'react'
import Button from '../Button'
import Modal from '../Modal'
import {themeProperties} from '../../presentation/purrgil/theme-contract'
import {themes, useDraftTable} from './useDraftTable'
import './DraftTable.css'

type Selection = ReturnType<typeof useDraftTable>

function TableChoice({selection}: {selection: Selection}) {
  const [open, setOpen] = useState(false)
  const [focusId, setFocusId] = useState(selection.theme?.id ?? 'default')
  if (!selection.enabled) return null
  const {theme, chooseTheme} = selection
  const focused = themes.find(item => item.id === focusId)
  const choices = [{id: 'default', name: 'Default'}, ...themes]
  return <>
    <Button variant="icon" className="draft-theme-button" aria-label="Themes" title="Themes" aria-haspopup="dialog" onClick={() => { setFocusId(theme?.id ?? 'default'); setOpen(true) }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/><circle cx="7.5" cy="14.5" r=".9"/></svg>
    </Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Themes" showCloseButton variant="wide" className="draft-theme-modal">
      <Modal.Body>
        <div className="draft-theme-catalog">
          <div className="draft-theme-list" aria-label="Table themes">
            {choices.map(option => {
              const artwork = themes.find(item => item.id === option.id)
              return <Button key={option.id} variant="toggle" active={focusId === option.id} aria-pressed={focusId === option.id} onClick={() => setFocusId(option.id)}>
                {artwork ? <img src={artwork.background.image} alt="" loading="lazy" /> : <span className="draft-theme-default-art">Default</span>}
                <span>{option.name}</span>
                {(theme?.id ?? 'default') === option.id && <small>In use</small>}
              </Button>
            })}
          </div>
          <article className="draft-theme-detail" style={focused ? themeProperties(focused) as CSSProperties : undefined}>
            {focused ? <img className="draft-theme-stage" src={focused.background.image} alt={`${focused.name} table preview`} /> : <div className="draft-theme-default-art draft-theme-stage">Default table</div>}
            <div className="draft-theme-sample">
              <h3>{focused?.name ?? 'Default'}</h3>
              <p>Appearance preview</p>
              {focused && <div className="draft-theme-swatches" aria-label="Theme colors">{['surface', 'text', 'accent', 'highlight', 'success', 'danger'].map(role => <span key={role} style={{background: focused.colors[role as keyof typeof focused.colors]}} />)}</div>}
              <Button variant="primary" disabled={(theme?.id ?? 'default') === focusId} onClick={() => chooseTheme(focusId)}>{(theme?.id ?? 'default') === focusId ? 'In use on your table' : 'Use this table'}</Button>
            </div>
          </article>
        </div>
      </Modal.Body>
    </Modal>
  </>
}

function SavedTableChoice() {
  const selection = useDraftTable()
  return <TableChoice selection={selection} />
}

export default function DraftTableSetup({selection}: {selection?: Selection}) {
  return selection ? <TableChoice selection={selection} /> : <SavedTableChoice />
}
