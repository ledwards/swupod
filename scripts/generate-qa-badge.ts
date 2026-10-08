#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Generate QA Badge for README
 *
 * Reads QA results and generates a badge/status for display
 *
 * Usage: npx tsx scripts/generate-qa-badge.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// ANSI color codes
const colors: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
}

function log(message: string, color: string = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * Generate badge URL using shields.io
 */
function generateBadgeUrl(passed: number, total: number, failed: number): string {
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  let color = 'brightgreen'
  let status = 'passing'

  if (failed > 0) {
    if (passRate >= 95) {
      color = 'yellow'
      status = `${passed}/${total}`
    } else if (passRate >= 80) {
      color = 'orange'
      status = `${passed}/${total}`
    } else {
      color = 'red'
      status = 'failing'
    }
  }

  return `https://img.shields.io/badge/QA_Tests-${status}-${color}?style=flat-square`
}

/**
 * Generate markdown badge
 */
function generateBadgeMarkdown(passed: number, total: number, failed: number): string {
  const url = generateBadgeUrl(passed, total, failed)
  return `![QA Tests](${url})`
}

interface QAResults {
  runAt: string
  summary: {
    passed: number
    total: number
    failed: number
  }
  tests: Array<{
    name: string
    status: string
  }>
}

/**
 * Generate detailed status text
 */
function generateStatusText(results: QAResults): string {
  const { passed, total, failed } = results.summary
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0'

  let emoji = '✅'
  let status = 'PASSING'

  if (failed > 0) {
    if (parseFloat(passRate) >= 95) {
      emoji = '⚠️'
      status = 'MOSTLY PASSING'
    } else {
      emoji = '❌'
      status = 'FAILING'
    }
  }

  const lastRun = new Date(results.runAt).toLocaleString()

  return `
## QA Test Status

${emoji} **${status}** - ${passed}/${total} tests passing (${passRate}%)

Last run: ${lastRun}

### Test Summary by Set

${generateSetSummary(results)}

### Quick Stats
- Total Tests: ${total}
- Passed: ${passed} ✅
- Failed: ${failed} ❌
- Pass Rate: ${passRate}%
`
}

/**
 * Generate summary by set
 */
function generateSetSummary(results: QAResults): string {
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']
  const summary: string[] = []

  for (const setCode of sets) {
    // Tests have format "SOR: test name", extract set code from name
    const setTests = results.tests.filter(t => t.name.startsWith(`${setCode}:`))
    const passed = setTests.filter(t => t.status === 'passed').length
    const failed = setTests.filter(t => t.status === 'failed').length
    const total = setTests.length

    const emoji = failed === 0 ? '✅' : '⚠️'
    summary.push(`- ${emoji} **${setCode}**: ${passed}/${total} passing`)
  }

  return summary.join('\n')
}

interface StatusJSON {
  status: 'passing' | 'warning' | 'failing'
  summary: {
    passed: number
    total: number
    failed: number
  }
  passRate: number
  lastRun: string
  badgeUrl: string
}

/**
 * Generate JSON status for API
 */
function generateStatusJSON(results: QAResults): StatusJSON {
  const { passed, total, failed } = results.summary
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0'

  return {
    status: failed === 0 ? 'passing' : (parseFloat(passRate) >= 95 ? 'warning' : 'failing'),
    summary: results.summary,
    passRate: parseFloat(passRate),
    lastRun: results.runAt,
    badgeUrl: generateBadgeUrl(passed, total, failed)
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  log('\n📊 QA Badge Generator\n', 'bold')

  // Read QA results
  const qaResultsPath = join(projectRoot, 'src', 'qa', 'results.json')

  if (!existsSync(qaResultsPath)) {
    log('⚠️  QA results not found. Run `npm run qa` first.', 'yellow')
    log(`   Expected at: ${qaResultsPath}`, 'cyan')
    process.exit(1)
  }

  const qaResults: QAResults = JSON.parse(readFileSync(qaResultsPath, 'utf8'))
  const { passed, total, failed } = qaResults.summary

  log('QA Results:', 'cyan')
  log(`  Total: ${total}`, 'cyan')
  log(`  Passed: ${passed}`, passed === total ? 'green' : 'yellow')
  log(`  Failed: ${failed}`, failed === 0 ? 'green' : 'red')
  log('')

  // Generate badge markdown
  const badgeMarkdown = generateBadgeMarkdown(passed, total, failed)
  log('Badge Markdown:', 'cyan')
  log(`  ${badgeMarkdown}`, 'green')
  log('')

  // Generate badge URL
  const badgeUrl = generateBadgeUrl(passed, total, failed)
  log('Badge URL:', 'cyan')
  log(`  ${badgeUrl}`, 'green')
  log('')

  // Generate status text
  const statusText = generateStatusText(qaResults)
  const statusPath = join(projectRoot, 'docs', 'QA_STATUS.md')
  writeFileSync(statusPath, statusText.trim())
  log('✅ Generated status document:', 'green')
  log(`   ${statusPath}`, 'cyan')
  log('')

  // Generate status JSON
  const statusJSON = generateStatusJSON(qaResults)
  const statusJSONPath = join(projectRoot, 'public', 'qa-status.json')

  // Ensure public directory exists
  const publicDir = join(projectRoot, 'public')
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true })
  }

  writeFileSync(statusJSONPath, JSON.stringify(statusJSON, null, 2))
  log('✅ Generated status JSON:', 'green')
  log(`   ${statusJSONPath}`, 'cyan')
  log('')

  // Print usage instructions
  log('Usage Instructions:', 'bold')
  log('  Add to README.md:', 'cyan')
  log(`    ${badgeMarkdown}`, 'green')
  log('')
  log('  View detailed status:', 'cyan')
  log(`    cat ${statusPath}`, 'green')
  log('')
  log('  Access status API:', 'cyan')
  log('    GET /qa-status.json', 'green')
  log('')

  // Exit with appropriate code
  if (failed > 0) {
    log(`⚠️  ${failed} test(s) failed`, 'yellow')
    process.exit(0) // Don't fail the script
  } else {
    log('✅ All tests passing!', 'green')
    process.exit(0)
  }
}

main().catch(error => {
  log(`❌ Error: ${(error as Error).message}`, 'red')
  if ((error as Error).stack) {
    console.error((error as Error).stack)
  }
  process.exit(1)
})
