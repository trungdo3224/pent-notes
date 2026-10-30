/**
 * Safe client-side path utilities for Windows and POSIX paths.
 */

export function normalizeSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

export function getDirname(filePath: string): string {
  const norm = normalizeSlash(filePath);
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash === -1) return '';
  const dir = norm.slice(0, lastSlash);
  if (filePath.includes('\\')) {
    return dir.replace(/\//g, '\\');
  }
  return dir;
}

export function getBasename(filePath: string): string {
  const norm = normalizeSlash(filePath);
  const lastSlash = norm.lastIndexOf('/');
  return lastSlash === -1 ? filePath : norm.slice(lastSlash + 1);
}

export function joinPath(parent: string, child: string): string {
  const isBackslash = parent.includes('\\');
  const sep = isBackslash ? '\\' : '/';
  const cleanParent = parent.replace(/[\\/]+$/, '');
  const cleanChild = child.replace(/^[\\/]+/, '');
  return `${cleanParent}${sep}${cleanChild}`;
}

