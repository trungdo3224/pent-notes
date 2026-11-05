import { app, BrowserWindow, protocol, net, ipcMain, shell } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';
import * as fsService from './services/fsService.js';
import * as sessionService from './services/sessionService.js';
import * as dialogService from './services/dialogService.js';
import { linkIndexService } from './services/linkIndexService.js';

// Register custom protocol privilege before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pent-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function registerIpcHandlers() {
  // Filesystem handlers
  ipcMain.handle('fs:scan', async (_, folderPath) => {
    return await fsService.scanFolder(folderPath);
  });

  ipcMain.handle('fs:write-file', async (_, filePath, content) => {
    return await fsService.writeFile(filePath, content);
  });

  ipcMain.handle('fs:create-file', async (_, parentPath, name, content) => {
    return await fsService.createFile(parentPath, name, content);
  });

  ipcMain.handle('fs:create-folder', async (_, parentPath, name) => {
    return await fsService.createFolder(parentPath, name);
  });

  ipcMain.handle('fs:rename', async (_, oldPath, newPath) => {
    return await fsService.renamePath(oldPath, newPath);
  });

  ipcMain.handle('fs:delete', async (_, targetPath) => {
    return await fsService.deletePath(targetPath);
  });

  ipcMain.handle('fs:read-file', async (_, filePath) => {
    return await fsService.readFile(filePath);
  });

  ipcMain.handle('fs:read-dir', async (_, dirPath) => {
    return await fsService.readDirectoryShallow(dirPath);
  });

  ipcMain.handle('links:get-connections', async (_, filePath, noteTitle) => {
    return await linkIndexService.getConnections(filePath, noteTitle);
  });

  // Sessions handlers
  ipcMain.handle('sessions:list', async () => {
    return await sessionService.listAllSessions();
  });

  ipcMain.handle('sessions:get', async (_, sessionId) => {
    return await sessionService.getOrSeedSession(sessionId);
  });

  ipcMain.handle('sessions:save', async (_, sessionId, name, payload) => {
    return await sessionService.saveSession(sessionId, name, payload);
  });

  ipcMain.handle('sessions:delete', async (_, sessionId) => {
    return await sessionService.deleteSession(sessionId);
  });

  // State handlers
  ipcMain.handle('state:get', async () => {
    return await sessionService.getWorkspaceState();
  });

  ipcMain.handle('state:save', async (_, rawJson) => {
    return await sessionService.saveWorkspaceState(rawJson);
  });

  // Native Dialog handlers
  ipcMain.handle('dialog:select-folder', async (event) => {
    return await dialogService.selectFolder(event.sender);
  });

  ipcMain.handle('window:setTitleBarOverlay', (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && typeof win.setTitleBarOverlay === 'function') {
      try {
        win.setTitleBarOverlay(options);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  });
}

function createWindow() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'PentNotes',
    autoHideMenuBar: true,
    ...(isWindows || isMac
      ? {
          titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
          ...(isWindows
            ? {
                titleBarOverlay: {
                  color: '#161b25',
                  symbolColor: '#f8fafc',
                  height: 38,
                },
              }
            : {}),
          ...(isMac
            ? {
                trafficLightPosition: { x: 14, y: 12 },
              }
            : {}),
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external web links in OS default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
      shell.openExternal(details.url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Fail Load] ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });

  // In development, load the Vite dev server URL automatically injected by electron-vite
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    // In production, load the built HTML
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// RFC-042 Pillar 4: Chromium process optimization
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');

app.whenReady().then(() => {
  // Register custom protocol for local raw files (PDFs, images)
  protocol.handle('pent-file', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        return new Response('Missing file path', { status: 400 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response(err instanceof Error ? err.message : 'Failed to load file', {
        status: 500,
      });
    }
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
