import { EditorView, WidgetType } from "@codemirror/view";

export interface ParsedImageMarkdown {
  raw: string;
  alt: string;
  url: string;
  title: string;
  width: string;
  height: string;
}

export interface LineImageMatch {
  fromOffset: number;
  toOffset: number;
  parsed: ParsedImageMarkdown;
}

const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const WIKI_IMAGE_EXACT_REGEX = /^!\[\[([^\[\]\r\n]+)\]\]$/;
const MD_IMAGE_EXACT_REGEX = /^!\[([\s\S]*?)\]\(([\s\S]+)\)$/;
const HTML_IMG_EXACT_REGEX = /^<img\b([\s\S]*?)\/?>$/i;
const LINE_IMAGE_SCAN_REGEX =
  /!\[\[[^\[\]\r\n]+\]\]|!\[[^\]\r\n]*\]\((?:<[^>\r\n]+>|[^()\r\n]*(?:\([^()\r\n]*\)[^()\r\n]*)*)\)|<img\b(?:[^>"'\r\n]|"[^"\r\n]*"|'[^'\r\n]*')*\/?>/gi;

function parseDimensions(
  rawDim: string,
): { width: string; height: string } | null {
  const match = rawDim.trim().match(/^(\d+)(?:x(\d+))?$/);
  if (!match) return null;
  return { width: match[1], height: match[2] || "" };
}

function parseAltAndDimensions(rawAlt: string): {
  alt: string;
  width: string;
  height: string;
} {
  if (rawAlt.includes("|")) {
    const parts = rawAlt.split("|");
    const dim = parseDimensions(parts.slice(1).join("|"));
    if (dim) {
      return {
        alt: parts[0].trim(),
        width: dim.width,
        height: dim.height,
      };
    }
  }

  const directDim = parseDimensions(rawAlt);
  if (directDim) {
    return {
      alt: "",
      width: directDim.width,
      height: directDim.height,
    };
  }

  return { alt: rawAlt, width: "", height: "" };
}

function parseWikiImageEmbed(raw: string): ParsedImageMarkdown | null {
  const match = raw.match(WIKI_IMAGE_EXACT_REGEX);
  if (!match) return null;

  const parts = match[1].split("|").map((part) => part.trim());
  const url = parts[0].split("#")[0].trim();
  if (!url || !IMAGE_FILE_EXT_REGEX.test(url)) return null;

  let alt = "";
  let width = "";
  let height = "";

  if (parts.length === 2) {
    const dim = parseDimensions(parts[1]);
    if (dim) {
      width = dim.width;
      height = dim.height;
    } else {
      alt = parts[1];
    }
  } else if (parts.length >= 3) {
    const lastDim = parseDimensions(parts[parts.length - 1]);
    if (lastDim) {
      alt = parts.slice(1, -1).join("|").trim();
      width = lastDim.width;
      height = lastDim.height;
    } else {
      alt = parts.slice(1).join("|").trim();
    }
  }

  return { raw, alt, url, title: "", width, height };
}

function parseStandardImageMarkdown(raw: string): ParsedImageMarkdown | null {
  const match = raw.match(MD_IMAGE_EXACT_REGEX);
  if (!match) return null;

  const rawAlt = match[1] || "";
  let targetAndTitle = (match[2] || "").trim();
  if (!targetAndTitle || /[\r\n]/.test(targetAndTitle)) return null;

  let title = "";
  const titleMatch = targetAndTitle.match(/^(.*?)\s+["']([\s\S]*?)["']$/);
  if (titleMatch && titleMatch[1].trim()) {
    targetAndTitle = titleMatch[1].trim();
    title = titleMatch[2] || "";
  }

  const url =
    targetAndTitle.startsWith("<") && targetAndTitle.endsWith(">")
      ? targetAndTitle.slice(1, -1).trim()
      : targetAndTitle;

  if (!url) return null;

  const { alt, width, height } = parseAltAndDimensions(rawAlt);
  return { raw, alt, url, title, width, height };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractHtmlAttribute(attrs: string, attrName: string): string {
  const regex = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` +
      "`" +
      `]+))`,
    "i",
  );
  const match = attrs.match(regex);
  if (!match) return "";
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function parseHtmlImageTag(raw: string): ParsedImageMarkdown | null {
  const match = raw.match(HTML_IMG_EXACT_REGEX);
  if (!match) return null;

  const attrs = match[1] || "";
  const url = decodeHtmlEntities(extractHtmlAttribute(attrs, "src").trim());
  if (!url) return null;

  const alt = decodeHtmlEntities(extractHtmlAttribute(attrs, "alt").trim());
  const title = decodeHtmlEntities(extractHtmlAttribute(attrs, "title").trim());
  let width = extractHtmlAttribute(attrs, "width").trim();
  let height = extractHtmlAttribute(attrs, "height").trim();

  if (!width || !height) {
    const style = extractHtmlAttribute(attrs, "style");
    if (style) {
      if (!width) {
        const wMatch = style.match(/(?:^|;\s*)width\s*:\s*([^;]+)/i);
        if (wMatch) width = wMatch[1].trim();
      }
      if (!height) {
        const hMatch = style.match(/(?:^|;\s*)height\s*:\s*([^;]+)/i);
        if (hMatch) height = hMatch[1].trim();
      }
    }
  }

  return { raw, alt, url, title, width, height };
}

/**
 * Parses markdown (`![alt|widthxheight](url "title")`), Obsidian (`![[image.png|300]]`),
 * and HTML (`<img src="..." alt="...">`) image syntax.
 */
export function parseImageMarkdown(raw: string): ParsedImageMarkdown | null {
  return (
    parseWikiImageEmbed(raw) ??
    parseStandardImageMarkdown(raw) ??
    parseHtmlImageTag(raw)
  );
}

/**
 * Finds all valid markdown, wiki-embed, or HTML <img> occurrences on a single line.
 */
export function findLineImageMatches(lineText: string): LineImageMatch[] {
  if (!lineText.includes("![") && !/<img\b/i.test(lineText)) return [];

  const matches: LineImageMatch[] = [];
  LINE_IMAGE_SCAN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LINE_IMAGE_SCAN_REGEX.exec(lineText)) !== null) {
    const raw = match[0];
    const parsed = parseImageMarkdown(raw);
    if (parsed && parsed.url) {
      matches.push({
        fromOffset: match.index,
        toOffset: match.index + raw.length,
        parsed,
      });
    }
  }

  return matches;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function joinRelativePath(baseDir: string, relativePath: string): string {
  const normalizedBase = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const baseSegments = normalizedBase.split("/");
  const relSegments = relativePath.replace(/\\/g, "/").split("/");

  for (const segment of relSegments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (baseSegments.length > 1) {
        baseSegments.pop();
      }
      continue;
    }
    baseSegments.push(segment);
  }

  return baseSegments.join("/");
}

function toLocalRawUrl(filePath: string): string {
  if (typeof window !== "undefined" && window.electronAPI?.fs?.getRawUrl) {
    return window.electronAPI.fs.getRawUrl(filePath);
  }
  return `/api/fs/raw?path=${encodeURIComponent(filePath)}`;
}

/**
 * Resolves an image URL into a viewable URL:
 * - web URLs (http/https), data URLs, and blob URLs pass through.
 * - local disk absolute paths or pent-file URLs are formatted.
 * - relative paths and bare filenames are resolved relative to activeFilePath.
 */
export function resolveImageUrl(url: string, activeFilePath?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  if (
    /^(https?:\/\/|data:|blob:|pent-file:\/\/|\/api\/fs\/raw\?)/i.test(trimmed)
  ) {
    return trimmed;
  }

  if (/^file:\/\/\//i.test(trimmed)) {
    const cleanPath = safeDecodeURIComponent(
      trimmed.replace(/^file:\/\/\//i, ""),
    );
    return toLocalRawUrl(cleanPath);
  }

  const isWindowsActiveFile = Boolean(
    activeFilePath && /^[a-zA-Z]:[\\/]/.test(activeFilePath),
  );
  if (
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    (trimmed.startsWith("/") && !isWindowsActiveFile)
  ) {
    return toLocalRawUrl(safeDecodeURIComponent(trimmed));
  }

  if (activeFilePath) {
    const lastSlash = Math.max(
      activeFilePath.lastIndexOf("/"),
      activeFilePath.lastIndexOf("\\"),
    );
    if (lastSlash !== -1) {
      const parentDir = activeFilePath.slice(0, lastSlash);
      const decodedRel = safeDecodeURIComponent(trimmed);
      const combined = joinRelativePath(parentDir, decodedRel);
      return toLocalRawUrl(combined);
    }
  }

  return trimmed;
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly rawText: string,
    readonly url: string,
    readonly resolvedUrl: string,
    readonly alt: string,
    readonly title: string,
    readonly width: string,
    readonly height: string,
    readonly from: number,
    readonly to: number,
    readonly isBlock: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.rawText === this.rawText &&
      other.resolvedUrl === this.resolvedUrl &&
      other.alt === this.alt &&
      other.title === this.title &&
      other.width === this.width &&
      other.height === this.height &&
      other.from === this.from &&
      other.to === this.to &&
      other.isBlock === this.isBlock
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("figure");
    container.className = `cm-image-container ${this.isBlock ? "is-block" : "is-inline"}`;

    const wrapper = document.createElement("div");
    wrapper.className = "cm-image-wrap";

    const img = document.createElement("img");
    img.className = "cm-image-img";
    img.src = this.resolvedUrl;
    img.alt = this.alt;
    img.title = this.title || this.alt;
    img.loading = "lazy";
    img.decoding = "async";

    if (this.width) {
      const wVal = /^\d+$/.test(this.width) ? `${this.width}px` : this.width;
      img.style.maxWidth = wVal;
      img.style.width = wVal;
    }
    if (this.height) {
      const hVal = /^\d+$/.test(this.height) ? `${this.height}px` : this.height;
      img.style.height = hVal;
    }

    // Floating action toolbar on hover
    const toolbar = document.createElement("div");
    toolbar.className = "cm-image-toolbar";

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "cm-image-btn cm-image-edit-btn";
    editBtn.title = "Edit markdown image";
    editBtn.setAttribute("aria-label", "Edit markdown");
    editBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      </svg>
      <span>Edit</span>
    `;
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from + 2, head: this.from + 2 },
        scrollIntoView: true,
      });
      view.focus();
    });

    // Copy link button
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "cm-image-btn";
    copyBtn.title = "Copy image source URL";
    copyBtn.setAttribute("aria-label", "Copy URL");
    copyBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    `;
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(this.url).then(() => {
          copyBtn.classList.add("is-copied");
          setTimeout(() => copyBtn.classList.remove("is-copied"), 1800);
        });
      }
    });

    toolbar.appendChild(editBtn);
    toolbar.appendChild(copyBtn);

    wrapper.appendChild(img);
    wrapper.appendChild(toolbar);
    container.appendChild(wrapper);

    // Caption for block images with alt text
    if (this.alt && this.isBlock) {
      const caption = document.createElement("figcaption");
      caption.className = "cm-image-caption";
      caption.textContent = this.alt;
      container.appendChild(caption);
    }

    // Graceful error state for broken image paths
    img.addEventListener("error", () => {
      wrapper.innerHTML = "";
      const errorCard = document.createElement("div");
      errorCard.className = "cm-image-error";

      const errText = document.createElement("span");
      errText.className = "cm-image-error-text";
      errText.textContent = `Unable to load image: ${this.alt || this.url}`;

      const fixBtn = document.createElement("button");
      fixBtn.type = "button";
      fixBtn.className = "cm-image-fix-btn";
      fixBtn.textContent = "Edit Link";
      fixBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        view.dispatch({
          selection: { anchor: this.from + 2, head: this.from + 2 },
          scrollIntoView: true,
        });
        view.focus();
      });

      errorCard.appendChild(errText);
      errorCard.appendChild(fixBtn);
      wrapper.appendChild(errorCard);
    });

    return container;
  }
}
