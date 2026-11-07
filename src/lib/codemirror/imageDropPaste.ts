import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";

interface ImageDropPasteOptions {
  getFilePath: () => string | undefined;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_EXT_REGEX.test(file.name);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function formatTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

async function processImageFile(
  file: File,
  filePath?: string,
): Promise<string | null> {
  const defaultExt =
    file.type.includes("jpeg") || file.type.includes("jpg")
      ? ".jpg"
      : file.type.includes("svg")
        ? ".svg"
        : file.type.includes("webp")
          ? ".webp"
          : ".png";

  const rawName =
    file.name && file.name !== "image.png"
      ? file.name
      : `Pasted-image-${formatTimestamp()}${defaultExt}`;

  const alt = rawName.replace(/\.[^.]+$/, "");

  // 1. If in Electron and active note has a disk path, save into adjacent assets/ folder
  if (
    filePath &&
    typeof window !== "undefined" &&
    window.electronAPI?.fs?.saveImage
  ) {
    const lastSlash = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    if (lastSlash !== -1) {
      const parentDir = filePath.slice(0, lastSlash);
      try {
        const arrayBuf = await file.arrayBuffer();
        const base64 = bufferToBase64(arrayBuf);
        const res = await window.electronAPI.fs.saveImage(
          parentDir,
          rawName,
          base64,
        );
        if (res?.ok && res.relativePath) {
          return `![${alt}](${res.relativePath})\n`;
        }
      } catch (err) {
        console.warn(
          "Failed to save image to disk assets folder, falling back to data URL:",
          err,
        );
      }
    }
  }

  // 2. Fallback: Base64 Data URL (instant, self-contained, memory-safe)
  try {
    const dataUrl = await fileToDataUrl(file);
    return `![${alt}](${dataUrl})\n`;
  } catch (err) {
    console.error("Failed to read image as data URL:", err);
    return null;
  }
}

async function insertImageFiles(
  files: File[],
  insertPos: number,
  view: EditorView,
  filePath?: string,
): Promise<void> {
  let currentPos = insertPos;
  for (const file of files) {
    const markdown = await processImageFile(file, filePath);
    if (!markdown) continue;

    view.dispatch({
      changes: { from: currentPos, insert: markdown },
      selection: { anchor: currentPos + markdown.length },
    });
    currentPos += markdown.length;
  }
}

export function createImageDropPasteExtension(
  options: ImageDropPasteOptions,
): Extension {
  return EditorView.domEventHandlers({
    dragover(event, view) {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
        view.dom.classList.add("cm-drag-over-image");
      }
    },
    dragleave(_, view) {
      view.dom.classList.remove("cm-drag-over-image");
    },
    drop(event, view) {
      view.dom.classList.remove("cm-drag-over-image");
      const files = Array.from(event.dataTransfer?.files || []);
      const imageFiles = files.filter(isImageFile);

      if (imageFiles.length === 0) return false;

      event.preventDefault();
      event.stopPropagation();

      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;

      void insertImageFiles(imageFiles, pos, view, options.getFilePath());
      return true;
    },
    paste(event, view) {
      const files = Array.from(event.clipboardData?.files || []);
      const imageFiles = files.filter(isImageFile);

      if (imageFiles.length === 0) return false;

      event.preventDefault();
      event.stopPropagation();

      const pos = view.state.selection.main.head;
      void insertImageFiles(imageFiles, pos, view, options.getFilePath());
      return true;
    },
  });
}
