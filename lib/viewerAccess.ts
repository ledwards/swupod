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
  return hasAlphaAccess(await viewerSession())
}
