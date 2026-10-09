'use client'

import {useEffect, type CSSProperties, type ReactNode} from 'react'
import {themeProperties} from '../../presentation/purrgil/theme-contract'
import {useDraftTable} from './useDraftTable'
import DraftTableSetup from './DraftTableSetup'
import DraftScene from './DraftScene'
import {useSiteTheme} from '../SiteTheme'
import './DraftTable.css'

export default function DraftTable({children, setup = false}: {children: ReactNode; setup?: boolean}) {
  const siteTheme = useSiteTheme()
  const {enabled, theme, chooseTheme} = useDraftTable()
  const themed = enabled && theme !== null
  // Dialogs are portalled to body, outside the table's inheritance boundary.
  useEffect(() => {
    if (!enabled || !theme) return
    const body = document.body
    const previousTheme = body.getAttribute('data-draft-theme')
    const properties = Object.entries(siteTheme ? {} : themeProperties(theme)).filter(([name]) => name.startsWith('--theme-'))
    const previous = properties.map(([name]) => [name, body.style.getPropertyValue(name)] as const)
    properties.forEach(([name, value]) => body.style.setProperty(name, value))
    body.setAttribute('data-draft-theme', theme.id)
    return () => {
      previous.forEach(([name, value]) => value ? body.style.setProperty(name, value) : body.style.removeProperty(name))
      if (previousTheme === null) body.removeAttribute('data-draft-theme')
      else body.setAttribute('data-draft-theme', previousTheme)
    }
  }, [enabled, theme, siteTheme])
  return <div className={`draft-content${themed ? ' draft-table' : ''}`}
    data-table-theme={enabled ? theme?.id ?? 'default' : undefined}
    style={themed ? themeProperties(theme) as CSSProperties : undefined}>
    {themed && <DraftScene theme={theme} />}
    {enabled && setup && <DraftTableSetup selection={{enabled, theme, chooseTheme}} />}
    {children}
  </div>
}
