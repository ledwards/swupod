// /api/formats/pack-wars/[shareId]/ai — Pack Wars vs the AI on our table (alpha).
// Contract and gating: lib/play/packWarsAi.ts.
import * as db from '@/lib/db'
import { soloSession } from '@/lib/play/soloAuth'
import { launchSoloAi } from '@/lib/play/soloAi'
import { packWarsAiHandlers } from '@/lib/play/packWarsAi'
import { packWarsNativeEnabled } from '@/src/services/entry/rollout'
import { packWarsReadiness } from '@/src/services/play/native/packWars'
import { loadSupport } from '@/src/services/play/native/savedDeck'
import { nativeConfig } from '@/src/services/play/native/runtimeClient'

const handlers = packWarsAiHandlers({
  enabled: () => packWarsNativeEnabled(),
  session: soloSession,
  launch: (...args) => launchSoloAi(...args),
  readiness: async (userId, shareId) => packWarsReadiness(db, shareId, userId, await loadSupport(nativeConfig().supportPath)),
})
export const GET = handlers.GET
export const POST = handlers.POST
