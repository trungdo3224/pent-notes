import fs from "node:fs/promises";
import path from "node:path";

/**
 * RFC-042: Low-Footprint Architecture & Memory Optimization
 * - Decoupled Metadata Index (does NOT load raw file contents into store)
 * - Shallow Traversal (depth: 1, loads subdirectories on demand)
 * - Strict Watcher / Scanner Ignore List
 */

const NOTE_EXT_REGEX =
  /\.(md|markdown|mdx|txt|pdf|png|jpe?g|gif|webp|svg|bmp|ico|avif|py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const CODE_EXT_REGEX =
  /\.(py|jsx?|tsx?|sh|bash|zsh|ps1|bat|cmd|sql|rs|go|c|cpp|h|hpp|cs|java|kt|php|rb|lua|json|ya?ml|toml|xml|s?css|html|ini|conf|cfg|env|properties|vue|svelte|astro|swift|dart|r)$/i;

const COMMON_DOTFILES = new Set([
  ".env",
  ".env.local",
  ".env.example",
  ".gitignore",
  ".bashrc",
  ".zshrc",
]);

const STRICT_IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "__pycache__",
  ".svn",
  ".hg",
]);

const STRICT_IGNORE_EXTENSIONS = new Set([
  "zip",
  "tar",
  "gz",
  "iso",
  "pcap",
  "exe",
  "bin",
  "7z",
  "rar",
  "dmg",
  "pkg",
]);

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripExt(name) {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, "").trim() || "Untitled";
}

function isStrictlyIgnored(name) {
  if (name.startsWith(".") && !COMMON_DOTFILES.has(name.toLowerCase())) {
    return true;
  }
  if (STRICT_IGNORE_NAMES.has(name)) return true;
  const ext = path.extname(name).slice(1).toLowerCase();
  if (STRICT_IGNORE_EXTENSIONS.has(ext)) return true;
  return false;
}

async function resolveUniqueChildPath(parentDir, baseName, extension = "") {
  let candidate = path.join(parentDir, `${baseName}${extension}`);
  let counter = 1;
  while (true) {
    try {
      await fs.stat(candidate);
      candidate = path.join(parentDir, `${baseName} (${counter})${extension}`);
      counter++;
    } catch {
      return candidate;
    }
  }
}

/**
 * Shallow directory read (Depth: 1)
 * Extracts lightweight metadata only. Does NOT read file contents into memory.
 */
export async function readDirectoryShallow(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders = [];
  const notes = [];

  for (const entry of entries) {
    if (isStrictlyIgnored(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      let hasChildren = false;
      try {
        const subEntries = await fs.readdir(fullPath);
        hasChildren = subEntries.some((name) => !isStrictlyIgnored(name));
      } catch {
        hasChildren = false;
      }

      folders.push({
        id: makeId("sub"),
        type: "folder",
        name: entry.name,
        hasChildren,
        children: [],
        folderPath: fullPath,
      });
    } else if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      NOTE_EXT_REGEX.test(entry.name)
    ) {
      const isPdf = entry.name.toLowerCase().endsWith(".pdf");
      const isImage = !isPdf && IMAGE_EXT_REGEX.test(entry.name);
      const isCode = !isPdf && !isImage && CODE_EXT_REGEX.test(entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        notes.push({
          id: makeId("note"),
          type: "note",
          title: isCode ? entry.name : stripExt(entry.name),
          content: "", // Lazy: Content read on demand via readFile()
          updatedAt: stat.mtime.toISOString().slice(0, 10),
          filePath: fullPath,
          fileType: isPdf
            ? "pdf"
            : isImage
              ? "image"
              : isCode
                ? "code"
                : "markdown",
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  notes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return [...folders, ...notes];
}

/**
 * Scans a folder shallowly (Depth: 1) for rapid startup with zero memory scaling.
 */
export async function scanFolder(folderPath) {
  const resolved = path.resolve(folderPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory.");
  }
  const items = await readDirectoryShallow(resolved);
  const rootName = path.basename(resolved) || "Notes";
  return { rootName, rootPath: resolved, items };
}

/**
 * On-demand file content read strictly when opened in an active editor tab.
 */
export async function readFile(filePath) {
  const resolved = path.resolve(filePath);
  const content = await fs.readFile(resolved, "utf-8");
  return content;
}

export async function writeFile(filePath, content) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content ?? "", "utf-8");
  return { ok: true, path: resolved };
}

export async function createFile(parentPath, name, content = "") {
  const rawFileName =
    name && typeof name === "string" ? name.trim() : "Untitled Note";
  const resolvedParent = path.resolve(parentPath);
  await fs.mkdir(resolvedParent, { recursive: true });

  const isCode = CODE_EXT_REGEX.test(rawFileName);
  let targetFile;
  let fileType = "markdown";
  let title = "";

  if (isCode) {
    const ext = path.extname(rawFileName);
    const base = path.basename(rawFileName, ext);
    targetFile = await resolveUniqueChildPath(resolvedParent, base, ext);
    fileType = "code";
    title = path.basename(targetFile);
  } else {
    const baseName = stripExt(rawFileName);
    targetFile = await resolveUniqueChildPath(resolvedParent, baseName, ".md");
    fileType = "markdown";
    title = stripExt(path.basename(targetFile));
  }

  const initialContent = content || "";
  await fs.writeFile(targetFile, initialContent, "utf-8");

  return {
    id: makeId("note"),
    type: "note",
    title,
    content: initialContent,
    updatedAt: new Date().toISOString().slice(0, 10),
    filePath: targetFile,
    fileType,
  };
}

export async function createFolder(parentPath, name) {
  const folderName =
    name && typeof name === "string" ? name.trim() : "New Folder";
  const resolvedParent = path.resolve(parentPath);
  const targetDir = await resolveUniqueChildPath(resolvedParent, folderName);
  await fs.mkdir(targetDir, { recursive: true });

  return {
    id: makeId("sub"),
    type: "folder",
    name: path.basename(targetDir),
    hasChildren: false,
    children: [],
    folderPath: targetDir,
  };
}

export async function renamePath(oldPath, newPath) {
  const resolvedOld = path.resolve(oldPath);
  const resolvedNew = path.resolve(newPath);
  await fs.rename(resolvedOld, resolvedNew);
  return resolvedNew;
}

export async function deletePath(targetPath) {
  const resolved = path.resolve(targetPath);
  await fs.rm(resolved, { recursive: true, force: true });
  return { ok: true };
}

export async function saveImage(parentDir, fileName, base64Data) {
  const resolvedParent = path.resolve(parentDir);
  const assetsDir = path.join(resolvedParent, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const parsed = path.parse(fileName);
  const baseName = parsed.name || "image";
  const ext = parsed.ext || ".png";
  const targetPath = await resolveUniqueChildPath(assetsDir, baseName, ext);

  const buffer = Buffer.from(base64Data, "base64");
  await fs.writeFile(targetPath, buffer);

  return {
    ok: true,
    absolutePath: targetPath,
    relativePath: `./assets/${path.basename(targetPath)}`,
  };
}

const ATTACHMENT_SUBDIRS = ["images", "assets", "attachments"];

async function isExistingFile(candidatePath) {
  try {
    const stat = await fs.stat(candidatePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function isExistingDirectory(candidatePath) {
  try {
    const stat = await fs.stat(candidatePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolves a local media or attachment path, falling back to the note directory
 * and common adjacent attachment folders (images/, assets/, attachments/).
 */
export async function resolveLocalMediaPath(rawPath) {
  const candidates = [rawPath];
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded !== rawPath) candidates.push(decoded);
  } catch {
    // Ignore malformed URI sequences
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await isExistingFile(resolved)) {
      return resolved;
    }
  }

  const primaryResolved = path.resolve(candidates[candidates.length - 1]);
  const fileName = path.basename(primaryResolved);
  if (!fileName) return null;

  let currentDir = path.dirname(primaryResolved);
  while (currentDir && !(await isExistingDirectory(currentDir))) {
    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }

  let searchDir = currentDir;
  for (let depth = 0; depth < 3 && searchDir; depth++) {
    const directCandidate = path.join(searchDir, fileName);
    if (await isExistingFile(directCandidate)) {
      return directCandidate;
    }

    for (const subDir of ATTACHMENT_SUBDIRS) {
      const subCandidate = path.join(searchDir, subDir, fileName);
      if (await isExistingFile(subCandidate)) {
        return subCandidate;
      }
    }

    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }

  return null;
}
