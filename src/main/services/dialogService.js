import { dialog, BrowserWindow } from 'electron';

export async function selectFolder(senderWebContents) {
  const window = senderWebContents ? BrowserWindow.fromWebContents(senderWebContents) : null;
  const result = await dialog.showOpenDialog(window || undefined, {
    title: 'Select Folder',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

