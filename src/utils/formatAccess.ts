/**
 * Format Access Control Utilities
 *
 * Defines which game formats require beta access.
 * Used by app/formats/page.tsx to control format availability.
 */

export type FormatAccess = 'open' | 'beta' | 'coming-soon'

export interface FormatAccessRule {
  id: string
  access: FormatAccess
}

/**
 * Format access rules for Other Formats page
 *
 * - 'open': Available to all users
 * - 'beta': Requires beta tester or admin access
 * - 'coming-soon': Not yet available to anyone
 */
export const FORMAT_ACCESS_RULES: Record<string, FormatAccess> = {
  'chaos-draft': 'open',
  'chaos-sealed': 'open',
  'pack-wars': 'open',      // Fixed: was 'beta', should be 'open'
  'pack-blitz': 'open',     // Fixed: was 'beta', should be 'open'
  'rotisserie': 'coming-soon',
}

/**
 * Check if a user has access to a specific format
 */
export function hasFormatAccess(
  formatId: string,
  user: { is_beta_tester?: boolean; is_admin?: boolean } | null
): boolean {
  const access = FORMAT_ACCESS_RULES[formatId]

  if (!access || access === 'coming-soon') {
    return false
  }

  if (access === 'open') {
    return true
  }

  if (access === 'beta') {
    return !!(user?.is_beta_tester || user?.is_admin)
  }

  return false
}

/**
 * Get the badge text for a format based on its access level
 */
export function getFormatBadge(formatId: string): string | null {
  const access = FORMAT_ACCESS_RULES[formatId]

  if (access === 'beta') {
    return 'BETA'
  }

  if (access === 'coming-soon') {
    return 'COMING SOON'
  }

  return null
}
