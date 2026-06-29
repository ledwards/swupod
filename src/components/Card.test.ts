import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CSS = readFileSync(join(__dirname, 'Card.css'), 'utf8')

describe('Card stats affordance', () => {
  it('reveals the Wayfinder card stats button only from card hover or focus', () => {
    assert.match(CSS, /\.swupod-card-17l-button\s*\{[\s\S]*opacity:\s*0/)
    assert.match(CSS, /\.swupod-card-17l-button\s*\{[\s\S]*pointer-events:\s*none/)
    assert.match(CSS, /\.canvas-card:hover \.swupod-card-17l-button/)
    assert.match(CSS, /\.canvas-card:focus-within \.swupod-card-17l-button/)
    assert.match(CSS, /\.swupod-card-17l-button:focus-visible/)
  })
})
