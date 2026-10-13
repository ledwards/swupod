'use client'
import {useEffect, useState} from 'react'
import {readTheme, siteThemeProperties} from '../SiteTheme/preferences'
import {themes} from './themeMath'
import {RoleSwatches, SurfaceLadder, ThemeGrid} from './ThemeSections'
import {ButtonSection, DriftSection, FeedbackSection, GameDataSection, InputSection, PanelSection, TypeSection} from './ComponentSections'
import './LiveStyleGuide.css'

/** Paint a theme onto <body> without saving it; the saved preference comes back on leave. */
function previewTheme(id: string) {
  document.body.dataset.siteTheme = id
  Object.entries(siteThemeProperties(id)).forEach(([key, value]) => document.body.style.setProperty(key, value))
}

export default function LiveStyleGuide() {
  const [themeId, setThemeId] = useState('purrgil')
  const [themed, setThemed] = useState(true)

  useEffect(() => {
    setThemed(!!document.body.dataset.siteTheme)
    setThemeId(readTheme())
    // Leaving the page hands the body back to SiteTheme, which re-reads the saved choice.
    return () => { window.dispatchEvent(new Event('purrgil-preferences')) }
  }, [])

  const choose = (id: string) => {
    setThemeId(id)
    if (themed) previewTheme(id)
  }
  const name = themes.find(theme => theme.id === themeId)?.name ?? themeId

  return (
    <main className="sg-page">
      <h1>Style Guide</h1>
      <p>Real components, rendered under every site theme</p>

      {!themed && <p className="sg-note" role="status">The site theme is off for this session, so you are seeing the legacy palette. Set PTP_SITE_THEME_ENABLED to preview themes.</p>}

      <div className="sg-themebar">
        <label className="sg-themebar-picker">
          <span>Previewing</span>
          <select value={themeId} onChange={event => choose(event.target.value)}>
            {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </select>
        </label>
        <p className="sg-themebar-hint">Previews are not saved. Your chosen table comes back when you leave. The source of truth is <code>DESIGN.md</code>; usage notes live in <code>docs/STYLE_GUIDE.md</code>.</p>
      </div>

      <section className="sg-section" aria-labelledby="sg-roles">
        <h2 id="sg-roles">Theme Roles: {name}</h2>
        <p className="sg-lede">Sixteen roles, filled by every theme. UI CSS names a role, never a color.</p>
        <RoleSwatches themeId={themeId}/>
      </section>

      <section className="sg-section" aria-labelledby="sg-ladder">
        <h2 id="sg-ladder">Surface Ladder</h2>
        <p className="sg-lede">Depth is tone, not shadow. Each step sits a fixed amount above the canvas.</p>
        <SurfaceLadder/>
      </section>

      <section className="sg-section" aria-labelledby="sg-all">
        <h2 id="sg-all">Every Theme ({themes.length})</h2>
        <p className="sg-lede">The same panel in all {themes.length} themes. Select one to preview the whole page in it.</p>
        <ThemeGrid current={themeId} onChoose={choose}/>
      </section>

      <TypeSection/>
      <ButtonSection/>
      <InputSection/>
      <PanelSection/>
      <FeedbackSection/>
      <GameDataSection/>
      <DriftSection/>
    </main>
  )
}
