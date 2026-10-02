'use client'

import {useId, type CSSProperties} from 'react'
import {themeProperties} from '../../presentation/purrgil/theme-contract'
import {themes, useDraftTable} from './useDraftTable'
import './DraftTable.css'

type Selection = ReturnType<typeof useDraftTable>

function TableChoice({selection}: {selection: Selection}) {
  const id = useId()
  if (!selection.enabled) return null
  const {theme, chooseTheme} = selection
  return <div className="draft-table-setup" style={theme ? themeProperties(theme) as CSSProperties : undefined}>
    <span className={`draft-table-preview${theme ? '' : ' draft-table-preview-default'}`} aria-hidden="true" />
    <div className="draft-table-choice">
      <label htmlFor={id}>Your draft table</label>
      <select id={id} value={theme?.id ?? 'default'} onChange={event => chooseTheme(event.target.value)}>
        <option value="default">Default</option>
        {themes.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </div>
  </div>
}

function SavedTableChoice() {
  const selection = useDraftTable()
  return <TableChoice selection={selection} />
}

export default function DraftTableSetup({selection}: {selection?: Selection}) {
  return selection ? <TableChoice selection={selection} /> : <SavedTableChoice />
}
