import {playWebsiteEnabled} from './play/websitePresentation'
import { headers } from 'next/headers'
import { getSessionFromCookieHeader, type Session } from './auth'

/** The signed-in viewer of the current server render, or null. */
export async function viewerSession(): Promise<Session | null> {
  return getSessionFromCookieHeader((await headers()).get('cookie'))
}

/** Alpha surfaces are for alpha testers and admins only; beta and regular users keep the current site. */
export const hasAlphaAccess = (session: Session | null): boolean =>
  !!session && (session.is_alpha_tester === true || session.is_admin === true)

export async function viewerHasAlphaAccess(): Promise<boolean> {
  // Local alpha previews show the new UI even before signing in. API access
  // still uses the normal session and entitlement checks. Never applies in production.
  if (process.env.NODE_ENV === 'development' && process.env.PTP_LOCAL_ALPHA_PREVIEW === 'true') return true
  return playWebsiteEnabled()
}
