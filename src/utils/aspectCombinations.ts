// @ts-nocheck
/**
 * Aspect Combination Utilities
 *
 * Functions for working with card aspect combinations (grouping keys, display names, icons).
 */

import type { Aspect } from '../types';

// === INTERFACES ===

/** Card-like object with aspects */
interface CardWithAspects {
  aspects?: Aspect[] | null;
}

/** Primary aspects (non-alignment) */
const PRIMARY_ASPECTS: readonly Aspect[] = ['Vigilance', 'Command', 'Aggression', 'Cunning'];

/** Display name mapping for aspect keys */
const DISPLAY_NAMES: Record<string, string> = {
  'vigilance': 'Vigilance',
  'command': 'Command',
  'aggression': 'Aggression',
  'cunning': 'Cunning',
  'villainy': 'Villainy',
  'heroism': 'Heroism',
  'neutral': 'Neutral'
};

/** Sort priority mapping for aspects */
const ASPECT_PRIORITY: Record<Aspect, string> = {
  'Vigilance': 'A_Vigilance',      // Blue
  'Command': 'B_Command',          // Green
  'Aggression': 'C_Aggression',    // Red
  'Cunning': 'D_Cunning',          // Yellow
  'Villainy': 'E_Villainy',
  'Heroism': 'F_Heroism'
};

// === FUNCTIONS ===

/**
 * Get aspect combination grouping key for a card.
 * Used for grouping cards by aspect combination in list view.
 */
export function getAspectCombinationKey(card: CardWithAspects): string {
  const aspects = card.aspects || [];
  if (aspects.length === 0) return 'neutral';

  const hasVillainy = aspects.includes('Villainy');
  const hasHeroism = aspects.includes('Heroism');
  const primaryAspect = aspects.find(a => PRIMARY_ASPECTS.includes(a));

  // Single aspect
  if (aspects.length === 1) {
    const aspect = aspects[0];
    if (!aspect) return 'neutral';
    // Single primary aspect (includes double primary like Vig Vig)
    if (PRIMARY_ASPECTS.includes(aspect)) {
      return aspect.toLowerCase(); // e.g., "vigilance", "command"
    }
    if (aspect === 'Villainy') return 'villainy';
    if (aspect === 'Heroism') return 'heroism';
    return 'neutral';
  }

  // Two aspects
  if (aspects.length === 2) {
    if (primaryAspect) {
      // Check if it's double primary (e.g., Vigilance Vigilance)
      const primaryCount = aspects.filter(a => a === primaryAspect).length;
      if (primaryCount === 2) {
        // Double primary - separate key (e.g., "command_command")
        return `${primaryAspect.toLowerCase()}_${primaryAspect.toLowerCase()}`;
      }
      if (hasVillainy) {
        return `${primaryAspect.toLowerCase()}_villainy`; // e.g., "vigilance_villainy"
      }
      if (hasHeroism) {
        return `${primaryAspect.toLowerCase()}_heroism`; // e.g., "vigilance_heroism"
      }
    } else {
      // Villainy + Heroism
      return 'villainy_heroism';
    }
  }

  // More than 2 aspects - use first primary aspect
  if (primaryAspect) {
    const sortedAspects = [...aspects].sort();
    return sortedAspects.join('_').toLowerCase();
  }

  return 'neutral';
}

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get display name for an aspect combination key.
 * Converts keys like "vigilance_villainy" to "Vigilance Villainy".
 */
export function getAspectCombinationDisplayName(key: string): string {
  const parts = key.split('_');
  const first = parts[0] ?? '';
  const second = parts[1];

  if (parts.length === 1) {
    // Single aspect
    return DISPLAY_NAMES[first] ?? capitalize(first);
  } else if (parts.length === 2 && second) {
    // Two aspects
    const firstDisplay = DISPLAY_NAMES[first] ?? capitalize(first);
    const secondDisplay = DISPLAY_NAMES[second] ?? capitalize(second);
    return `${firstDisplay} ${secondDisplay}`;
  }
  // More than 2 aspects - capitalize each part
  return parts.map(capitalize).join(' ');
}

/**
 * Get aspect key for sorting (legacy, used for 'aspect' sort option).
 * Returns a sortable key like "A_Vigilance" or "B_Command".
 */
export function getAspectKey(card: CardWithAspects): string {
  const aspects = card.aspects || [];
  if (aspects.length === 0) return 'ZZZ_Neutral';

  // Single aspects - sort by priority (alphabetical of colors: Blue, Green, Red, Yellow)
  if (aspects.length === 1) {
    const aspect = aspects[0];
    if (!aspect) return 'ZZZ_Neutral';
    return ASPECT_PRIORITY[aspect] ?? `G_${aspect}`;
  }

  // Two aspects - return sorted combination with prefix
  const sortedAspects = [...aspects].sort();
  return `H_${sortedAspects.join(' ')}`;
}
