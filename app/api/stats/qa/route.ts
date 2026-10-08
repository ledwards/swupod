// @ts-nocheck
// GET /api/stats/qa - Get QA test results from file
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  try {
    // Path to results file
    const resultsPath = join(process.cwd(), 'src', 'qa', 'results.json')

    // Check if results file exists
    if (!existsSync(resultsPath)) {
      return jsonResponse({
        available: false,
        message: 'No QA results available. Run `npm run qa` to generate results.',
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
        summary: results.summary,
        tests: results.tests
      },
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error reading QA results:', error)
    return handleApiError(error)
  }
}
