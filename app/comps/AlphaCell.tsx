'use client'

import { useAuth } from '../../src/contexts/AuthContext'
import { hasAlphaAccess } from '../../src/services/entry/access'

/** Alpha testers already have AI play; everyone else gets a wink until it ships. */
export default function AlphaCell({ check }: { check: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: { is_admin?: boolean, is_alpha_tester?: boolean } | null, loading: boolean }
  if (loading) return <span className="comps-alpha-pending" aria-busy="true" aria-label="Checking access" />
  if (hasAlphaAccess(user)) return <>{check}</>
  return <span className="comps-wink" role="img" aria-label="Coming soon">😉</span>
}
