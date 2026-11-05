import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

/**
 * RFC-042 Pillar 1: Inverted cross-file link index.
 * Serialized to disk in userData/link-index.json to avoid holding monolithic JSON graphs in memory.
 */

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

class LinkIndexService {
  constructor() {
    this.indexPath = null;
    this.index = {
      // sourcePath -> Array of target titles
      outgoing: {},
      // targetTitle (lowercase) -> Array of sourcePaths
      incoming: {},
    };
    this.saveTimer = null;
    this.isLoaded = false;
  }

  getStoragePath() {
    if (!this.indexPath) {
      const userData = app?.getPath('userData') || process.cwd();
      this.indexPath = path.join(userData, 'link-index.json');
    }
    return this.indexPath;
  }

  async loadIndex() {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(this.getStoragePath(), 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        this.index = {
          outgoing: parsed.outgoing || {},
          incoming: parsed.incoming || {},
        };
      }
    } catch {
      // File doesn't exist yet or is empty
      this.index = { outgoing: {}, incoming: {} };
    }
    this.isLoaded = true;
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        const dest = this.getStoragePath();
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(this.index), 'utf-8');
      } catch (err) {
        console.error('Failed to save link index to disk:', err);
      }
    }, 500);
  }

  async updateFileLinks(filePath, content) {
    await this.loadIndex();
    const resolvedPath = path.resolve(filePath);

    // Remove old outgoing links for this file
    const oldTargets = this.index.outgoing[resolvedPath] || [];
    for (const oldT of oldTargets) {
      const key = oldT.toLowerCase();
      if (this.index.incoming[key]) {
        this.index.incoming[key] = this.index.incoming[key].filter(
          (p) => p !== resolvedPath
        );
        if (this.index.incoming[key].length === 0) {
          delete this.index.incoming[key];
        }
      }
    }

    // Parse new outgoing links
    const newTargets = [];
    if (content && typeof content === 'string') {
      let match;
      WIKILINK_REGEX.lastIndex = 0;
      while ((match = WIKILINK_REGEX.exec(content)) !== null) {
        const targetTitle = match[1].trim();
        if (targetTitle && !newTargets.includes(targetTitle)) {
          newTargets.push(targetTitle);
        }
      }
    }

    if (newTargets.length > 0) {
      this.index.outgoing[resolvedPath] = newTargets;
      for (const target of newTargets) {
        const key = target.toLowerCase();
        if (!this.index.incoming[key]) {
          this.index.incoming[key] = [];
        }
        if (!this.index.incoming[key].includes(resolvedPath)) {
          this.index.incoming[key].push(resolvedPath);
        }
      }
    } else {
      delete this.index.outgoing[resolvedPath];
    }

    this.scheduleSave();
  }

  async removeFile(filePath) {
    await this.loadIndex();
    const resolvedPath = path.resolve(filePath);
    await this.updateFileLinks(resolvedPath, '');
  }

  async renameFile(oldPath, newPath) {
    await this.loadIndex();
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);

    const targets = this.index.outgoing[resolvedOld] || [];
    delete this.index.outgoing[resolvedOld];
    if (targets.length > 0) {
      this.index.outgoing[resolvedNew] = targets;
    }

    for (const key of Object.keys(this.index.incoming)) {
      this.index.incoming[key] = this.index.incoming[key].map((p) =>
        p === resolvedOld ? resolvedNew : p
      );
    }

    this.scheduleSave();
  }

  async getConnections(filePath, noteTitle) {
    await this.loadIndex();
    const resolvedPath = filePath ? path.resolve(filePath) : null;
    const outgoing = resolvedPath ? this.index.outgoing[resolvedPath] || [] : [];

    const titleKey = noteTitle ? noteTitle.trim().toLowerCase() : null;
    const incoming = titleKey ? this.index.incoming[titleKey] || [] : [];

    return {
      outgoing,
      incoming,
    };
  }
}

export const linkIndexService = new LinkIndexService();

