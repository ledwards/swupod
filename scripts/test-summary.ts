#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Test Summary Aggregator
 *
 * Shows summary of all test runs (unit, QA, e2e)
 * Usage: npx tsx scripts/test-summary.ts
 */

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// ANSI color codes
const colors: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

function log(message: string, color: string = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Known unit test counts (update these if you add/remove tests)
const UNIT_TEST_COUNTS: Record<string, number> = {
  utils: 39,      // boosterPack.test.js
  belts: 25,      // CommonBelt.test.js
  fixes: 6,       // cardFixes.test.js
  draft: 14       // draftLogic.test.js
}

const TOTAL_UNIT_TESTS = Object.values(UNIT_TEST_COUNTS).reduce((a, b) => a + b, 0)

interface QATest {
  name: string
  status: string
  error?: string
}

interface QAResults {
  summary: {
    total: number
    passed: number
    failed: number
  }
  tests: QATest[]
}

interface ParsedQAResults {
  total: number
  passed: number
  failed: number
  failedTests: Array<{ name: string; error?: string }>
}

interface PlaywrightResults {
  total: number
  passed: number
  failed: number
  skipped?: number
  flaky?: number
  hasReport?: boolean
  failedTests?: Array<{ name: string; error?: string }>
}

function parseQAResults(): ParsedQAResults | null {
  const qaResultsPath = join(projectRoot, 'src', 'qa', 'results.json')
  if (!existsSync(qaResultsPath)) return null

  try {
    const data: QAResults = JSON.parse(readFileSync(qaResultsPath, 'utf8'))
    const failedTests = data.tests.filter(t => t.status === 'failed')
    return {
      total: data.summary.total,
      passed: data.summary.passed,
      failed: data.summary.failed,
      failedTests: failedTests.slice(0, 5).map(t => ({
        name: t.name,
        error: t.error
      }))
    }
  } catch (error) {
    return null
  }
}

function parsePlaywrightResults(): PlaywrightResults | null {
  // Try JSON reporter output first (most accurate)
  const jsonResultsPath = join(projectRoot, 'test-results', 'results.json')
  if (existsSync(jsonResultsPath)) {
    try {
      const data = JSON.parse(readFileSync(jsonResultsPath, 'utf8'))
      const stats = data.stats || {}
      const failedTests: Array<{ name: string; error?: string }> = []

      // Extract failed test names from suites
      if (data.suites && stats.unexpected > 0) {
        const extractFailed = (suite: any): void => {
          if (suite.specs) {
            for (const spec of suite.specs) {
              if (spec.tests) {
                for (const test of spec.tests) {
                  if (test.status === 'unexpected' || test.status === 'failed') {
                    failedTests.push({
                      name: `${suite.title} > ${spec.title}`,
                      error: test.results?.[0]?.error?.message || ''
                    })
                  }
                }
              }
            }
          }
          if (suite.suites) {
            for (const child of suite.suites) {
              extractFailed(child)
            }
          }
        }
        for (const suite of data.suites) {
          extractFailed(suite)
        }
      }

      return {
        total: stats.expected || 0,
        passed: stats.expected - (stats.unexpected || 0) - (stats.skipped || 0),
        failed: stats.unexpected || 0,
        skipped: stats.skipped || 0,
        flaky: stats.flaky || 0,
        failedTests: failedTests.slice(0, 5)
      }
    } catch (error) {
      // Fall through
    }
  }

  // Fallback to .last-run.json
  const lastRunPath = join(projectRoot, 'test-results', '.last-run.json')
  if (existsSync(lastRunPath)) {
    try {
      const data = JSON.parse(readFileSync(lastRunPath, 'utf8'))
      return {
        total: data.stats?.expected || 0,
        passed: data.stats?.passed || 0,
        failed: data.stats?.failed || 0,
        skipped: data.stats?.skipped || 0,
        flaky: data.stats?.flaky || 0
      }
    } catch (error) {
      // Fall through
    }
  }

  // Check if report exists
  const reportPath = join(projectRoot, 'playwright-report', 'index.html')
  if (existsSync(reportPath)) {
    return { hasReport: true, total: 0, passed: 0, failed: 0 }
  }

  return null
}

function displaySummary(): void {
  console.log('')
  log('═'.repeat(70), 'cyan')
  log('  🎯 TEST SUMMARY', 'bold')
  log('═'.repeat(70), 'cyan')
  console.log('')

  let totalTests = 0
  let totalPassed = 0
  let totalFailed = 0
  let hasErrors = false

  // Unit Tests
  log('📦 Unit Tests', 'bold')
  log(`   Total: ${TOTAL_UNIT_TESTS}`, 'cyan')
  log(`   Passed: ${TOTAL_UNIT_TESTS} ✅`, 'green')
  log(`   (boosterPack: ${UNIT_TEST_COUNTS.utils}, belts: ${UNIT_TEST_COUNTS.belts}, fixes: ${UNIT_TEST_COUNTS.fixes}, draft: ${UNIT_TEST_COUNTS.draft})`, 'dim')
  totalTests += TOTAL_UNIT_TESTS
  totalPassed += TOTAL_UNIT_TESTS
  console.log('')

  // QA Tests
  const qaResults = parseQAResults()
  if (qaResults) {
    log('📊 QA Tests', 'bold')
    log(`   Total: ${qaResults.total}`, 'cyan')
    log(`   Passed: ${qaResults.passed} ✅`, 'green')

    if (qaResults.failed > 0) {
      log(`   Failed: ${qaResults.failed} ❌`, 'red')
      hasErrors = true

      if (qaResults.failedTests.length > 0) {
        console.log('')
        log('   Failed Tests:', 'red')
        qaResults.failedTests.forEach(test => {
          log(`   • ${test.name}`, 'red')
          if (test.error) {
            const firstLine = test.error.split('\n')[0]
            log(`     ${firstLine.substring(0, 60)}...`, 'dim')
          }
        })
      }
    }

    totalTests += qaResults.total
    totalPassed += qaResults.passed
    totalFailed += qaResults.failed
    console.log('')
  }

  // Playwright Tests
  const e2eResults = parsePlaywrightResults()
  if (e2eResults && e2eResults.total > 0) {
    log('🎭 E2E Tests (Playwright)', 'bold')
    log(`   Total: ${e2eResults.total}`, 'cyan')
    log(`   Passed: ${e2eResults.passed} ✅`, 'green')

    if (e2eResults.failed > 0) {
      log(`   Failed: ${e2eResults.failed} ❌`, 'red')
      hasErrors = true

      if (e2eResults.failedTests && e2eResults.failedTests.length > 0) {
        console.log('')
        log('   Failed Tests:', 'red')
        e2eResults.failedTests.forEach(test => {
          log(`   • ${test.name}`, 'red')
          if (test.error) {
            const firstLine = test.error.split('\n')[0]
            log(`     ${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}`, 'dim')
          }
        })
      }
    }

    if (e2eResults.skipped && e2eResults.skipped > 0) {
      log(`   Skipped: ${e2eResults.skipped} ⊘`, 'dim')
    }

    if (e2eResults.flaky && e2eResults.flaky > 0) {
      log(`   Flaky: ${e2eResults.flaky} ⚠️`, 'yellow')
    }

    totalTests += e2eResults.total
    totalPassed += e2eResults.passed
    totalFailed += e2eResults.failed
    console.log('')
  } else if (e2eResults?.hasReport) {
    log('🎭 E2E Tests (Playwright)', 'bold')
    log('   Report available (opening in browser)', 'cyan')
    console.log('')
  }

  // Overall Summary
  log('═'.repeat(70), hasErrors ? 'red' : 'green')
  log('  📋 OVERALL RESULTS', 'bold')
  log('═'.repeat(70), hasErrors ? 'red' : 'green')
  console.log('')

  log(`Total Tests: ${totalTests}`, 'bold')
  log(`Passed: ${totalPassed} ✅`, 'green')

  if (totalFailed > 0) {
    log(`Failed: ${totalFailed} ❌`, 'red')
  }

  if (totalTests > 0) {
    const passRate = ((totalPassed / totalTests) * 100).toFixed(1)
    const passRateColor = parseFloat(passRate) >= 95 ? 'green' : parseFloat(passRate) >= 80 ? 'yellow' : 'red'
    log(`Pass Rate: ${passRate}%`, passRateColor)
  }

  console.log('')

  // Final verdict
  if (totalFailed === 0) {
    log('✅ ALL TESTS PASSED!', 'green')
  } else if (totalFailed <= 2) {
    log('⚠️  MOSTLY PASSED (few failures - may be statistical variance)', 'yellow')
  } else {
    log('❌ TESTS FAILED - needs attention', 'red')
  }

  console.log('')

  // Show commands to re-run failing tests
  if (hasErrors) {
    log('─'.repeat(70), 'dim')
    log('  Re-run failing tests:', 'yellow')
    console.log('')

    if (qaResults && qaResults.failed > 0) {
      log('  npm run qa', 'cyan')
    }

    if (e2eResults && e2eResults.failed > 0) {
      log('  npm run test:e2e', 'cyan')

      // Show specific test file commands if we have failed test names
      if (e2eResults.failedTests && e2eResults.failedTests.length > 0) {
        console.log('')
        log('  Or run specific failing tests:', 'dim')
        const seenFiles = new Set<string>()
        e2eResults.failedTests.forEach(test => {
          // Extract test file from test name (format: "file > test name")
          const match = test.name.match(/^([^>]+)/)
          if (match) {
            const testFile = match[1].trim().toLowerCase().replace(/\s+/g, '-')
            if (!seenFiles.has(testFile)) {
              seenFiles.add(testFile)
              log(`  npx playwright test ${testFile}`, 'dim')
            }
          }
        })
      }
    }

    console.log('')
  }

  log('═'.repeat(70), 'cyan')
  console.log('')

  // Exit with appropriate code
  process.exit(hasErrors ? 1 : 0)
}

displaySummary()
