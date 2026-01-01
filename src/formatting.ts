/**
 * Formatting utilities for converting LSP results to markdown.
 * @internal
 */

import type { CodeSnippet, Diagnostic, DocumentSymbol } from './types.js'

/**
 * Normalizes a URI to handle Windows/Unix path separator differences.
 */
export function normalizeUri(uri: string): string {
  // If it's already a file:// URI, leave it alone
  if (uri.startsWith('file://')) {
    return uri
  }
  // Normalize backslashes to forward slashes for consistency
  return uri.replace(/\\/g, '/')
}

/**
 * Formats code snippets as markdown for LLM consumption.
 */
export function formatSnippetsAsMarkdown(snippets: CodeSnippet[]): string {
  if (snippets.length === 0) {
    return 'No results found.'
  }

  return snippets
    .map((snippet) => {
      const startLine = snippet.range.start.line + 1 // Convert to 1-based
      const endLine = snippet.range.end.line + 1
      const locationInfo =
        startLine === endLine
          ? `Line ${startLine}`
          : `Lines ${startLine}-${endLine}`

      return `### ${snippet.uri}\n${locationInfo}\n\`\`\`\n${snippet.content}\n\`\`\``
    })
    .join('\n\n')
}

/**
 * Generates a unique ID for pending edit operations.
 */
export function generateEditId(): string {
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Formats diagnostics as markdown for resource content.
 */
export function formatDiagnosticsAsMarkdown(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return 'No diagnostics found.'
  }

  return diagnostics
    .map((d) => {
      const line = d.range.start.line + 1
      const severity = d.severity.toUpperCase()
      const source = d.source ? ` [${d.source}]` : ''
      const code = d.code !== undefined ? ` (${d.code})` : ''
      return `- **${severity}**${source}${code} at line ${line}: ${d.message}`
    })
    .join('\n')
}

/**
 * Formats document symbols as markdown for resource content.
 */
export function formatSymbolsAsMarkdown(
  symbols: DocumentSymbol[],
  indent = 0,
): string {
  if (symbols.length === 0 && indent === 0) {
    return 'No symbols found.'
  }

  const prefix = '  '.repeat(indent)
  return symbols
    .map((s) => {
      const startLine = s.range.start.line + 1
      const endLine = s.range.end.line + 1
      const range =
        startLine === endLine
          ? `line ${startLine}`
          : `lines ${startLine}-${endLine}`
      const detail = s.detail ? ` - ${s.detail}` : ''
      const line = `${prefix}- **${s.kind}** \`${s.name}\`${detail} (${range})`

      if (s.children && s.children.length > 0) {
        return `${line}\n${formatSymbolsAsMarkdown(s.children, indent + 1)}`
      }
      return line
    })
    .join('\n')
}
