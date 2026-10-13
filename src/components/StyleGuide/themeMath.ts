import {themes} from '../SiteTheme/preferences'
import {themeById, type ThemeRole} from '../../presentation/purrgil/theme-contract'

/** The sixteen roles in the order DESIGN.md presents them, with the pairing each is judged against. */
export const ROLE_ROWS: Array<{role: ThemeRole; use: string; on?: ThemeRole; min?: number}> = [
  {role: 'canvas', use: 'Page color where the table art fades'},
  {role: 'surface', use: 'Panels, dialogs, inputs'},
  {role: 'surfaceRaised', use: 'Secondary buttons, nested emphasis'},
  {role: 'surfaceHover', use: 'Hover on raised surfaces'},
  {role: 'text', use: 'Headings and body', on: 'surface', min: 4.5},
  {role: 'textMuted', use: 'Subtitles, metadata, placeholders', on: 'surfaceRaised', min: 4.5},
  {role: 'accent', use: 'The one primary action; selected state', on: 'surface', min: 4.5},
  {role: 'accentHover', use: 'Primary fill on hover', on: 'surface', min: 4.5},
  {role: 'onAccent', use: 'Ink on an accent fill', on: 'accent', min: 4.5},
  {role: 'highlight', use: 'Second hue: info emphasis', on: 'surface', min: 4.5},
  {role: 'border', use: '1px strokes', on: 'surface', min: 3},
  {role: 'focus', use: 'Keyboard focus ring', on: 'canvas', min: 3},
  {role: 'success', use: 'Wins, done, go', on: 'surface', min: 4.5},
  {role: 'warning', use: 'Draws, paused, caution', on: 'surface', min: 4.5},
  {role: 'danger', use: 'Destructive, losses, errors', on: 'surfaceRaised', min: 4.5},
  {role: 'info', use: 'Neutral notices', on: 'surface', min: 4.5},
]

export const cssVar = (role: string) => '--theme-' + role.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

export const themeColors = (id: string) => themeById(themes, id).colors
export {themes}
