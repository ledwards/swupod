/**
 * Human-readable display names and descriptions for bot strategies and mixins.
 * Used in Discord notifications and UI.
 */

export const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  topPlayer: 'Top Player',
  tournamentPlayer: 'Tournament Player',
  allPlayer: 'All Player',
  nemesis: 'Nemesis',
  diversity: 'Diversity',
  primaryColorCorner: 'Primary Color Corner',
  secondaryAspectCorner: 'Secondary Aspect Corner',
}

export const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  topPlayer: 'Drafts like the best players, using pick data filtered to top performers.',
  tournamentPlayer: 'Drafts like tournament competitors, mimicking competitive meta picks.',
  allPlayer: 'Drafts by community consensus, following overall popularity data.',
  nemesis: 'Counter-drafts the human player by predicting and blocking their picks.',
  diversity: 'Maximizes aspect diversity, stays flexible longer, then commits to the best color pair.',
  primaryColorCorner: 'Locks a primary color early and aggressively drafts all cards matching it.',
  secondaryAspectCorner: 'Locks hero/villain alignment early and corners that alignment.',
}

export const MIXIN_DISPLAY_NAMES: Record<string, string> = {
  highOptionality: 'High Optionality',
  highConviction: 'High Conviction',
  highGroupthink: 'High Groupthink',
}

export const MIXIN_DESCRIPTIONS: Record<string, string> = {
  highOptionality: 'Stays flexible longer before committing.',
  highConviction: 'Commits early with strong synergy focus.',
  highGroupthink: 'Heavily weights card popularity at all phases.',
}
