import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SRC = readFileSync(join(__dirname, 'AuthWidget.tsx'), 'utf8')
const CSS = readFileSync(join(__dirname, 'AuthWidget.css'), 'utf8')

describe('<AuthWidget /> Friends-of-the-Pod import menu item', () => {
  it('renders Import Pool only inside a patron gate', () => {
    assert.match(SRC, /\{isPatron\s*&&\s*\([\s\S]*href="\/import"[\s\S]*Import Pool[\s\S]*\)\}/)
  })

  it('adds icon plus supporting text for the Import Pool item', () => {
    assert.ok(SRC.includes('auth-widget-import-pool-item'))
    assert.ok(SRC.includes('<svg width="20" height="20"'))
    assert.ok(SRC.includes('Scan a sealed registration sheet'))
  })

  it('uses the same gold treatment as other FOP menu items', () => {
    assert.match(CSS, /\.auth-widget-draft-reports-item,\s*\.auth-widget-import-pool-item,\s*\.auth-widget-support-the-pod-item/)
  })
})
