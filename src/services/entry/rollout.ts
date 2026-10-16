/** Server-owned switches. The entire beta experience is off unless explicitly enabled. */
export function betaExperienceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PTP_BETA_EXPERIENCE_ENABLED === 'true'
}
export function soloAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return betaExperienceEnabled(env) && env.PTP_NATIVE_PLAY_ENABLED === 'true' && env.PTP_SOLO_AI_ENABLED === 'true'
}
/** Pack Wars vs the AI on our table (Workstream C1). Rides on the solo AI switches. */
export function packWarsNativeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return soloAiEnabled(env) && env.PTP_PACK_WARS_NATIVE_ENABLED === 'true'
}
