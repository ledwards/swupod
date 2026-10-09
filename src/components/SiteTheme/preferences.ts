import catalog from '../../presentation/purrgil/themes.json'
import {themeById, themeProperties, normalizeThemeId, type ThemeConfig} from '../../presentation/purrgil/theme-contract'
export const preferenceKey = 'purrgil-table-v1'
export const themes = catalog as ThemeConfig[]
export function parseTheme(raw?: string | null) {
  try { return normalizeThemeId(JSON.parse(raw?.startsWith('%') ? decodeURIComponent(raw) : raw ?? '{}').theme) } catch { return 'purrgil' }
}
export function readTheme() {
  try {
    const cookie = document.cookie.split('; ').find(p => p.startsWith(preferenceKey + '='))?.slice(preferenceKey.length + 1)
    return parseTheme(cookie === undefined ? localStorage.getItem(preferenceKey) : decodeURIComponent(cookie))
  } catch { return 'purrgil' }
}
export function siteThemeProperties(id: string) {
  const theme = themeById(themes, id)
  const properties = themeProperties(theme)
  // Legacy components use these RGB channels for translucent surfaces and focus rings.
  for (const [key, color] of Object.entries({ink: theme.colors.text, 'surface-base': theme.colors.surface, 'glow-primary': theme.colors.accent, 'glow-interactive': theme.colors.highlight, 'glow-danger': theme.colors.danger})) {
    properties[`--pt-${key}-rgb`] = color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16)).join(', ')
  }
  return properties
}
