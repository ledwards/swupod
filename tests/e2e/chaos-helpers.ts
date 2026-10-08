// Helpers for the chaos draft / chaos sealed pack pickers.
//
// Both pages let the player dial how many packs the format uses — draft 1–4,
// sealed 1–12 — and remember the choice in localStorage. The default is a
// product decision that has already moved once (chaos draft went 3 → 4), and
// every assertion that hardcoded "3/3" broke with it. Read the number the page
// is asking for and fill that many slots instead.

import { expect, type Locator, type Page } from '@playwright/test'

/** How many set packs the page currently wants, read from its own heading. */
export async function requiredPackCount(page: Page): Promise<number> {
  const heading = page.locator('h3').first()
  await expect(heading).toContainText(/Select \d+ Packs/)
  const text = (await heading.textContent()) ?? ''
  const match = text.match(/Select (\d+) Packs/)
  if (!match) throw new Error(`No pack count in picker heading: "${text}"`)
  return Number(match[1])
}

/**
 * Filled slots in the "Your Chaos …" tray.
 *
 * Empty slots are dashed placeholders carrying no pack, so this counts exactly
 * what the player has chosen.
 */
export function trayPacks(page: Page): Locator {
  return page.locator('[data-testid="tray-pack"]')
}

/** The picker's counter reads `selected` of `required`. */
export async function expectSelected(page: Page, selected: number, required: number): Promise<void> {
  await expect(page.locator('h3').first()).toContainText(`(${selected}/${required})`)
}

/** The + control on an already-selected set, which adds a second copy of it. */
export function duplicateButtons(page: Page): Locator {
  return page.locator('.pack-selector-button.selected .pack-selector-qty-btn--plus')
}
