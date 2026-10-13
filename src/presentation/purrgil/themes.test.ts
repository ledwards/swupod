import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {parseTheme} from './theme-contract'

test('all imported Purrgil tables have intact artwork, framing and legible palettes', async () => {
  const themes = JSON.parse(await readFile(new URL('./themes.json', import.meta.url), 'utf8'))
  assert.equal(themes.length, 32)
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(start => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
  }
  const contrast = (a: string, b: string) => {
    const x = luminance(a), y = luminance(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  for (const raw of themes) {
    const theme = parseTheme(raw)
    assert.ok(theme, `Invalid theme: ${raw.id}`)
    const art = await readFile(new URL(`../../..${theme.background.image.replace('/table-environments/', '/public/table-environments/')}`, import.meta.url))
    assert.equal(createHash('sha256').update(art).digest('hex'), theme.background.sha256)
    for (const surface of ['canvas', 'surface', 'surfaceRaised', 'surfaceHover'] as const) {
      for (const text of ['text', 'textMuted'] as const) assert.ok(contrast(theme.colors[text], theme.colors[surface]) >= 4.5, `${theme.id}: ${text}/${surface}`)
      assert.ok(contrast(theme.colors.focus, theme.colors[surface]) >= 3, `${theme.id}: focus/${surface}`)
    }
  }
})
