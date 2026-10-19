import {describe, it} from 'node:test'
import assert from 'node:assert'

describe('site header subtitle', () => {
 it('caps the subtitle at a short line', async () => {
  const {SUBTITLE_MAX_LENGTH} = await import('./pageTitle')
  assert.strictEqual(SUBTITLE_MAX_LENGTH, 72)
 })
})

describe('SiteTitle', () => {
 it('marks its heading so the header mirror never copies it while it waits for the slot', async () => {
  const {createElement} = await import('react')
  const {renderToStaticMarkup} = await import('react-dom/server')
  const {SiteTitle} = await import('./title')
  assert.match(renderToStaticMarkup(createElement(SiteTitle, null, 'Pack Wars')), /^<h1 data-site-title="skip">Pack Wars<\/h1>$/)
 })
})
