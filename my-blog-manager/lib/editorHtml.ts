const HTML_CODE_BLOCK_PATTERN = /(<pre><code(?:\s+[^>]*)?>)([\s\S]*?)(<\/code><\/pre>)/gi;

export function normalizeEditorHtml(html: string): string {
  return html.replace(HTML_CODE_BLOCK_PATTERN, (_block, opening: string, code: string, closing: string) => {
    const normalizedCode = code.endsWith('\r\n')
      ? code.slice(0, -2)
      : code.endsWith('\n')
        ? code.slice(0, -1)
        : code;
    return `${opening}${normalizedCode}${closing}`;
  });
}
