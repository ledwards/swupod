// @ts-nocheck
// GET /api/stats/tests - Get unit test results from file
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  try {
    // Path to results file
    const resultsPath = join(process.cwd(), 'src', 'tests', 'results.json')

    // Check if results file exists
    if (!existsSync(resultsPath)) {
      return jsonResponse({
        available: false,
        message: 'No test results available. Run `npm run test:json` to generate results.',
        latestRun: null
      })
    }

    // Read results file
    const resultsData = readFileSync(resultsPath, 'utf-8')
    const results = JSON.parse(resultsData)

    return jsonResponse({
      available: true,
      latestRun: {
        runAt: results.runAt,
        executionTime: results.executionTime,
        summary: results.summary,
        suites: results.suites,
        tests: results.tests
      },
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error reading test results:', error)
    return handleApiError(error)
  }
}
