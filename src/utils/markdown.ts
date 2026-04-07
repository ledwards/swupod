// @ts-nocheck
/**
 * Simple regex-based markdown to HTML parser.
 * Supports: h1-h3, bold, code blocks, inline code, links, lists, hr, paragraphs.
 */
export function parseMarkdownToHTML(markdown: string): string {
  let html = markdown

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />')

  // Paragraphs
  html = html.split('\n').map(line => {
    if (line.trim() && !line.match(/^<[^>]+>/) && !line.match(/<\/[^>]+>$/)) {
      return `<p>${line}</p>`
    }
    return line
  }).join('\n')

  return html
}
