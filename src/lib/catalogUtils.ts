import { ExplorerNode, TopLevelFolder } from '../types';

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export interface TagItem {
  tag: string;
  count: number;
}

export interface NoteStats {
  chars: number;
  words: number;
  lines: number;
  readTimeMin: number;
  wikiLinks: string[];
}

export function extractHeadings(markdown: string): HeadingItem[] {
  if (!markdown) return [];
  const headings: HeadingItem[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      // Strip markdown bold, italics, inline code, links
      const text = match[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim();

      if (text) {
        headings.push({
          id: `h-${i + 1}-${level}-${text.slice(0, 15).replace(/\s+/g, '-')}`,
          level,
          text,
          line: i + 1,
        });
      }
    }
  }

  return headings;
}

export function extractTags(markdown: string): TagItem[] {
  if (!markdown) return [];
  const tagCounts = new Map<string, number>();
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check frontmatter
    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false;
        continue;
      }
      const matchTags = trimmed.match(/^tags:\s*\[(.*)\]/);
      if (matchTags) {
        matchTags[1].split(',').forEach((t) => {
          const clean = t.trim().replace(/^['"#]+|['"]+$/g, '');
          if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
        });
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip markdown headings
    if (/^#{1,6}\s+/.test(trimmed)) continue;

    // Match hashtags: #tag, #active-directory, #sqli
    const tagMatches = rawLine.match(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_\-\/]*)/g);
    if (tagMatches) {
      for (const m of tagMatches) {
        const clean = m.trim().replace(/^#/, '');
        // Ignore hex color codes (e.g., #fff, #1a2b3c)
        if (/^[0-9a-fA-F]{3,6}$/.test(clean)) continue;
        tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
      }
    }
  }

  const results: TagItem[] = [];
  tagCounts.forEach((count, tag) => {
    results.push({ tag, count });
  });
  results.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return results;
}

export function extractAllWorkspaceTags(folders: TopLevelFolder[]): TagItem[] {
  const tagCounts = new Map<string, number>();

  function scanNode(node: ExplorerNode) {
    if (node.type === 'note') {
      const noteTags = extractTags(node.content);
      for (const t of noteTags) {
        tagCounts.set(t.tag, (tagCounts.get(t.tag) || 0) + t.count);
      }
    } else if (node.type === 'folder' && Array.isArray(node.children)) {
      for (const child of node.children) {
        scanNode(child);
      }
    }
  }

  for (const folder of folders) {
    if (Array.isArray(folder.items)) {
      for (const item of folder.items) {
        scanNode(item);
      }
    }
  }

  const results: TagItem[] = [];
  tagCounts.forEach((count, tag) => {
    results.push({ tag, count });
  });
  results.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return results;
}

export function calculateNoteStats(content: string): NoteStats {
  const chars = content.length;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lines = content.split('\n').length;
  const readTimeMin = Math.max(1, Math.ceil(words / 200));

  const wikiLinks: string[] = [];
  const wikiMatches = content.match(/\[\[(.*?)\]\]/g);
  if (wikiMatches) {
    for (const m of wikiMatches) {
      const target = m.slice(2, -2).split('|')[0].trim();
      if (target && !wikiLinks.includes(target)) {
        wikiLinks.push(target);
      }
    }
  }

  return { chars, words, lines, readTimeMin, wikiLinks };
}

export function scrollToHeading(headingText: string, level: number): boolean {
  if (typeof document === 'undefined') return false;

  const targetTag = `H${level}`;
  const cleanTarget = headingText.trim().toLowerCase();

  // Look in editor-pane or milkdown preview
  const elements = document.querySelectorAll(
    '.editor-pane h1, .editor-pane h2, .editor-pane h3, .editor-pane h4, .editor-pane h5, .editor-pane h6'
  );

  let foundEl: HTMLElement | null = null;
  for (const el of Array.from(elements)) {
    if (el.tagName === targetTag && el.textContent?.trim().toLowerCase() === cleanTarget) {
      foundEl = el as HTMLElement;
      break;
    }
  }

  // Fallback: match without level requirement
  if (!foundEl) {
    for (const el of Array.from(elements)) {
      if (el.textContent?.trim().toLowerCase().includes(cleanTarget)) {
        foundEl = el as HTMLElement;
        break;
      }
    }
  }

  if (foundEl) {
    foundEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    foundEl.classList.add('heading-jump-highlight');
    setTimeout(() => {
      foundEl?.classList.remove('heading-jump-highlight');
    }, 1800);
    return true;
  }

  // Fallback for textarea (write mode)
  const textarea = document.querySelector<HTMLTextAreaElement>('.editor-textarea');
  if (textarea) {
    const val = textarea.value;
    const prefix = `${'#'.repeat(level)} `;
    let idx = val.indexOf(prefix + headingText);
    if (idx === -1) idx = val.indexOf(headingText);
    if (idx !== -1) {
      textarea.focus();
      textarea.setSelectionRange(idx, idx + headingText.length);
      const linesBefore = val.slice(0, idx).split('\n').length;
      textarea.scrollTop = Math.max(0, (linesBefore - 3) * 24);
      return true;
    }
  }

  return false;
}

