// @ts-nocheck
/**
 * Aspect and rarity color utilities
 */

import type { Aspect, Rarity } from '../types';

// === COLOR MAPPINGS ===

/** Global aspect color mappings (SWU standard colors) */
export const ASPECT_COLORS: Record<Aspect, string> = {
  'Vigilance': '#4A90E2',    // Blue
  'Command': '#27AE60',      // Green
  'Aggression': '#E74C3C',   // Red
  'Cunning': '#F1C40F',      // Yellow
  'Villainy': '#1a1a1a',     // Black
  'Heroism': '#f0f0f0'       // White
};

/** Default color for cards with no aspects */
export const NO_ASPECT_COLOR = '#888888';  // Grey

/** Rarity color mappings */
export const RARITY_COLORS: Record<string, string> = {
  'Common': '#999',
  'Uncommon': '#4CAF50',
  'Rare': '#2196F3',
  'Legendary': '#FF9800',
  'Special': '#9C27B0',
};

// === COLOR UTILITIES ===

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts hex color to RGB
 */
function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  const r = result[1];
  const g = result[2];
  const b = result[3];
  if (!r || !g || !b) return null;
  return {
    r: parseInt(r, 16),
    g: parseInt(g, 16),
    b: parseInt(b, 16)
  };
}

/**
 * Converts RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

/**
 * Lightens a color by a percentage (0-1)
 */
function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * percent));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * percent));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * percent));

  return rgbToHex(r, g, b);
}

/**
 * Darkens a color by a percentage (0-1)
 */
function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.max(0, Math.round(rgb.r * (1 - percent)));
  const g = Math.max(0, Math.round(rgb.g * (1 - percent)));
  const b = Math.max(0, Math.round(rgb.b * (1 - percent)));

  return rgbToHex(r, g, b);
}

// === CARD COLOR FUNCTIONS ===

/** Card-like object with aspects */
interface CardWithAspects {
  aspects?: Aspect[] | null;
}

/**
 * Gets the color for a card based on its aspects
 * - Single aspect: returns the base color
 * - Aspect + Heroism: returns a lighter version (whiteness factor)
 * - Aspect + Villainy: returns a darker version (blackness factor)
 * - Multiple aspects (no Heroism/Villainy): returns the first aspect color
 */
export function getAspectColor(card: CardWithAspects | null | undefined): string {
  if (!card?.aspects || card.aspects.length === 0) {
    return NO_ASPECT_COLOR;
  }

  const aspects = card.aspects;
  const hasHeroism = aspects.includes('Heroism');
  const hasVillainy = aspects.includes('Villainy');

  // Find the primary aspect (first non-Heroism/Villainy aspect, or first if only Heroism/Villainy)
  const primaryAspect = aspects.find(a => a !== 'Heroism' && a !== 'Villainy') ?? aspects[0];
  if (!primaryAspect) return NO_ASPECT_COLOR;
  const baseColor = ASPECT_COLORS[primaryAspect] || 'white';

  // If only Heroism or Villainy, return their color
  if (aspects.length === 1) {
    return baseColor;
  }

  // Apply darkening/lightening for combinations
  if (hasVillainy && !hasHeroism) {
    // Villainy combination: darken by 25%
    return darkenColor(baseColor, 0.25);
  } else if (hasHeroism && !hasVillainy) {
    // Heroism combination: lighten by 20%
    return lightenColor(baseColor, 0.20);
  } else if (hasHeroism && hasVillainy) {
    // Both Heroism and Villainy: slight darken (10%) since Villainy takes precedence
    return darkenColor(baseColor, 0.10);
  }

  // Multiple aspects but no Heroism/Villainy: return first aspect color
  return baseColor;
}

/**
 * Gets the base color for a single aspect
 */
export function getSingleAspectColor(aspect: Aspect): string {
  return ASPECT_COLORS[aspect] || NO_ASPECT_COLOR;
}

/** Color aspects only (not alignment aspects) */
const COLOR_ASPECTS: Aspect[] = ['Vigilance', 'Command', 'Aggression', 'Cunning'];

/**
 * Gets all color aspect hex values for a card.
 * Returns array of hex colors for the card's color aspects.
 * Used for multicolor gradient rendering in charts.
 */
export function getAspectColors(card: CardWithAspects | null | undefined): string[] {
  if (!card?.aspects || card.aspects.length === 0) return [NO_ASPECT_COLOR];
  const colors = card.aspects
    .filter(a => COLOR_ASPECTS.includes(a as Aspect))
    .map(a => ASPECT_COLORS[a] || NO_ASPECT_COLOR);
  if (colors.length === 0) {
    // Only alignment aspects (Heroism/Villainy) or unknown
    return [getAspectColor(card)];
  }
  return colors;
}

/**
 * Gets the display color for a card's rarity
 */
export function getRarityColor(rarity: Rarity | string): string {
  return RARITY_COLORS[rarity] || '#666';
}
