import catalog from './playmats.json' with {type:'json'};

export type Playmat = {
  /** Reviewed catalog classification; unlocks come only from the host loadout. */
  trophy?: boolean;
  id: string; name: string; category: string; collection: string;
  image: string; source: string; original: string;
  frame?: {x: number; y: number; width: number; height: number};
  width?: number; height?: number; announced?: boolean;
  corners?: number[][];
  aspectRatio?: number;
};
export const playmats: readonly Playmat[] = catalog;
const byId = new Map(playmats.map(mat => [mat.id, mat]));
export const normalizePlaymatId = (value: unknown): string => typeof value === 'string' && byId.has(value) ? value : 'none';
export const playmatById = (id: string) => byId.get(id);
export const playmatCategories: Record<string, string> = {
  retail: 'Gamegenic', event: 'Event exclusive', regional: 'Regional Championship',
  sector: 'Sector Qualifier', planetary: 'Planetary Qualifier', galactic: 'Galactic Championship', judge: 'Judge',
};

/** Event artwork must be authorized by the host, never by local customization preferences. */
export const requiresEventAccess = (mat: Playmat) => mat.category !== 'retail';
