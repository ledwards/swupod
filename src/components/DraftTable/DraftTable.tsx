'use client'

import type {CSSProperties, ReactNode} from 'react'
import {themeProperties} from '../../presentation/purrgil/theme-contract'
import {useDraftTable} from './useDraftTable'
import DraftTableSetup from './DraftTableSetup'
import './DraftTable.css'

export default function DraftTable({children, setup = false}: {children: ReactNode; setup?: boolean}) {
  const {enabled, theme, chooseTheme} = useDraftTable()
  const themed = enabled && theme !== null
  return <div className={`draft-content${themed ? ' draft-table' : ''}`}
    data-table-theme={enabled ? theme?.id ?? 'default' : undefined}
    style={themed ? themeProperties(theme) as CSSProperties : undefined}>
    {themed && <div className="draft-table-scene" aria-hidden="true" />}
    {enabled && setup && <DraftTableSetup selection={{enabled, theme, chooseTheme}} />}
    {children}
  </div>
}
