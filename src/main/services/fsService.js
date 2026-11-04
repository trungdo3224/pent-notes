import fs from 'node:fs/promises';
import path from 'node:path';

const NOTE_EXT_REGEX = /\.(md|markdown|mdx|txt|pdf)$/i;
const MAX_DIRECTORY_SCAN_DEPTH = 8;

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.obsidian',
  '.vscode',
  '.idea',
  'dist',
  'build',
  '__pycache__',
]);

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripExt(name) {
  return name.replace(NOTE_EXT_REGEX, '').trim() || 'Untitled';
}

async function resolveUniqueChildPath(parentDir, baseName, extension = '') {
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

export async function readDirectoryRecursive(dirPath, depth = 0) {
  if (depth > MAX_DIRECTORY_SCAN_DEPTH) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const folders = [];
  const notes = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await readDirectoryRecursive(fullPath, depth + 1);
      folders.push({
        id: makeId('sub'),
        type: 'folder',
        name: entry.name,
        children,
        folderPath: fullPath,
      });
    } else if (entry.isFile() && NOTE_EXT_REGEX.test(entry.name)) {
      const isPdf = entry.name.toLowerCase().endsWith('.pdf');
      const [content, stat] = await Promise.all([
        isPdf ? Promise.resolve('') : fs.readFile(fullPath, 'utf-8'),
        fs.stat(fullPath),
      ]);
      notes.push({
        id: makeId('note'),
        type: 'note',
        title: stripExt(entry.name),
        content,
        updatedAt: stat.mtime.toISOString().slice(0, 10),
        filePath: fullPath,
        fileType: isPdf ? 'pdf' : 'markdown',
      });
    }
  }

  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  notes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  );

  return [...folders, ...notes];
}

export async function scanFolder(folderPath) {
  const resolved = path.resolve(folderPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory.');
  }
  const items = await readDirectoryRecursive(resolved);
  const rootName = path.basename(resolved) || 'Notes';
  return { rootName, rootPath: resolved, items };
}

export async function writeFile(filePath, content) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content ?? '', 'utf-8');
  return { ok: true, path: resolved };
}

export async function createFile(parentPath, name, content = '') {
  const rawFileName = name && typeof name === 'string' ? name.trim() : 'Untitled Note';
  const baseName = stripExt(rawFileName);
  const resolvedParent = path.resolve(parentPath);
  await fs.mkdir(resolvedParent, { recursive: true });

  const targetFile = await resolveUniqueChildPath(resolvedParent, baseName, '.md');
  const initialContent = content || '';
  await fs.writeFile(targetFile, initialContent, 'utf-8');

  return {
    id: makeId('note'),
    type: 'note',
    title: stripExt(path.basename(targetFile)),
    content: initialContent,
    updatedAt: new Date().toISOString().slice(0, 10),
    filePath: targetFile,
  };
}

export async function createFolder(parentPath, name) {
  const folderName = name && typeof name === 'string' ? name.trim() : 'New Folder';
  const resolvedParent = path.resolve(parentPath);
  const targetDir = await resolveUniqueChildPath(resolvedParent, folderName);
  await fs.mkdir(targetDir, { recursive: true });

  return {
    id: makeId('sub'),
    type: 'folder',
    name: path.basename(targetDir),
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

