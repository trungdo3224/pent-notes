import { ExplorerNode, FolderItem, NoteItem } from "../types";

export const NOTE_FILE_ACCEPT =
  ".md,.markdown,.mdx,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.ico,.avif," +
  ".py,.js,.jsx,.ts,.tsx,.sh,.bash,.zsh,.ps1,.bat,.cmd,.sql,.rs,.go,.c,.cpp,.h,.hpp,.cs," +
  ".java,.kt,.php,.rb,.lua,.json,.yaml,.yml,.toml,.xml,.css,.scss,.html," +
  ".ini,.conf,.cfg,.env,.properties,.vue,.svelte,.astro,.swift,.dart,.r";
const NOTE_EXT_REGEX =
  /\.(md|markdown|mdx|txt|pdf|png|jpe?g|gif|webp|svg|bmp|ico|avif|py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const CODE_EXT_REGEX =
  /\.(py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;

export const CODE_EXTENSIONS = new Set([
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "rs",
  "go",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "java",
  "kt",
  "php",
  "rb",
  "lua",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "css",
  "scss",
  "html",
  "ini",
  "conf",
  "cfg",
  "env",
  "properties",
  "vue",
  "svelte",
  "astro",
  "swift",
  "dart",
  "r",
]);

const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__",
]);

export function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileDateString(file: File): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toISOString().slice(0, 10);
  }
  return todayDateString();
}

function stripNoteExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdx|txt)$/i, "").trim() || "Untitled";
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "Untitled";
}

function isSupportedNoteFile(fileName: string): boolean {
  return NOTE_EXT_REGEX.test(fileName);
}

function isPdfFileName(fileName?: string): boolean {
  return Boolean(fileName?.toLowerCase().endsWith(".pdf"));
}

function isImageFileName(fileName?: string): boolean {
  return Boolean(fileName && IMAGE_EXT_REGEX.test(fileName));
}

export function isCodeFileName(fileName?: string): boolean {
  return Boolean(fileName && CODE_EXT_REGEX.test(fileName));
}

export function isPdfNote(
  note: Pick<NoteItem, "fileType" | "filePath" | "pdfData"> & {
    title?: string;
  },
): boolean {
  return Boolean(
    note.fileType === "pdf" ||
    isPdfFileName(note.filePath) ||
    isPdfFileName(note.title) ||
    note.pdfData,
  );
}

export function isImageNote(
  note: Pick<NoteItem, "fileType" | "filePath" | "imageData"> & {
    title?: string;
  },
): boolean {
  return Boolean(
    note.fileType === "image" ||
    isImageFileName(note.filePath) ||
    isImageFileName(note.title) ||
    note.imageData,
  );
}

export function isCodeNote(
  note: Pick<NoteItem, "fileType" | "filePath"> & { title?: string },
): boolean {
  return Boolean(
    note.fileType === "code" ||
    isCodeFileName(note.filePath) ||
    isCodeFileName(note.title),
  );
}

export function getCodeLanguageLabel(filePathOrTitle?: string): string {
  if (!filePathOrTitle) return "CODE";
  const match = filePathOrTitle.match(/\.([a-z0-9_-]+)$/i);
  if (!match) return "CODE";
  const ext = match[1].toLowerCase();
  switch (ext) {
    case "py":
      return "PYTHON";
    case "js":
    case "jsx":
      return "JAVASCRIPT";
    case "ts":
    case "tsx":
      return "TYPESCRIPT";
    case "sh":
    case "bash":
    case "zsh":
      return "SHELL";
    case "ps1":
      return "POWERSHELL";
    case "bat":
    case "cmd":
      return "BATCH";
    case "sql":
      return "SQL";
    case "rs":
      return "RUST";
    case "go":
      return "GO";
    case "c":
      return "C";
    case "cpp":
    case "hpp":
    case "h":
      return "C++";
    case "cs":
      return "C#";
    case "java":
      return "JAVA";
    case "kt":
      return "KOTLIN";
    case "php":
      return "PHP";
    case "rb":
      return "RUBY";
    case "lua":
      return "LUA";
    case "json":
      return "JSON";
    case "yaml":
    case "yml":
      return "YAML";
    case "toml":
      return "TOML";
    case "xml":
      return "XML";
    case "css":
    case "scss":
      return "CSS";
    case "html":
      return "HTML";
    case "vue":
      return "VUE";
    case "svelte":
      return "SVELTE";
    case "astro":
      return "ASTRO";
    case "swift":
      return "SWIFT";
    case "dart":
      return "DART";
    case "r":
      return "R";
    case "ini":
    case "conf":
    case "cfg":
    case "env":
    case "properties":
      return "CONFIG";
    default:
      return ext.toUpperCase();
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function buildNoteItemFromFile(file: File): Promise<NoteItem> {
  const isPdf = isPdfFileName(file.name);
  const isImage = !isPdf && isImageFileName(file.name);
  const isCode = !isPdf && !isImage && isCodeFileName(file.name);
  const pdfData = isPdf ? await readFileAsDataUrl(file) : undefined;
  const imageData = isImage ? await readFileAsDataUrl(file) : undefined;
  const content = isPdf || isImage ? "" : await file.text();

  return {
    id: createId("note"),
    type: "note",
    title: isCode ? file.name : stripNoteExtension(file.name),
    content,
    fileType: isPdf ? "pdf" : isImage ? "image" : isCode ? "code" : "markdown",
    pdfData,
    imageData,
    updatedAt: fileDateString(file),
  };
}

export async function buildNoteItemsFromFiles(
  files: File[],
): Promise<NoteItem[]> {
  const results: NoteItem[] = [];
  for (const file of files) {
    results.push(await buildNoteItemFromFile(file));
  }
  return results;
}

function ensureFolderPathInTree(
  container: ExplorerNode[],
  segments: string[],
): ExplorerNode[] {
  let currentLevel = container;
  for (const segment of segments) {
    let existingFolder = currentLevel.find(
      (node): node is FolderItem =>
        node.type === "folder" && node.name === segment,
    );
    if (!existingFolder) {
      existingFolder = {
        id: createId("sub"),
        type: "folder",
        name: segment,
        children: [],
      };
      currentLevel.push(existingFolder);
    }
    currentLevel = existingFolder.children;
  }
  return currentLevel;
}

export async function buildExplorerTreeFromFiles(
  files: File[],
  customRootName?: string,
): Promise<{ rootName: string; items: ExplorerNode[] }> {
  const firstRelativePath = (
    files[0]?.webkitRelativePath ||
    files[0]?.name ||
    ""
  ).replace(/\\/g, "/");
  const firstParts = firstRelativePath.split("/").filter(Boolean);
  const detectedRoot =
    firstParts.length > 1 ? firstParts[0] : "Imported Folder";
  const rootName = customRootName?.trim() || detectedRoot;

  const rootItems: ExplorerNode[] = [];

  for (const file of files) {
    const relativePath = (file.webkitRelativePath || file.name).replace(
      /\\/g,
      "/",
    );
    const parts = relativePath.split("/").filter(Boolean);
    const innerParts = parts.length > 1 ? parts.slice(1) : parts;

    if (
      innerParts.some(
        (seg) => seg.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(seg),
      )
    ) {
      continue;
    }

    const fileName = innerParts[innerParts.length - 1];
    if (!isSupportedNoteFile(fileName)) {
      continue;
    }

    const targetContainer = ensureFolderPathInTree(
      rootItems,
      innerParts.slice(0, -1),
    );
    const noteItem = await buildNoteItemFromFile(file);
    targetContainer.push(noteItem);
  }

  return { rootName, items: rootItems };
}
