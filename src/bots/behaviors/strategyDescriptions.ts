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
  topPlayer: 'Uses historical pick data from top-performing drafters to value cards.',
  tournamentPlayer: 'Uses historical pick data from tournament-winning drafters to value cards.',
  allPlayer: 'Uses historical pick data from all drafters, weighting by overall popularity.',
  nemesis: 'Counter-drafts the human player by predicting and blocking their likely picks based on historical patterns.',
  diversity: 'Maximizes aspect diversity using historical data, stays flexible longer, then commits to the best color pair.',
  primaryColorCorner: 'Locks a primary color early and aggressively drafts cards matching it, guided by historical pick rates.',
  secondaryAspectCorner: 'Locks hero/villain alignment early and corners that alignment, guided by historical pick rates.',
}

export const MIXIN_DISPLAY_NAMES: Record<string, string> = {
  highOptionality: 'High Optionality',
  highConviction: 'High Conviction',
  highGroupthink: 'High Groupthink',
}

export const MIXIN_DESCRIPTIONS: Record<string, string> = {
  highOptionality: 'Delays color commitment, keeping options open longer based on historical flexibility patterns.',
  highConviction: 'Commits to colors early with strong synergy focus based on historical win-rate data.',
  highGroupthink: 'Heavily weights historical pick popularity data across all drafters at every phase.',
}
