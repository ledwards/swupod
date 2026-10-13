import {headers} from 'next/headers'
import {requireAlphaAccess} from '../auth'
import {betaExperienceEnabled} from '../../src/services/entry/rollout'

/** Match the existing production presentation gate, including its database check. */
export async function playWebsiteEnabled():Promise<boolean> {
 if(!betaExperienceEnabled())return false
 try {
  await requireAlphaAccess(new Request('http://ptp.internal/',{headers:await headers()}))
  return true
 } catch {return false}
}
