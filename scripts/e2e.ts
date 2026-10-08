#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * E2E Test Runner
 *
 * A friendlier interface for running Playwright E2E tests with pattern matching.
 *
 * Usage:
 *   npx tsx scripts/e2e.ts <pattern>              # Exact match (default)
 *   npx tsx scripts/e2e.ts -f <pattern>           # Fuzzy/grep match
 *   npx tsx scripts/e2e.ts --fuzzy <pattern>      # Fuzzy/grep match
 *   npx tsx scripts/e2e.ts                        # Run all tests
 *   npx tsx scripts/e2e.ts --list                 # List available tests
 *
 * Additional flags are passed through to Playwright:
 *   npx tsx scripts/e2e.ts "Drop from Draft" --headed    # Run with browser visible
 *   npx tsx scripts/e2e.ts -f drop --debug               # Run in debug mode
 *   npx tsx scripts/e2e.ts -f drop --ui                  # Run with Playwright UI
 *
 * Examples:
 *   npm run e2e "Drop from Draft"       # Exact match
 *   npm run e2e -f drop                 # Fuzzy: matches "Drop from Draft", "drop-from-draft", etc.
 *   npm run e2e -f sealed               # Fuzzy: matches any test with "sealed" in name
 *   npm run e2e -- --headed             # Run all tests with browser visible
 */

import { spawn } from 'child_process'
import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
}

function log(msg: string, color: string = ''): void {
  console.log(`${color}${msg}${colors.reset}`)
}

function printUsage(): void {
  log('\nE2E Test Runner', colors.bright + colors.cyan)
  log('===============\n', colors.cyan)
  log('Usage:', colors.bright)
  log('  npm run e2e <pattern>              Exact match (default)', colors.dim)
  log('  npm run e2e -f <pattern>           Fuzzy/grep match', colors.dim)
  log('  npm run e2e --fuzzy <pattern>      Fuzzy/grep match', colors.dim)
  log('  npm run e2e --list                 List available tests', colors.dim)
  log('')
  log('Examples:', colors.bright)
  log('  npm run e2e "Drop from Draft"      Exact match', colors.green)
  log('  npm run e2e -f drop                Fuzzy: matches "Drop from Draft"', colors.green)
  log('  npm run e2e -f sealed --headed     Run with browser visible', colors.green)
  log('  npm run e2e -- --ui                Run with Playwright UI', colors.green)
  log('')
}

function listTests(): void {
  const testsDir = join(projectRoot, 'tests', 'e2e')
  const files = readdirSync(testsDir).filter(f => f.endsWith('.spec.js'))

  log('\nAvailable E2E Tests:', colors.bright + colors.cyan)
  log('====================\n', colors.cyan)

  for (const file of files) {
    const name = file.replace('.spec.js', '')
    log(`  ${name}`, colors.green)
  }
  log('')
  log('Run with:', colors.dim)
  log(`  npm run e2e ${files[0]?.replace('.spec.js', '') || '<pattern>'}`, colors.dim)
  log('')
}

interface ParsedArgs {
  pattern: string | null
  matchType: 'exact' | 'fuzzy'
  playwrightArgs: string[]
}

function parseArgs(args: string[]): ParsedArgs {
  let pattern: string | null = null
  let matchType: 'exact' | 'fuzzy' = 'exact' // default to exact
  const playwrightArgs: string[] = []

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--list' || arg === '-l') {
      listTests()
      process.exit(0)
    }

    if (arg === '-f' || arg === '--fuzzy') {
      matchType = 'fuzzy'
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        pattern = args[i + 1]
        i += 2
        continue
      }
      i++
      continue
    }

    // Playwright pass-through args (start with -)
    if (arg.startsWith('-')) {
      playwrightArgs.push(arg)
      // Check if next arg is a value for this flag
      if (args[i + 1] && !args[i + 1].startsWith('-') &&
          (arg === '--project' || arg === '--workers' || arg === '--timeout' || arg === '--retries')) {
        playwrightArgs.push(args[i + 1])
        i += 2
        continue
      }
      i++
      continue
    }

    // First non-flag arg is the pattern
    if (!pattern) {
      pattern = arg
    } else {
      playwrightArgs.push(arg)
    }
    i++
  }

  return { pattern, matchType, playwrightArgs }
}

function buildCommand(pattern: string | null, matchType: 'exact' | 'fuzzy', playwrightArgs: string[]): string[] {
  const args = ['playwright', 'test']

  if (pattern) {
    if (matchType === 'fuzzy') {
      // For fuzzy match, use --grep as-is
      args.push('--grep', pattern)
    } else {
      // For exact match, use --grep with anchored regex
      // Escape special regex characters and anchor
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      args.push('--grep', `^${escaped}$`)
    }
  }

  // Add pass-through args
  args.push(...playwrightArgs)

  return args
}

function main(): void {
  const args = process.argv.slice(2)
  const { pattern, matchType, playwrightArgs } = parseArgs(args)

  // Build the command
  const cmdArgs = buildCommand(pattern, matchType, playwrightArgs)

  // Print what we're doing
  log('')
  if (pattern) {
    const matchDesc = matchType === 'fuzzy'
      ? `matching "${pattern}" (fuzzy)`
      : `"${pattern}" (exact)`
    log(`Running E2E tests ${matchDesc}`, colors.cyan)
  } else {
    log('Running all E2E tests', colors.cyan)
  }
  log(`Command: npx ${cmdArgs.join(' ')}`, colors.dim)
  log('')

  // Run playwright
  const proc = spawn('npx', cmdArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  })

  proc.on('close', (code) => {
    process.exit(code || 0)
  })

  proc.on('error', (err) => {
    console.error('Failed to run playwright:', err)
    process.exit(1)
  })
}

main()
