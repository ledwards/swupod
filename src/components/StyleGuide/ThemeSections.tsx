'use client'
import type {CSSProperties} from 'react'
import Button from '../Button'
import {siteThemeProperties} from '../SiteTheme/preferences'
import {ROLE_ROWS, contrast, cssVar, themeColors, themes} from './themeMath'

export function RoleSwatches({themeId}: {themeId: string}) {
  const colors = themeColors(themeId)
  return (
    <ul className="sg-roles">
      {ROLE_ROWS.map(({role, use, on, min}) => {
        const ratio = on ? contrast(colors[role], colors[on]) : null
        return (
          <li key={role} className="sg-role">
            <span className="sg-role-chip" style={{background: `var(${cssVar(role)})`}} aria-hidden="true"/>
            <span className="sg-role-copy">
              <strong>{role}</strong>
              <code>{cssVar(role)}</code>
              <span>{use}</span>
            </span>
            <span className="sg-role-meta">
              <code>{colors[role]}</code>
              {ratio !== null && <span className={ratio >= min! ? 'sg-pass' : 'sg-fail'}>{ratio.toFixed(1)}:1 on {on}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function SurfaceLadder() {
  const steps: Array<[string, string]> = [['canvas', 'Canvas'], ['surface', 'Surface'], ['surfaceRaised', 'Surface raised'], ['surfaceHover', 'Surface hover']]
  return (
    <div className="sg-ladder">
      {steps.map(([role, label]) => (
        <div key={role} className="sg-ladder-step" style={{background: `var(${cssVar(role)})`}}>
          <strong>{label}</strong>
          <code>{cssVar(role)}</code>
        </div>
      ))}
    </div>
  )
}

/** Each tile carries its own theme's variables, so the page's real button CSS resolves against that theme. */
export function ThemeGrid({current, onChoose}: {current: string; onChoose: (id: string) => void}) {
  return (
    <ul className="sg-theme-grid">
      {themes.map(theme => (
        <li key={theme.id}>
          <div className="sg-theme-tile" style={siteThemeProperties(theme.id) as CSSProperties} data-current={theme.id === current || undefined}>
            <div className="sg-theme-art" aria-hidden="true"/>
            <div className="sg-theme-body">
              <strong>{theme.name}</strong>
              <span>Pack 1 Pick 4</span>
              <div className="sg-theme-actions">
                <Button variant="primary" size="sm" aria-label={`Preview ${theme.name}`} onClick={() => onChoose(theme.id)}>
                  {theme.id === current ? 'Previewing' : 'Preview'}
                </Button>
                <span className="sg-theme-dots" aria-hidden="true">
                  <i style={{background: 'var(--theme-highlight)'}}/><i style={{background: 'var(--theme-success)'}}/><i style={{background: 'var(--theme-danger)'}}/>
                </span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
