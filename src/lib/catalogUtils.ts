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

const WORDS_PER_MINUTE = 200;
const HEADING_HIGHLIGHT_DURATION_MS = 1800;
const TEXTAREA_LINE_HEIGHT_PX = 24;
const HEX_COLOR_REGEX = /^[0-9a-fA-F]{3,6}$/;
const HASHTAG_REGEX = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_\-\/]*)/g;
const HEADING_LINE_REGEX = /^(#{1,6})\s+(.+)$/;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function mapToSortedTagItems(tagCounts: Map<string, number>): TagItem[] {
  const results: TagItem[] = [];
  tagCounts.forEach((count, tag) => {
    results.push({ tag, count });
  });
  results.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return results;
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

    const match = rawLine.match(HEADING_LINE_REGEX);
    if (match) {
      const level = match[1].length;
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
        matchTags[1].split(',').forEach((rawTag) => {
          const clean = rawTag.trim().replace(/^['"#]+|['"]+$/g, '');
          if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
        });
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || /^#{1,6}\s+/.test(trimmed)) continue;

    const tagMatches = rawLine.match(HASHTAG_REGEX);
    if (tagMatches) {
      for (const match of tagMatches) {
        const clean = match.trim().replace(/^#/, '');
        if (HEX_COLOR_REGEX.test(clean)) continue;
        tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
      }
    }
  }

  return mapToSortedTagItems(tagCounts);
}

export function extractAllWorkspaceTags(folders: TopLevelFolder[]): TagItem[] {
  const tagCounts = new Map<string, number>();

  function scanNode(node: ExplorerNode) {
    if (node.type === 'note') {
      for (const tagItem of extractTags(node.content)) {
        tagCounts.set(tagItem.tag, (tagCounts.get(tagItem.tag) || 0) + tagItem.count);
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

  return mapToSortedTagItems(tagCounts);
}

export function calculateNoteStats(content: string): NoteStats {
  const chars = content.length;
  const words = countWords(content);
  const lines = content.split('\n').length;
  const readTimeMin = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

  const wikiLinks: string[] = [];
  const wikiMatches = content.match(/\[\[(.*?)\]\]/g);
  if (wikiMatches) {
    for (const match of wikiMatches) {
      const target = match.slice(2, -2).split('|')[0].trim();
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

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.editor-pane h1, .editor-pane h2, .editor-pane h3, .editor-pane h4, .editor-pane h5, .editor-pane h6'
    )
  );

  const exactMatch = elements.find(
    (el) => el.tagName === targetTag && el.textContent?.trim().toLowerCase() === cleanTarget
  );
  const foundEl =
    exactMatch ??
    elements.find((el) => el.textContent?.trim().toLowerCase().includes(cleanTarget)) ??
    null;

  if (foundEl) {
    foundEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    foundEl.classList.add('heading-jump-highlight');
    setTimeout(() => {
      foundEl.classList.remove('heading-jump-highlight');
    }, HEADING_HIGHLIGHT_DURATION_MS);
    return true;
  }

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
      textarea.scrollTop = Math.max(0, (linesBefore - 3) * TEXTAREA_LINE_HEIGHT_PX);
      return true;
    }
  }

  return false;
}
