/* oxlint-disable regexp/no-super-linear-backtracking */
/**
 * Text Processing Utilities
 *
 * Functions for escaping HTML, parsing JSDoc links, and rendering markdown.
 *
 * @module server/utils/docs/text
 */

import { highlightCodeBlock } from '../shiki'
import type { SymbolLookup } from './types'

/**
 * Strip ANSI escape codes from text.
 * Deno doc output may contain terminal color codes that need to be removed.
 */
const ESC = String.fromCharCode(27)
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

/**
 * Escape HTML special characters.
 *
 * @internal Exported for testing
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Clean up symbol names by stripping esm.sh prefixes.
 *
 * Packages using @types/* definitions get "default." or "default_" prefixes
 * from esm.sh that we need to remove for clean display.
 */
export function cleanSymbolName(name: string): string {
  if (name.startsWith('default.')) {
    return name.slice(8)
  }
  if (name.startsWith('default_')) {
    return name.slice(8)
  }
  return name
}

/**
 * Create a URL-safe HTML anchor ID for a symbol.
 */
export function createSymbolId(kind: string, name: string): string {
  return `${kind}-${name}`.replace(/[^a-z0-9-]/gi, '_')
}

/**
 * Parse JSDoc {@link} tags into HTML links.
 *
 * Handles:
 * - {@link https://example.com} - external URL
 * - {@link https://example.com Link Text} - external URL with label
 * - {@link SomeSymbol} - internal cross-reference
 *
 * @internal Exported for testing
 */
export function parseJsDocLinks(text: string, symbolLookup: SymbolLookup): string {
  let result = escapeHtml(text)

  result = result.replace(/\{@link\s+([^}]+)\}/g, (_, content) => {
    const splitIndex = content.trim().search(/\s/);
    const target = splitIndex === -1 ? content : content.slice(0, splitIndex);
    const label = splitIndex === -1 ? "" : content.slice(splitIndex + 1).trim();

    const displayText = label || target

    // External URL
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return `<a href="${target}" target="_blank" rel="noreferrer" class="docs-link">${displayText}</a>`
    }

    // Internal symbol reference
    const symbolId = symbolLookup.get(target)
    if (symbolId) {
      return `<a href="#${symbolId}" class="docs-symbol-link">${displayText}</a>`
    }

    // Unknown symbol
    return `<code class="docs-symbol-ref">${displayText}</code>`
  })

  return result
}

/**
 * Render simple markdown-like formatting.
 * Uses <br> for line breaks to avoid nesting issues with inline elements.
 * Fenced code blocks (```) are syntax-highlighted with Shiki.
 *
 * @internal Exported for testing
 */
export async function renderMarkdown(text: string, symbolLookup: SymbolLookup): Promise<string> {
  const result: string[] = [];

  // Separate the fenced code blocks from the rest of the content.
  // Pattern handles:
  // - Optional whitespace before/after language identifier
  // - \r\n, \n, or \r line endings
  const split = text.split(/```([ \t]*\w+)?[ \t]*(?:\r\n|\r|\n)([\s\S]*?)(?:\r\n|\r|\n)?```/g)

  // The split array looks like [content, lang, code, content, lang, code, ..., content],
  // so iterate through it in chunks of [content, lang?, code?].
  for (let i = 0; i < split.length; i += 3) {
    // Process the content before the fenced code block (JSDoc links, HTML escaping, etc.)
    let content = parseJsDocLinks(split[i]!, symbolLookup)

    // Markdown links - i.e. [text](url)
    content = content.replace(
      /\[([^\[\]]+)\]\((https?:\/\/[^\(\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="docs-link">$1</a>',
    )

    // Handle inline code (single backticks) - won't interfere with fenced blocks
    content = content
      .replace(/`([^`]+)`/g, '<code class="docs-inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>')

    result.push(content)

    // Process the fenced code block, if any.
    if (i + 2 < split.length) {
      const lang = split[i + 1] ?? "";
      const code = split[i + 2] ?? "";
      result.push(await highlightCodeBlock(code, lang.trim() || "text"))
    }
  }

  return result.join('')
}
