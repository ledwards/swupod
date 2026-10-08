export type RuntimeAvailabilityStatus = 'available' | 'disabled' | 'missing_config'
export type RuntimeUnavailableCode = Exclude<RuntimeAvailabilityStatus, 'available'>

export type RuntimeAvailabilityEnv = Partial<Record<string, string | undefined>>

export interface RuntimeAvailability {
  launchAllowed: boolean
  status: RuntimeAvailabilityStatus
  reason: string | null
  runtimeBaseUrl: string | null
  launchUrl: string | null
}

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

export class RuntimeUnavailableError extends Error {
  code: RuntimeUnavailableCode
  availability: RuntimeAvailability

  constructor(availability: RuntimeAvailability) {
    super(availability.reason ?? `Runtime launch is ${availability.status}`)
    this.name = 'RuntimeUnavailableError'
    this.code = availability.status === 'available' ? 'disabled' : availability.status
    this.availability = availability
  }
}

export function getRuntimeAvailability(env: RuntimeAvailabilityEnv = process.env): RuntimeAvailability {
  const enabledValue = normalizeEnvValue(env.PTP_PLAY_RUNTIME_ENABLED)
  const runtimeBaseUrl = normalizeUrl(env.FORCETEKI_RUNTIME_BASE_URL)
  const launchUrl = normalizeUrl(env.FORCETEKI_LAUNCH_URL)

  if (!ENABLED_VALUES.has(enabledValue)) {
    return {
      launchAllowed: false,
      status: 'disabled',
      reason: 'PTP_PLAY_RUNTIME_ENABLED is not enabled',
      runtimeBaseUrl,
      launchUrl,
    }
  }

  const missing: string[] = []
  if (!runtimeBaseUrl) missing.push('FORCETEKI_RUNTIME_BASE_URL')
  if (!launchUrl) missing.push('FORCETEKI_LAUNCH_URL')

  if (missing.length > 0) {
    return {
      launchAllowed: false,
      status: 'missing_config',
      reason: `Missing runtime config: ${missing.join(', ')}`,
      runtimeBaseUrl,
      launchUrl,
    }
  }

  return {
    launchAllowed: true,
    status: 'available',
    reason: null,
    runtimeBaseUrl,
    launchUrl,
  }
}

export function isRuntimeLaunchAvailable(
  envOrAvailability: RuntimeAvailabilityEnv | RuntimeAvailability = process.env
): boolean {
  const availability = toRuntimeAvailability(envOrAvailability)
  return availability.launchAllowed
}

export function assertRuntimeLaunchAvailable(
  envOrAvailability: RuntimeAvailabilityEnv | RuntimeAvailability = process.env
): RuntimeAvailability {
  const availability = toRuntimeAvailability(envOrAvailability)
  if (!availability.launchAllowed) {
    throw new RuntimeUnavailableError(availability)
  }

  return availability
}

function toRuntimeAvailability(envOrAvailability: RuntimeAvailabilityEnv | RuntimeAvailability): RuntimeAvailability {
  if (isRuntimeAvailability(envOrAvailability)) {
    return envOrAvailability
  }

  return getRuntimeAvailability(envOrAvailability)
}

function isRuntimeAvailability(value: RuntimeAvailabilityEnv | RuntimeAvailability): value is RuntimeAvailability {
  const maybeAvailability = value as RuntimeAvailability
  return typeof maybeAvailability.launchAllowed === 'boolean' && typeof maybeAvailability.status === 'string'
}

function normalizeEnvValue(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : null
}
