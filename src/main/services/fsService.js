import fs from "node:fs/promises";
import path from "node:path";

/**
 * RFC-042: Low-Footprint Architecture & Memory Optimization
 * - Decoupled Metadata Index (does NOT load raw file contents into store)
 * - Shallow Traversal (depth: 1, loads subdirectories on demand)
 * - Strict Watcher / Scanner Ignore List
 */

const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;

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
  return name.replace(NOTE_EXT_REGEX, "").trim() || "Untitled";
}

function isStrictlyIgnored(name) {
  if (name.startsWith(".") || STRICT_IGNORE_NAMES.has(name)) return true;
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
    } else if (entry.isFile() && NOTE_EXT_REGEX.test(entry.name)) {
      const isPdf = entry.name.toLowerCase().endsWith(".pdf");
      try {
        const stat = await fs.stat(fullPath);
        notes.push({
          id: makeId("note"),
          type: "note",
          title: stripExt(entry.name),
          content: "", // Lazy: Content read on demand via readFile()
          updatedAt: stat.mtime.toISOString().slice(0, 10),
          filePath: fullPath,
          fileType: isPdf ? "pdf" : "markdown",
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
  const baseName = stripExt(rawFileName);
  const resolvedParent = path.resolve(parentPath);
  await fs.mkdir(resolvedParent, { recursive: true });

  const targetFile = await resolveUniqueChildPath(
    resolvedParent,
    baseName,
    ".md",
  );
  const initialContent = content || "";
  await fs.writeFile(targetFile, initialContent, "utf-8");

  return {
    id: makeId("note"),
    type: "note",
    title: stripExt(path.basename(targetFile)),
    content: initialContent,
    updatedAt: new Date().toISOString().slice(0, 10),
    filePath: targetFile,
    fileType: "markdown",
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
