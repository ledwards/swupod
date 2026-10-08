// @ts-nocheck
// Debug logging utility for e2e tests
// Only logs when --debug flag is passed to playwright

const DEBUG = process.argv.includes('--debug')

export const debugLog = (...args: any[]): void => {
  if (DEBUG) console.log(...args)
}

export const debugError = (...args: any[]): void => {
  if (DEBUG) console.error(...args)
}

export const debugWarn = (...args: any[]): void => {
  if (DEBUG) console.warn(...args)
}

export const debugInfo = (...args: any[]): void => {
  if (DEBUG) console.info(...args)
}

// Progress indicator that always shows (even without --debug)
// Use for high-level test progress
export const testLog = (...args: any[]): void => {
  console.log(...args)
}

export const isDebugMode = (): boolean => DEBUG
