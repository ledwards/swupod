#!/usr/bin/env npx tsx
// Release-notes build step: copy the source RELEASE_NOTES.md into public/ (where
// the site reads it). This mirrors what postbuild.ts does on a full build, as a
// standalone, fast step the pre-commit hook can run on its own.
//
// Best-effort by design: it NEVER exits non-zero, so it can't block a commit
// (the pre-commit hook is repo-wide across worktrees).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { formatSharedReleaseNotes } from './releaseNotesFormat'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

try {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const src = join(projectRoot, 'RELEASE_NOTES.md')
  const publicDir = join(projectRoot, 'public')
  const dest = join(publicDir, 'RELEASE_NOTES.md')

  if (!existsSync(src)) {
    console.warn('⚠️  RELEASE_NOTES.md not found — skipping release-notes build')
  } else {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })
    copyFileSync(src, dest)
    // The site header's release-notes button reads the shared format from /release-notes.md.
    writeFileSync(join(publicDir, 'release-notes.md'), formatSharedReleaseNotes(readFileSync(src, 'utf8')))
    console.log('✅ Built release notes → public/RELEASE_NOTES.md + public/release-notes.md')
  }
} catch (error) {
  console.warn(`⚠️  release-notes build failed (non-fatal): ${(error as Error).message}`)
}
