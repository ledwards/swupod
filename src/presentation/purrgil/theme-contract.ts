/** Portable table-theme contract shared with public/table-environments. */

const ROLES = ['canvas', 'surface', 'surfaceRaised', 'surfaceHover', 'text', 'textMuted', 'accent', 'accentHover', 'onAccent', 'highlight', 'border', 'focus', 'success', 'warning', 'danger', 'info'] as const;
const HEX = /^#[0-9a-f]{6}$/i;
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const retiredThemes: Record<string, string> = {
  command: 'purrgil',
  cantina: 'purrgil',
  'cloud-city': 'purrgil',
  rebel: 'purrgil',
};

export const defaultThemeId = 'purrgil';
export type ThemeRole = (typeof ROLES)[number];
export type ThemeFraming = {scaleX: number; scaleY: number; originX: number; originY: number};
export type ArtworkRect = {x:number;y:number;width:number;height:number};
export type TableLayout = {tableBounds:ArtworkRect;scenery:{image:string;width:number;height:number;tableBounds:ArtworkRect}};
export type ThemeConfig = {
  schemaVersion: 1;
  id: string;
  name: string;
  background: {image: string; width: number; height: number; sha256: string; framing: ThemeFraming;layout?:TableLayout};
  colors: Record<ThemeRole, string>;
};

function record(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validRect(value:unknown,width:number,height:number):value is ArtworkRect {
 const r=record(value);return !!r&&[r.x,r.y,r.width,r.height].every(finite)&&Number(r.x)>=0&&Number(r.y)>=0&&Number(r.width)>0&&Number(r.height)>0&&Number(r.x)+Number(r.width)<=width&&Number(r.y)+Number(r.height)<=height;
}
function parseLayout(value:unknown,width:number,height:number):TableLayout|null {
 const layout=record(value),scenery=record(layout?.scenery);
 if(!layout||!validRect(layout.tableBounds,width,height)||!scenery||typeof scenery.image!=='string'||!scenery.image.startsWith('/table-environments/')||scenery.image.includes('..')||!finite(scenery.width)||!finite(scenery.height)||!validRect(scenery.tableBounds,scenery.width,scenery.height))return null;
 return {tableBounds:layout.tableBounds,scenery:{image:scenery.image,width:scenery.width,height:scenery.height,tableBounds:scenery.tableBounds}};
}
/** Accept a theme file only when its identity, artwork path, crop and color roles are intact. */
export function parseTheme(value: unknown): ThemeConfig | null {
  const theme = record(value);
  const background = theme ? record(theme.background) : null;
  const framing = background ? record(background.framing) : null;
  const colors = theme ? record(theme.colors) : null;
  if (!theme || theme.schemaVersion !== 1 || typeof theme.id !== 'string' || !THEME_ID.test(theme.id)) return null;
  if (typeof theme.name !== 'string' || !theme.name.trim()) return null;
  if (!background || typeof background.image !== 'string' || !background.image.startsWith('/table-environments/') || background.image.includes('..')) return null;
  if (!Number.isInteger(background.width) || !Number.isInteger(background.height) || Number(background.width) < 1 || Number(background.height) < 1) return null;
  if (typeof background.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(background.sha256)) return null;
  if (!framing || !finite(framing.scaleX) || !finite(framing.scaleY) || framing.scaleX <= 0 || framing.scaleY <= 0 || framing.scaleX !== framing.scaleY || !finite(framing.originX) || !finite(framing.originY)) return null;
  if (!colors) return null;
  const parsedColors = {} as ThemeConfig['colors'];
  for (const role of ROLES) {
    const color = colors[role];
    if (typeof color !== 'string' || !HEX.test(color)) return null;
    parsedColors[role] = color.toLowerCase();
  }
  const layout=background.layout===undefined?undefined:parseLayout(background.layout,Number(background.width),Number(background.height));
  if(layout===null)return null;
  return {
    schemaVersion: 1,
    id: theme.id,
    name: theme.name,
    background: {
      ...(layout?{layout}:{}),
      image: background.image,
      width: Number(background.width),
      height: Number(background.height),
      sha256: background.sha256.toLowerCase(),
      framing: {scaleX: framing.scaleX, scaleY: framing.scaleY, originX: framing.originX, originY: framing.originY},
    },
    colors: parsedColors,
  };
}

/** Map a saved preference onto a theme id. Retired seven-table ids land on Purrgil Passage. */
export function normalizeThemeId(value: unknown): string {
  const raw = typeof value === 'string' ? retiredThemes[value] ?? value : defaultThemeId;
  return THEME_ID.test(raw) ? raw : defaultThemeId;
}

export function themeById(themes: readonly ThemeConfig[], id: string): ThemeConfig {
  return themes.find(theme => theme.id === id) ?? themes.find(theme => theme.id === defaultThemeId) ?? themes[0]!;
}

/** CSS variables consumed by table-environments.css and the play client. */
export function themeProperties(theme: ThemeConfig): Record<string, string> {
  const properties: Record<string, string> = {
    '--table-art': `url("${theme.background.image}")`,
    '--table-scale-x': String(theme.background.framing.scaleX),
    '--table-scale-y': String(theme.background.framing.scaleY),
    '--table-origin-x': `${theme.background.framing.originX}%`,
    '--table-origin-y': `${theme.background.framing.originY}%`,
    '--ink': theme.colors.text,
    '--muted': theme.colors.textMuted,
    '--mint': theme.colors.accent,
    '--gold': theme.colors.highlight,
  };
  for (const [role, color] of Object.entries(theme.colors)) {
    properties['--theme-' + role.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())] = color;
  }
  return properties;
}
