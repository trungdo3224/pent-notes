import fs from 'node:fs';
import path from 'node:path';

/**
 * RFC-042 Pillar 2: Adaptive scoped file watching with strict ignore rules.
 */

const STRICT_IGNORE_NAMES = new Set([
  'node_modules',
  '.git',
  '.vscode',
  '.idea',
  'dist',
  'build',
  '__pycache__',
  '.obsidian',
]);

const STRICT_IGNORE_EXTENSIONS = new Set([
  'zip',
  'tar',
  'gz',
  'iso',
  'pcap',
  'exe',
  'bin',
  '7z',
  'rar',
  'dmg',
  'pkg',
  'tmp',
]);

function isIgnored(targetPath) {
  const parts = targetPath.split(/[/\\]/);
  for (const part of parts) {
    if (STRICT_IGNORE_NAMES.has(part)) return true;
  }
  const ext = path.extname(targetPath).slice(1).toLowerCase();
  if (STRICT_IGNORE_EXTENSIONS.has(ext)) return true;
  return false;
}

class WatcherService {
  constructor() {
    this.watchers = new Map(); // dirPath -> FSWatcher
    this.debounceTimers = new Map();
  }

  watchDirectory(dirPath, onChangeCallback) {
    const resolved = path.resolve(dirPath);
    if (this.watchers.has(resolved)) return;

    try {
      const watcher = fs.watch(
        resolved,
        { persistent: false },
        (eventType, filename) => {
          if (!filename || isIgnored(filename)) return;

          // Debounce rapid events
          const timerKey = `${resolved}:${filename}`;
          if (this.debounceTimers.has(timerKey)) {
            clearTimeout(this.debounceTimers.get(timerKey));
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(timerKey);
            onChangeCallback({
              dirPath: resolved,
              filename,
              eventType,
            });
          }, 400);

          this.debounceTimers.set(timerKey, timer);
        }
      );

      watcher.on('error', (err) => {
        console.warn(`Watcher error on ${resolved}:`, err.message);
      });

      this.watchers.set(resolved, watcher);
    } catch (err) {
      console.warn(`Failed to watch directory ${resolved}:`, err.message);
    }
  }

  unwatchDirectory(dirPath) {
    const resolved = path.resolve(dirPath);
    const watcher = this.watchers.get(resolved);
    if (watcher) {
      watcher.close();
      this.watchers.delete(resolved);
    }
  }

  unwatchAll() {
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

export const watcherService = new WatcherService();

