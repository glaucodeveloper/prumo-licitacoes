export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

function safeExternalUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderMarkdownInline(value: string): string {
  const tokens: string[] = [];
  const hold = (html: string): string => `\uE000${tokens.push(html) - 1}\uE001`;
  let text = value;
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => hold(`<code>${esc(code)}</code>`));
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, rawUrl: string) => {
    const href = safeExternalUrl(rawUrl);
    return href ? hold(`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`) : `${label} (${rawUrl})`;
  });
  text = text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_match, first: string, second: string) => hold(`<strong>${esc(first || second)}</strong>`));
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g, (_match, first: string, second: string) => hold(`<em>${esc(first || second)}</em>`));
  return esc(text).replace(/\uE000(\d+)\uE001/g, (_match, index: string) => tokens[Number(index)] || '');
}

export function renderMarkdownResponse(value: unknown): string {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  const isList = (line: string): boolean => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
  const isBlockStart = (line: string): boolean => /^\s{0,3}#{1,3}\s+/.test(line) || /^\s*```/.test(line) || /^\s*>/.test(line) || isList(line) || /^\s*(?:[-*_]\s*){3,}$/.test(line);
  const tableCells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
  const isTableRule = (line: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (/^```/.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^(?:[-*_]\s*){3,}$/.test(line)) { blocks.push('<hr>'); index += 1; continue; }
    if (index + 1 < lines.length && line.includes('|') && isTableRule(lines[index + 1])) {
      const headers = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(tableCells(lines[index++]));
      const headerHtml = headers.map((cell) => `<th scope="col">${renderMarkdownInline(cell)}</th>`).join('');
      const bodyHtml = rows.map((row) => `<tr>${headers.map((_, column) => `<td>${renderMarkdownInline(row[column] || '')}</td>`).join('')}</tr>`).join('');
      blocks.push(`<div class="formatted-table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
      continue;
    }
    if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const items: string[] = [];
      while (index < lines.length && isList(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, ''));
        index += 1;
      }
      blocks.push(`<${tag}>${items.map((item) => `<li>${renderMarkdownInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(`<blockquote>${quote.map(renderMarkdownInline).join('<br>')}</blockquote>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(`<p>${paragraph.map(renderMarkdownInline).join('<br>')}</p>`);
  }
  return `<div class="formatted-response">${blocks.join('')}</div>`;
}
