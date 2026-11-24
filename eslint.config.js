import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'

// TypeScript has been linted since 2026-11-23. The violations that existed
// that day are recorded per file and rule in eslint-suppressions.json; anything
// beyond those counts fails. After fixing some, shrink the file with
//   npx eslint . --prune-suppressions
export default defineConfig([
  // Git worktrees actually live under .claude/worktrees/, NOT .worktrees/ — the
  // old pattern matched nothing, so `npm run lint` walked every worktree's
  // node_modules and .next and reported ~151k phantom errors, which buries any
  // real one. .worktrees/** is kept in case a worktree is ever put there.
  // ds-bundle/ is a gitignored vendored bundle (minified, not our source).
  globalIgnores([
    'dist/**',
    '.next/**',
    // The promo e2e builds into .next-promo-e2e (its own distDir, so it can run
    // alongside a dev server). Same story as .next: run that suite once and
    // lint reports thousands of errors from generated bundles. .gitignore
    // already covers `.next-*`; this keeps lint in step with it.
    '.next-*/**',
    'node_modules/**',
    '.worktrees/**',
    '.claude/worktrees/**',
    'ds-bundle/**',
    // Static design-comp studies: their functions are wired from inline HTML
    // handlers, so no-unused-vars misfires. They are mocks, not app source.
    'docs/design/entry-flow-2026-10-01/**',
    'docs/design/limited-matchmaking-2026-10-07/**',
    // The built play-home bundle (npm run build:play-home writes it; it is
    // committed so the site can serve it). Bundler output, not our source: it
    // accounted for 145 of the 150 errors lint reported on 2026-11-23.
    'public/play-home/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [
      js.configs.recommended,
      tsPlugin.configs['flat/recommended'],
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // @ts-nocheck is governed by its own monotonic ratchet
      // (npm run check:ts-ratchet); reporting it here would count it twice.
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
    },
  },
  // Files under scripts/ run in Node, not the browser.
  {
    files: ['scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])
