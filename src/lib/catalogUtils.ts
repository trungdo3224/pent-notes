import { ExplorerNode, NoteItem, TopLevelFolder } from "../types";

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export interface HeadingNode extends HeadingItem {
  children: HeadingNode[];
  parentId: string | null;
  depth: number;
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

export interface LinkedNoteInfo {
  note: NoteItem;
  topFolderId: string;
  topFolderName: string;
  subfolderNames: string[];
  direction: "outgoing" | "incoming" | "bidirectional";
}

export interface WorkspaceNoteOption {
  note: NoteItem;
  topFolderId: string;
  topFolderName: string;
  subfolderNames: string[];
}

export interface WorkspaceConnections {
  linkedNotes: LinkedNoteInfo[];
  linkedNoteIds: Set<string>;
  linkedSubfolderIds: Set<string>;
  linkedSubfolderCounts: Map<string, number>;
  linkedTopFolderIds: Set<string>;
  linkedTopFolderCounts: Map<string, number>;
  firstLinkedNoteByTopFolder: Map<string, string>;
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
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = rawLine.match(HEADING_LINE_REGEX);
    if (match) {
      const level = match[1].length;
      const text = match[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`~]/g, "")
        .trim();

      if (text) {
        headings.push({
          id: `h-${i + 1}-${level}-${text.slice(0, 15).replace(/\s+/g, "-")}`,
          level,
          text,
          line: i + 1,
        });
      }
    }
  }

  return headings;
}

/**
 * Builds a hierarchical tree of headings based on their markdown heading level (# = 1, ## = 2...).
 * Lower level numbers are parents of subsequent higher level numbers.
 */
export function buildHeadingTree(headings: HeadingItem[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const h of headings) {
    const node: HeadingNode = {
      ...h,
      children: [],
      parentId: null,
      depth: 0,
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      node.depth = 0;
      node.parentId = null;
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1];
      node.depth = parent.depth + 1;
      node.parentId = parent.id;
      parent.children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

export function extractTags(markdown: string): TagItem[] {
  if (!markdown) return [];
  const tagCounts = new Map<string, number>();
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
        continue;
      }
      const matchTags = trimmed.match(/^tags:\s*\[(.*)\]/);
      if (matchTags) {
        matchTags[1].split(",").forEach((rawTag) => {
          const clean = rawTag.trim().replace(/^['"#]+|['"]+$/g, "");
          if (clean) tagCounts.set(clean, (tagCounts.get(clean) || 0) + 1);
        });
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || /^#{1,6}\s+/.test(trimmed)) continue;

    const tagMatches = rawLine.match(HASHTAG_REGEX);
    if (tagMatches) {
      for (const match of tagMatches) {
        const clean = match.trim().replace(/^#/, "");
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
    if (node.type === "note") {
      for (const tagItem of extractTags(node.content)) {
        tagCounts.set(
          tagItem.tag,
          (tagCounts.get(tagItem.tag) || 0) + tagItem.count,
        );
      }
    } else if (node.type === "folder" && Array.isArray(node.children)) {
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

const NOTE_EXTENSION_REGEX = /\.(md|markdown|txt)$/i;
const EXTERNAL_PROTOCOL_REGEX = /^(https?:|mailto:|tel:|data:|javascript:)/i;

function normalizeLinkKey(raw: string): string {
  let cleaned = raw.replace(/\\+/g, "").trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep raw string if malformed URI component
  }
  cleaned = cleaned
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/|\.\.\/)+/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(NOTE_EXTENSION_REGEX, "")
    .trim()
    .toLowerCase();
  return cleaned;
}

function extractNoteLinks(markdown: string): string[] {
  if (!markdown) return [];
  const links: string[] = [];
  const seen = new Set<string>();
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 1. Obsidian-style wikilinks: [[Target]] or Milkdown escaped \[\[Target\]\]
    const wikiMatches = rawLine.matchAll(/\\?\[\\?\[([^\]]+?)\\?\]\\?\]/g);
    for (const match of wikiMatches) {
      const target = match[1]
        .replace(/\\+/g, "")
        .split("|")[0]
        .split("#")[0]
        .trim();
      if (target && !seen.has(target)) {
        seen.add(target);
        links.push(target);
      }
    }

    // 2. Standard internal markdown links: [Label](target.md) (excluding images ![...] and external URLs)
    const mdMatches = rawLine.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g);
    for (const match of mdMatches) {
      const rawHref = match[1].trim().replace(/^<|>$/g, "");
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        EXTERNAL_PROTOCOL_REGEX.test(rawHref)
      ) {
        continue;
      }
      const target = rawHref.split("#")[0].trim();
      if (target && !seen.has(target)) {
        seen.add(target);
        links.push(target);
      }
    }
  }

  return links;
}

export function appendWikiLinkToContent(
  content: string,
  targetTitle: string,
): string {
  const cleanTitle = targetTitle.trim() || "Untitled";
  const linkToken = `[[${cleanTitle}]]`;
  const trimmed = content.trimEnd();
  if (!trimmed) {
    return linkToken;
  }
  return `${trimmed}\n\n${linkToken}`;
}

export function removeWikiLinkFromContent(
  content: string,
  targetTitle: string,
): string {
  if (!content) return content;
  const targetKey = normalizeLinkKey(targetTitle);
  if (!targetKey) return content;

  const updated = content.replace(
    /\\?\[\\?\[([^\]]+?)\\?\]\\?\]/g,
    (fullMatch, inner: string) => {
      const innerKey = normalizeLinkKey(inner);
      const segments = innerKey.split("/");
      const baseKey = segments[segments.length - 1]?.trim() || "";
      if (innerKey === targetKey || baseKey === targetKey) {
        return "";
      }
      return fullMatch;
    },
  );

  return updated.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function calculateNoteStats(content: string): NoteStats {
  const chars = content.length;
  const words = countWords(content);
  const lines = content.split("\n").length;
  const readTimeMin = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  const wikiLinks = extractNoteLinks(content);

  return { chars, words, lines, readTimeMin, wikiLinks };
}

interface IndexedWorkspaceNote {
  note: NoteItem;
  topFolderId: string;
  topFolderName: string;
  ancestorSubfolderIds: string[];
  subfolderNames: string[];
  matchKeys: Set<string>;
  outgoingKeys: Set<string>;
}

function indexWorkspaceNotes(
  folders: TopLevelFolder[],
): IndexedWorkspaceNote[] {
  const indexed: IndexedWorkspaceNote[] = [];

  function walkNodes(
    nodes: ExplorerNode[],
    topFolder: TopLevelFolder,
    subfolderIds: string[],
    subfolderNames: string[],
  ) {
    for (const node of nodes) {
      if (node.type === "note") {
        const titleKey = normalizeLinkKey(node.title || "");
        const matchKeys = new Set<string>();
        if (titleKey) {
          matchKeys.add(titleKey);
          if (subfolderNames.length > 0) {
            const relPath = normalizeLinkKey(
              [...subfolderNames, titleKey].join("/"),
            );
            if (relPath) matchKeys.add(relPath);
          }
          const fullPath = normalizeLinkKey(
            [topFolder.name, ...subfolderNames, titleKey].join("/"),
          );
          if (fullPath) matchKeys.add(fullPath);
        }

        const outgoingKeys = new Set<string>();
        for (const rawLink of extractNoteLinks(node.content)) {
          const normalized = normalizeLinkKey(rawLink);
          if (normalized) {
            outgoingKeys.add(normalized);
            const segments = normalized.split("/");
            const baseKey = segments[segments.length - 1]?.trim();
            if (baseKey) {
              outgoingKeys.add(baseKey);
            }
          }
        }

        indexed.push({
          note: node,
          topFolderId: topFolder.id,
          topFolderName: topFolder.name,
          ancestorSubfolderIds: subfolderIds,
          subfolderNames,
          matchKeys,
          outgoingKeys,
        });
      } else if (node.type === "folder" && Array.isArray(node.children)) {
        walkNodes(
          node.children,
          topFolder,
          [...subfolderIds, node.id],
          [...subfolderNames, node.name],
        );
      }
    }
  }

  for (const topFolder of folders) {
    if (Array.isArray(topFolder.items)) {
      walkNodes(topFolder.items, topFolder, [], []);
    }
  }

  return indexed;
}

export function listConnectableNotes(
  folders: TopLevelFolder[],
  excludeNoteId: string | null,
): WorkspaceNoteOption[] {
  return indexWorkspaceNotes(folders)
    .filter((item) => item.note.id !== excludeNoteId)
    .map((item) => ({
      note: item.note,
      topFolderId: item.topFolderId,
      topFolderName: item.topFolderName,
      subfolderNames: item.subfolderNames,
    }));
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

export function resolveWorkspaceConnections(
  folders: TopLevelFolder[],
  activeNoteId: string | null,
  activeContent?: string,
): WorkspaceConnections {
  const empty: WorkspaceConnections = {
    linkedNotes: [],
    linkedNoteIds: new Set(),
    linkedSubfolderIds: new Set(),
    linkedSubfolderCounts: new Map(),
    linkedTopFolderIds: new Set(),
    linkedTopFolderCounts: new Map(),
    firstLinkedNoteByTopFolder: new Map(),
  };

  if (!activeNoteId || folders.length === 0) {
    return empty;
  }

  const allNotes = indexWorkspaceNotes(folders);
  const activeIndexed = allNotes.find((item) => item.note.id === activeNoteId);
  if (!activeIndexed) {
    return empty;
  }

  if (activeContent !== undefined) {
    activeIndexed.outgoingKeys.clear();
    const links = extractNoteLinks(activeContent);
    for (const raw of links) {
      const linkKey = normalizeLinkKey(raw);
      if (linkKey) {
        activeIndexed.outgoingKeys.add(linkKey);
        const segments = linkKey.split("/");
        const baseKey = segments[segments.length - 1]?.trim();
        if (baseKey) {
          activeIndexed.outgoingKeys.add(baseKey);
        }
      }
    }
  }

  for (const candidate of allNotes) {
    if (candidate.note.id === activeNoteId) continue;

    const activeLinksToCandidate = setsIntersect(
      activeIndexed.outgoingKeys,
      candidate.matchKeys,
    );
    const candidateLinksToActive = setsIntersect(
      candidate.outgoingKeys,
      activeIndexed.matchKeys,
    );

    if (activeLinksToCandidate || candidateLinksToActive) {
      const direction: LinkedNoteInfo["direction"] =
        activeLinksToCandidate && candidateLinksToActive
          ? "bidirectional"
          : activeLinksToCandidate
            ? "outgoing"
            : "incoming";

      empty.linkedNotes.push({
        note: candidate.note,
        topFolderId: candidate.topFolderId,
        topFolderName: candidate.topFolderName,
        subfolderNames: candidate.subfolderNames,
        direction,
      });

      empty.linkedNoteIds.add(candidate.note.id);

      empty.linkedTopFolderIds.add(candidate.topFolderId);
      empty.linkedTopFolderCounts.set(
        candidate.topFolderId,
        (empty.linkedTopFolderCounts.get(candidate.topFolderId) ?? 0) + 1,
      );
      if (!empty.firstLinkedNoteByTopFolder.has(candidate.topFolderId)) {
        empty.firstLinkedNoteByTopFolder.set(
          candidate.topFolderId,
          candidate.note.id,
        );
      }

      for (const subfolderId of candidate.ancestorSubfolderIds) {
        empty.linkedSubfolderIds.add(subfolderId);
        empty.linkedSubfolderCounts.set(
          subfolderId,
          (empty.linkedSubfolderCounts.get(subfolderId) ?? 0) + 1,
        );
      }
    }
  }

  return empty;
}

export function scrollToHeading(headingText: string, level: number): boolean {
  if (typeof document === "undefined") return false;

  const targetTag = `H${level}`;
  const cleanTarget = headingText.trim().toLowerCase();

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".editor-pane h1, .editor-pane h2, .editor-pane h3, .editor-pane h4, .editor-pane h5, .editor-pane h6",
    ),
  );

  const exactMatch = elements.find(
    (el) =>
      el.tagName === targetTag &&
      el.textContent?.trim().toLowerCase() === cleanTarget,
  );
  const foundEl =
    exactMatch ??
    elements.find((el) =>
      el.textContent?.trim().toLowerCase().includes(cleanTarget),
    ) ??
    null;

  if (foundEl) {
    foundEl.scrollIntoView({ behavior: "smooth", block: "center" });
    foundEl.classList.add("heading-jump-highlight");
    setTimeout(() => {
      foundEl.classList.remove("heading-jump-highlight");
    }, HEADING_HIGHLIGHT_DURATION_MS);
    return true;
  }

  const textarea =
    document.querySelector<HTMLTextAreaElement>(".editor-textarea");
  if (textarea) {
    const val = textarea.value;
    const prefix = `${"#".repeat(level)} `;
    let idx = val.indexOf(prefix + headingText);
    if (idx === -1) idx = val.indexOf(headingText);
    if (idx !== -1) {
      textarea.focus();
      textarea.setSelectionRange(idx, idx + headingText.length);
      const linesBefore = val.slice(0, idx).split("\n").length;
      textarea.scrollTop = Math.max(
        0,
        (linesBefore - 3) * TEXTAREA_LINE_HEIGHT_PX,
      );
      return true;
    }
  }

  return false;
}
