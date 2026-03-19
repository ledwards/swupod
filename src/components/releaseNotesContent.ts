const TYPO_DOMAIN = 'protecthtepod.com'
const CORRECT_DOMAIN = 'protectthepod.com'

export function normalizeReleaseNotesContent(markdown: string): string {
  return markdown.replaceAll(TYPO_DOMAIN, CORRECT_DOMAIN)
}
