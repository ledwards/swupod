import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Git worktrees actually live under .claude/worktrees/, NOT .worktrees/ — the
  // old pattern matched nothing, so `npm run lint` walked every worktree's
  // node_modules and .next and reported ~151k phantom errors, which buries any
  // real one. .worktrees/** is kept in case a worktree is ever put there.
  // ds-bundle/ is a gitignored vendored bundle (minified, not our source).
  globalIgnores([
    'dist/**',
    '.next/**',
    'node_modules/**',
    '.worktrees/**',
    '.claude/worktrees/**',
    'ds-bundle/**',
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
])
