import { EditorView, WidgetType } from "@codemirror/view";

export interface ParsedImageMarkdown {
  raw: string;
  alt: string;
  url: string;
  title: string;
  width: string;
  height: string;
}

// Matches ! [ alt ] ( <url> or url [ "title" ] )
const IMAGE_REGEX =
  /^!\[([\s\S]*?)\]\(\s*(?:<([^>]+)>|([^\s\)\"]+))(?:\s+["']([\s\S]*?)["'])?\s*\)$/;

/**
 * Parses markdown image syntax: ![alt|widthxheight](url "optional title")
 */
export function parseImageMarkdown(raw: string): ParsedImageMarkdown | null {
  const match = raw.match(IMAGE_REGEX);
  if (!match) return null;

  const rawAlt = match[1] || "";
  const url = match[2] || match[3] || "";
  const title = match[4] || "";

  // Parse Obsidian dimensions in alt text: "Caption|300" or "Caption|300x200" or "300"
  let alt = rawAlt;
  let width = "";
  let height = "";

  if (rawAlt.includes("|")) {
    const parts = rawAlt.split("|");
    alt = parts[0].trim();
    const dim = parts.slice(1).join("|").trim();
    if (/^\d+(?:x\d+)?$/.test(dim)) {
      if (dim.includes("x")) {
        const [w, h] = dim.split("x");
        width = w;
        height = h;
      } else {
        width = dim;
      }
    }
  } else if (/^\d+(?:x\d+)?$/.test(rawAlt.trim())) {
    const dim = rawAlt.trim();
    alt = "";
    if (dim.includes("x")) {
      const [w, h] = dim.split("x");
      width = w;
      height = h;
    } else {
      width = dim;
    }
  }

  return { raw, alt, url, title, width, height };
}

/**
 * Resolves an image URL into a viewable URL:
 * - web URLs (http/https), data URLs, and blob URLs pass through.
 * - local disk absolute paths or pent-file URLs are formatted.
 * - relative paths (./assets/...) are resolved relative to activeFilePath.
 */
export function resolveImageUrl(url: string, activeFilePath?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Remote, Data, Blob, or already pent-file
  if (/^(https?:\/\/|data:|blob:|pent-file:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  // Windows file:/// URI
  if (/^file:\/\/\//i.test(trimmed)) {
    const cleanPath = decodeURIComponent(trimmed.replace(/^file:\/\/\//i, ""));
    if (typeof window !== "undefined" && window.electronAPI?.fs?.getRawUrl) {
      return window.electronAPI.fs.getRawUrl(cleanPath);
    }
    return trimmed;
  }

  // Absolute local path (e.g. C:/photos/pic.png or /home/user/pic.png)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/")) {
    if (typeof window !== "undefined" && window.electronAPI?.fs?.getRawUrl) {
      return window.electronAPI.fs.getRawUrl(trimmed);
    }
    return `file:///${trimmed.replace(/\\/g, "/")}`;
  }

  // Relative path (e.g. ./assets/img.png or assets/img.png)
  if (activeFilePath) {
    const lastSlash = Math.max(
      activeFilePath.lastIndexOf("/"),
      activeFilePath.lastIndexOf("\\"),
    );
    if (lastSlash !== -1) {
      const parentDir = activeFilePath.slice(0, lastSlash);
      const cleanRel = trimmed.replace(/^\.[\\/]/, "");
      const combined = `${parentDir}/${cleanRel}`.replace(/\\/g, "/");
      if (typeof window !== "undefined" && window.electronAPI?.fs?.getRawUrl) {
        return window.electronAPI.fs.getRawUrl(combined);
      }
      return `file:///${combined}`;
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
