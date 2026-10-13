import {defaultThemeId, parseTheme, type ThemeConfig} from './theme-contract';

type ManifestEntry = {id: string; name: string; image: string; config: string};
type Manifest = {themes?: ManifestEntry[]};

let pending: Promise<ThemeConfig[]> | undefined;

/** Load the checked-in table-environments package from the app origin. */
export function loadTableThemes(): Promise<ThemeConfig[]> {
  pending ??= fetch('/table-environments/manifest.json').then(async response => {
    if (!response.ok) throw new Error('Table themes are unavailable');
    const manifest = await response.json() as Manifest;
    if (!Array.isArray(manifest.themes) || !manifest.themes.length) throw new Error('Table theme manifest is empty');
    const themes = await Promise.all(manifest.themes.map(async entry => {
      if (typeof entry.config !== 'string' || !entry.config.startsWith('themes/') || entry.config.includes('..')) throw new Error(`Invalid theme config path for ${entry.id}`);
      const config = await fetch(`/table-environments/${entry.config}`);
      if (!config.ok) throw new Error(`Missing table theme: ${entry.id}`);
      const theme = parseTheme(await config.json());
      if (!theme || theme.id !== entry.id || theme.name !== entry.name || theme.background.image !== `/table-environments/${entry.image}`) {
        throw new Error(`Table theme ${entry.id} does not match the manifest`);
      }
      return theme;
    }));
    if (!themes.some(theme => theme.id === defaultThemeId)) throw new Error('Purrgil Passage theme is missing');
    return themes.sort((a,b)=>Number(b.id==='ffg')-Number(a.id==='ffg')||Number(b.id===defaultThemeId)-Number(a.id===defaultThemeId));
  });
  return pending;
}
