export interface MarkdownTableCell {
  tokens: MarkdownToken[];
}

export interface MarkdownTableRow {
  cells: MarkdownTableCell[];
}

export interface MarkdownToken {
  type: 'heading' | 'paragraph' | 'list-item' | 'ordered-list-item' | 'bold' | 'italic' | 'inline-code' | 'text' | 'code-block' | 'quote' | 'divider' | 'link' | 'strike' | 'table';
  level?: number;
  content: string;
  children?: MarkdownToken[];
  index?: number;
  language?: string;
  url?: string;
  tableHeader?: MarkdownTableCell[];
  tableRows?: MarkdownTableRow[];
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.substring(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.substring(0, trimmed.length - 1);
  }
  const parts = trimmed.split('|');
  const cells: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    cells.push(parts[i].trim());
  }
  return cells;
}

function isTableDivider(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.indexOf('|') < 0) {
    return false;
  }
  // Only made of | - : and spaces (allows standard |---|---| and degraded '|').
  let hasPipe = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed.charAt(i);
    if (ch === '|') {
      hasPipe = true;
    } else if (ch !== '-' && ch !== ':' && ch !== ' ') {
      return false;
    }
  }
  return hasPipe;
}

export function parseMarkdown(md: string): MarkdownToken[] {
  if (md === '') {
    return [];
  }

  const lines = md.split('\n');
  const tokens: MarkdownToken[] = [];
  let buffer: string[] = [];

  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const listItemRegex = /^[-*+]\s+(.*)$/;
  const orderedListItemRegex = /^(\d+)\.\s+(.*)$/;
  const quoteRegex = /^>\s?(.*)$/;
  const dividerRegex = /^(-{3,}|\*{3,}|_{3,})$/;
  const fenceRegex = /^```\s*(\S*)\s*$/;

  const flushBuffer = (): void => {
    if (buffer.length > 0) {
      const content = buffer.join('\n');
      const children = parseInline(content);
      tokens.push({ type: 'paragraph', content: content, children: children });
      buffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block: ```lang ... ```
    const fenceMatch = fenceRegex.exec(trimmed);
    if (fenceMatch !== null) {
      flushBuffer();
      const language = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or past end)
      tokens.push({ type: 'code-block', content: codeLines.join('\n'), language: language });
      continue;
    }

    if (trimmed === '') {
      flushBuffer();
      i++;
      continue;
    }

    // Table: current line has pipes and the next line is an alignment divider
    if (trimmed.indexOf('|') >= 0 && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushBuffer();
      const headerCells: MarkdownTableCell[] = [];
      const headerParts = splitTableRow(trimmed);
      for (let h = 0; h < headerParts.length; h++) {
        headerCells.push({ tokens: parseInline(headerParts[h]) });
      }
      i += 2; // skip header + divider
      const rows: MarkdownTableRow[] = [];
      while (i < lines.length && lines[i].trim().indexOf('|') >= 0 && lines[i].trim() !== '') {
        const rowParts = splitTableRow(lines[i]);
        const cells: MarkdownTableCell[] = [];
        for (let c = 0; c < rowParts.length; c++) {
          cells.push({ tokens: parseInline(rowParts[c]) });
        }
        rows.push({ cells: cells });
        i++;
      }
      tokens.push({ type: 'table', content: '', tableHeader: headerCells, tableRows: rows });
      continue;
    }

    // Horizontal rule
    if (dividerRegex.exec(trimmed) !== null) {
      flushBuffer();
      tokens.push({ type: 'divider', content: '' });
      i++;
      continue;
    }

    const headingMatch = headingRegex.exec(line);
    if (headingMatch !== null) {
      flushBuffer();
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const children = parseInline(content);
      tokens.push({ type: 'heading', level: level, content: content, children: children });
      i++;
      continue;
    }

    // Blockquote (merge consecutive quote lines)
    const quoteMatch = quoteRegex.exec(trimmed);
    if (quoteMatch !== null) {
      flushBuffer();
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const qm = quoteRegex.exec(lines[i].trim());
        if (qm === null) {
          break;
        }
        quoteLines.push(qm[1]);
        i++;
      }
      const content = quoteLines.join('\n');
      const children = parseInline(content);
      tokens.push({ type: 'quote', content: content, children: children });
      continue;
    }

    const listMatch = listItemRegex.exec(trimmed);
    if (listMatch !== null) {
      flushBuffer();
      const content = listMatch[1];
      const children = parseInline(content);
      tokens.push({ type: 'list-item', content: content, children: children });
      i++;
      continue;
    }

    const orderedMatch = orderedListItemRegex.exec(trimmed);
    if (orderedMatch !== null) {
      flushBuffer();
      const index = parseInt(orderedMatch[1]);
      const content = orderedMatch[2];
      const children = parseInline(content);
      tokens.push({ type: 'ordered-list-item', index: index, content: content, children: children });
      i++;
      continue;
    }

    buffer.push(line);
    i++;
  }

  flushBuffer();

  return tokens;
}

interface InlineCandidate {
  match: RegExpExecArray;
  type: string;
  priority: number;
}

export function parseInline(text: string): MarkdownToken[] {
  if (text === '') {
    return [];
  }

  const boldRegex = /\*\*(.+?)\*\*/g;
  const strikeRegex = /~~(.+?)~~/g;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const italicRegex = /\*(.+?)\*/g;
  const codeRegex = /`(.+?)`/g;

  const tokens: MarkdownToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    boldRegex.lastIndex = pos;
    const boldMatch = boldRegex.exec(text);

    strikeRegex.lastIndex = pos;
    const strikeMatch = strikeRegex.exec(text);

    linkRegex.lastIndex = pos;
    const linkMatch = linkRegex.exec(text);

    italicRegex.lastIndex = pos;
    const italicMatch = italicRegex.exec(text);

    codeRegex.lastIndex = pos;
    const codeMatch = codeRegex.exec(text);

    const candidates: InlineCandidate[] = [];

    if (boldMatch !== null) {
      candidates.push({ match: boldMatch, type: 'bold', priority: 0 });
    }
    if (strikeMatch !== null) {
      candidates.push({ match: strikeMatch, type: 'strike', priority: 1 });
    }
    if (linkMatch !== null) {
      candidates.push({ match: linkMatch, type: 'link', priority: 2 });
    }
    if (italicMatch !== null) {
      candidates.push({ match: italicMatch, type: 'italic', priority: 3 });
    }
    if (codeMatch !== null) {
      candidates.push({ match: codeMatch, type: 'inline-code', priority: 4 });
    }

    if (candidates.length === 0) {
      tokens.push({ type: 'text', content: text.slice(pos) });
      break;
    }

    candidates.sort((a: InlineCandidate, b: InlineCandidate) => {
      if (a.match.index !== b.match.index) {
        return a.match.index - b.match.index;
      }
      return a.priority - b.priority;
    });
    const selected = candidates[0];
    const match = selected.match;

    if (match.index > pos) {
      tokens.push({ type: 'text', content: text.slice(pos, match.index) });
    }

    if (selected.type === 'bold') {
      tokens.push({ type: 'bold', content: match[1], children: parseInline(match[1]) });
    } else if (selected.type === 'strike') {
      tokens.push({ type: 'strike', content: match[1], children: parseInline(match[1]) });
    } else if (selected.type === 'link') {
      tokens.push({ type: 'link', content: match[1], url: match[2] });
    } else if (selected.type === 'italic') {
      tokens.push({ type: 'italic', content: match[1], children: parseInline(match[1]) });
    } else {
      tokens.push({ type: 'inline-code', content: match[1] });
    }

    const newPos = match.index + match[0].length;
    if (newPos <= pos) {
      break;
    }
    pos = newPos;
  }

  return tokens;
}
