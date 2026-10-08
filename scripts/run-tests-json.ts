#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Test Runner with JSON Output
 *
 * Runs all unit tests and saves results to src/tests/results.json
 * Usage: npx tsx scripts/run-tests-json.ts
 */

import { spawn } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

interface TestConfig {
  name: string
  suite: string
  cmd: string
  args: string[]
}

interface TestResult {
  suite: string
  name: string
  status: 'passed' | 'failed'
}

interface SuiteResult {
  name: string
  suite: string
  status: 'passed' | 'failed'
  exitCode: number
  executionTime: number
  tests: TestResult[]
  errorMessage: string | null
}

interface TestOutput {
  runAt: string
  executionTime: number
  summary: {
    totalSuites: number
    passedSuites: number
    failedSuites: number
    totalTests: number
    passed: number
    failed: number
  }
  suites: SuiteResult[]
  tests: TestResult[]
}

// Test commands to run
const testCommands: TestConfig[] = [
  { name: 'Booster Pack', suite: 'utils', cmd: 'npx', args: ['tsx', 'src/utils/boosterPack.test.ts'] },
  { name: 'Variant Downgrade', suite: 'utils', cmd: 'npx', args: ['tsx', 'src/utils/variantDowngrade.test.ts'] },
  { name: 'Card Sort', suite: 'utils', cmd: 'npx', args: ['tsx', 'src/utils/cardSort.test.ts'] },
  { name: 'Aspect Combinations', suite: 'utils', cmd: 'npx', args: ['tsx', 'src/utils/aspectCombinations.test.ts'] },
  { name: 'Base Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/BaseBelt.test.ts'] },
  { name: 'Common Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/CommonBelt.test.ts'] },
  { name: 'Foil Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/FoilBelt.test.ts'] },
  { name: 'Hyperfoil Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/HyperfoilBelt.test.ts'] },
  { name: 'Hyperspace Belts', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/HyperspaceBelts.test.ts'] },
  { name: 'Leader Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/LeaderBelt.test.ts'] },
  { name: 'Rare/Legendary Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/RareLegendaryBelt.test.ts'] },
  { name: 'Showcase Leader Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/ShowcaseLeaderBelt.test.ts'] },
  { name: 'Uncommon Belt', suite: 'belts', cmd: 'npx', args: ['tsx', 'src/belts/UncommonBelt.test.ts'] },
  { name: 'Card Fixes', suite: 'fixes', cmd: 'npx', args: ['tsx', 'src/utils/cardFixes.test.ts'] },
  { name: 'Draft Logic', suite: 'draft', cmd: 'npx', args: ['tsx', 'src/utils/draftLogic.test.ts'] },
  { name: 'Bot Behaviors', suite: 'bots', cmd: 'npx', args: ['tsx', 'src/bots/behaviors/behaviors.test.ts'] },
  { name: 'Card Data', suite: 'data', cmd: 'npx', args: ['tsx', 'src/data/cards.test.ts'] },
  { name: 'Card Counts', suite: 'data', cmd: 'npx', args: ['tsx', 'src/data/cardCounts.test.ts'] },
  { name: 'Hooks - Tooltip', suite: 'hooks', cmd: 'npx', args: ['tsx', 'src/hooks/useTooltip.test.ts'] },
  { name: 'Hooks - Card Preview', suite: 'hooks', cmd: 'npx', args: ['tsx', 'src/hooks/useCardPreview.test.ts'] },
  { name: 'Hooks - Is Mobile', suite: 'hooks', cmd: 'npx', args: ['tsx', 'src/hooks/common/useIsMobile.test.ts'] },
  { name: 'Hooks - Local Storage', suite: 'hooks', cmd: 'npx', args: ['tsx', 'src/hooks/common/useLocalStorage.test.ts'] },
]

async function runTest(testConfig: TestConfig): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let stdout = ''
    let stderr = ''

    const proc = spawn(testConfig.cmd, testConfig.args, {
      cwd: projectRoot,
      stdio: ['inherit', 'pipe', 'pipe']
    })

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      process.stdout.write(data)
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
      process.stderr.write(data)
    })

    proc.on('close', (code: number | null) => {
      const executionTime = Date.now() - startTime
      const passed = code === 0

      // Try to extract individual test results from output
      const testResults = parseTestOutput(stdout + stderr, testConfig.suite, testConfig.name)

      resolve({
        name: testConfig.name,
        suite: testConfig.suite,
        status: passed ? 'passed' : 'failed',
        exitCode: code || 0,
        executionTime,
        tests: testResults,
        errorMessage: passed ? null : extractErrorMessage(stderr || stdout)
      })
    })

    proc.on('error', (err: Error) => {
      resolve({
        name: testConfig.name,
        suite: testConfig.suite,
        status: 'failed',
        exitCode: -1,
        executionTime: Date.now() - startTime,
        tests: [],
        errorMessage: err.message
      })
    })
  })
}

function parseTestOutput(output: string, suite: string, suiteName: string): TestResult[] {
  const results: TestResult[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    // Match patterns like "✅ Test name" or "❌ Test name"
    const passMatch = line.match(/✅\s*(.+)/)
    const failMatch = line.match(/❌\s*(.+)/)

    if (passMatch) {
      results.push({
        suite,
        name: passMatch[1].trim(),
        status: 'passed'
      })
    } else if (failMatch) {
      results.push({
        suite,
        name: failMatch[1].trim(),
        status: 'failed'
      })
    }
  }

  // If no individual tests found, create one entry for the suite
  if (results.length === 0) {
    const hasError = output.includes('Error') || output.includes('failed') || output.includes('❌')
    results.push({
      suite,
      name: suiteName,
      status: hasError ? 'failed' : 'passed'
    })
  }

  return results
}

function extractErrorMessage(output: string): string {
  const lines = output.split('\n')
  for (const line of lines) {
    if (line.includes('Error:') || line.includes('AssertionError')) {
      return line.trim()
    }
  }
  return lines.find(l => l.trim().length > 0) || 'Unknown error'
}

async function main(): Promise<void> {
  console.log('\x1b[1m\x1b[36m🧪 Running Unit Tests\x1b[0m')
  console.log('\x1b[36m============================\x1b[0m')
  console.log('')

  const startTime = Date.now()
  const suiteResults: SuiteResult[] = []
  const allTests: TestResult[] = []

  for (const testConfig of testCommands) {
    console.log(`\x1b[36m📦 Running ${testConfig.name}...\x1b[0m`)
    const result = await runTest(testConfig)
    suiteResults.push(result)
    allTests.push(...result.tests)
    console.log('')
  }

  const totalTime = Date.now() - startTime
  const passedSuites = suiteResults.filter(r => r.status === 'passed').length
  const failedSuites = suiteResults.filter(r => r.status === 'failed').length
  const passedTests = allTests.filter(t => t.status === 'passed').length
  const failedTests = allTests.filter(t => t.status === 'failed').length

  // Ensure output directory exists
  const outputDir = join(projectRoot, 'src', 'tests')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Write results
  const output: TestOutput = {
    runAt: new Date().toISOString(),
    executionTime: totalTime,
    summary: {
      totalSuites: suiteResults.length,
      passedSuites,
      failedSuites,
      totalTests: allTests.length,
      passed: passedTests,
      failed: failedTests
    },
    suites: suiteResults,
    tests: allTests
  }

  const outputPath = join(outputDir, 'results.json')
  writeFileSync(outputPath, JSON.stringify(output, null, 2))

  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Suites passed: ${passedSuites}/${suiteResults.length}\x1b[0m`)
  if (failedSuites > 0) {
    console.log(`\x1b[31m❌ Suites failed: ${failedSuites}\x1b[0m`)
  }
  console.log(`\x1b[32m✅ Tests passed: ${passedTests}/${allTests.length}\x1b[0m`)
  if (failedTests > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failedTests}\x1b[0m`)
  }
  console.log(`\x1b[36m⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s\x1b[0m`)
  console.log('')
  console.log(`\x1b[36m📄 Results written to: ${outputPath}\x1b[0m`)

  if (failedSuites > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
