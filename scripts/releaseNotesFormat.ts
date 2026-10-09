/**
 * Convert the source RELEASE_NOTES.md (PTP's `## MM.DD.YYYY[ Part N]` sections
 * with `### Category` sub-headings) into the shared site-header format the
 * homepage bundle reads from /release-notes.md:
 *
 *   ## YYYY-MM-DD · Title
 *   - bullet
 *
 * One source of release notes (RELEASE_NOTES.md), two renderings. The title is
 * the first bullet's bold lead so the header badge and toast say what shipped.
 */
const heading = /^## (\d{2})\.(\d{2})\.(\d{4})(?:\s+Part\s+(\d+))?\s*$/
const subheading = /^###\s+(.*)$/
const lead = /^\s*[-*]\s+\*\*([^*]+)\*\*/

export function formatSharedReleaseNotes(source: string): string {
  const out: string[] = ['# Protect the Pod release notes', '']
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const date = heading.exec(line)
    if (date) {
      const [, mm, dd, yyyy, part] = date
      let title = ''
      for (let j = i + 1; j < lines.length && !heading.test(lines[j]!); j++) {
        const bold = lead.exec(lines[j]!)
        if (bold) { title = bold[1]!.replace(/[.!?]+$/, ''); break }
      }
      if (part) title = title ? `${title} (Part ${part})` : `Part ${part}`
      out.push(`## ${yyyy}-${mm}-${dd}${title ? ` · ${title}` : ''}`)
      continue
    }
    if (/^#\s/.test(line)) continue
    const sub = subheading.exec(line)
    if (sub) { out.push(`**${sub[1]!.trim()}**`); continue }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
