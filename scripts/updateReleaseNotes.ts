#!/usr/bin/env npx tsx

import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const releaseNotesPath = join(projectRoot, 'RELEASE_NOTES.md')
const releaseNotesHeader = '# Release Notes'
const headingPattern = /^## (\d{2}\.\d{2}\.\d{4})(?: Part (\d+))?$/gm

export interface ReleaseSection {
  heading: string
  date: string
  part: number
  start: number
  end: number
}

export function formatReleaseDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${month}.${day}.${year}`
}

export function buildReleaseHeading(date: string, part: number): string {
  return part <= 1 ? `## ${date}` : `## ${date} Part ${part}`
}

export function parseReleaseSections(markdown: string): ReleaseSection[] {
  const matches = Array.from(markdown.matchAll(headingPattern))

  return matches.map((match, index) => {
    const start = match.index ?? 0
    const nextStart = matches[index + 1]?.index ?? markdown.length

    return {
      heading: match[0],
      date: match[1],
      part: match[2] ? Number(match[2]) : 1,
      start,
      end: nextStart,
    }
  })
}

export function getHighestPartForDate(markdown: string, date: string): number {
  return parseReleaseSections(markdown)
    .filter(section => section.date === date)
    .reduce((highest, section) => Math.max(highest, section.part), 0)
}

export function determineTargetHeading(localMarkdown: string, baseMarkdown: string, date: string): string {
  const localHighest = getHighestPartForDate(localMarkdown, date)
  const baseHighest = getHighestPartForDate(baseMarkdown, date)

  if (localHighest < baseHighest) {
    throw new Error(
      `Local RELEASE_NOTES.md is behind the base branch for ${date}. Sync from ${detectBaseRef() ?? 'origin/main'} before appending new notes.`
    )
  }

  if (localHighest > baseHighest) {
    return buildReleaseHeading(date, localHighest)
  }

  if (baseHighest === 0) {
    return buildReleaseHeading(date, 1)
  }

  return buildReleaseHeading(date, baseHighest + 1)
}

export function insertReleaseNotes(markdown: string, heading: string, body: string): string {
  const normalizedBody = body.trim()
  if (!normalizedBody) {
    throw new Error('Release note content is empty.')
  }

  const sections = parseReleaseSections(markdown)
  const existingSection = sections.find(section => section.heading === heading)

  if (existingSection) {
    const before = markdown.slice(0, existingSection.end).replace(/\s*$/, '')
    const after = markdown.slice(existingSection.end).replace(/^\s*/, '')
    return `${before}\n\n${normalizedBody}\n\n${after}`
  }

  if (!markdown.startsWith(releaseNotesHeader)) {
    throw new Error(`Expected ${releaseNotesPath} to start with "${releaseNotesHeader}".`)
  }

  const rest = markdown.slice(releaseNotesHeader.length).replace(/^\s*/, '')
  const suffix = rest ? `\n\n${rest}` : ''
  return `${releaseNotesHeader}\n\n${heading}\n\n${normalizedBody}${suffix}`
}

function detectBaseRef(): string | null {
  const candidates = [
    'refs/remotes/origin/master',
    'refs/remotes/origin/main',
    'refs/heads/master',
    'refs/heads/main',
  ]

  for (const candidate of candidates) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '-q', candidate], {
        cwd: projectRoot,
        stdio: 'ignore',
      })
      return candidate
    } catch {
      continue
    }
  }

  return null
}

function loadBaseReleaseNotes(baseRef: string | null): string {
  if (!baseRef) {
    return ''
  }

  try {
    return execFileSync('git', ['show', `${baseRef}:RELEASE_NOTES.md`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

function parseArgs(args: string[]) {
  const parsed: {
    input?: string
    date?: string
    baseRef?: string
    dryRun: boolean
  } = {
    dryRun: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--input') {
      parsed.input = args[i + 1]
      i += 1
    } else if (arg === '--date') {
      parsed.date = args[i + 1]
      i += 1
    } else if (arg === '--base-ref') {
      parsed.baseRef = args[i + 1]
      i += 1
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function readBody(inputPath?: string): string {
  if (inputPath) {
    const absolutePath = isAbsolute(inputPath) ? inputPath : join(projectRoot, inputPath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Input file not found: ${absolutePath}`)
    }
    return readFileSync(absolutePath, 'utf8')
  }

  if (process.stdin.isTTY) {
    throw new Error('No release note content provided. Pass --input <file> or pipe markdown into the script.')
  }

  return readFileSync(0, 'utf8')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const body = readBody(args.input)
  const localMarkdown = readFileSync(releaseNotesPath, 'utf8')
  const baseRef = args.baseRef ?? detectBaseRef()
  const baseMarkdown = loadBaseReleaseNotes(baseRef)
  const date = args.date ?? formatReleaseDate(new Date())
  const heading = determineTargetHeading(localMarkdown, baseMarkdown, date)
  const nextMarkdown = insertReleaseNotes(localMarkdown, heading, body)

  if (args.dryRun) {
    console.log(heading)
    process.stdout.write('\n')
    process.stdout.write(nextMarkdown)
    return
  }

  writeFileSync(releaseNotesPath, nextMarkdown)
  console.log(`Updated RELEASE_NOTES.md under "${heading}"${baseRef ? ` (compared with ${baseRef})` : ''}.`)
}

const isDirectRun = process.argv[1] === __filename

if (isDirectRun) {
  main().catch(error => {
    console.error((error as Error).message)
    process.exit(1)
  })
}
