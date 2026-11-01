# TypeScript & React Clean Code Guide

Practical refactoring patterns for TypeScript + React + Zustand + Vite codebases.

## 1. Custom Hooks for Repeated DOM Effects (`core-dry-extraction`)
When multiple components attach window/document listeners for the same interaction pattern, extract a reusable custom hook:
- **Outside Click Detection**: Instead of repeating `mousedown` `contains()` effects in every dropdown component, use `useClickOutside(ref, isOpen, onClose)`.
- **Escape Key Dismissal**: Instead of repeating `keydown` `e.key === 'Escape'` effects across every modal, use `useEscapeKey(isOpen, onEscape)`.
- **Pointer/Touch Drag Resizing**: Consolidate `mousemove`/`touchmove`/`mouseup`/`touchend` + `document.body.classList` management into a reusable hook or helper.

## 2. Centralize Domain Predicates & Utilities (`G5`, `G28`)
- Instead of repeating `node.fileType === 'pdf' || node.filePath?.toLowerCase().endsWith('.pdf') || Boolean(node.pdfData)` across components, define `isPdfNote(note: NoteItem): boolean` in a shared utility module.
- Instead of duplicating `createId`, `stripNoteExtension`, `readFileAsDataUrl`, `buildNoteItemsFromFiles`, and `IGNORED_DIRS` across `useNotesStore.ts`, `ImportModal.tsx`, and `vite.config.ts`, centralize them in `src/lib/fileUtils.ts`.

## 3. Separate Pure Tree Operations from Store State (`solid-srp`)
- Keep Zustand store files focused on state definition and actions.
- Extract pure recursive tree functions (`sortExplorerNodes`, `findDefaultNoteId`, `findNoteAndPath`, `findFolderNode`, `findNoteNode`, `findNodeById`, `insertIntoTree`, `updateNoteInTree`, `updateFolderInTree`, `removeNodeFromTree`, `matchAndPreserveIds`) into `src/lib/treeUtils.ts`.

## 4. DRY HTTP Client Helpers (`core-dry`, `solid-dip`)
- Wrap repetitive `fetch(url, { method, headers, body })` + error extraction (`const err = await res.json().catch(() => ({})); throw new Error(err.error || fallbackMessage)`) into a single typed `requestJson<T>(url, options, fallbackError)` helper.

## 5. Decompose Large Components (`solid-srp`, `func-small`)
- When a component exceeds ~250–300 lines and renders multiple distinct visual modes or sub-panels (e.g., collapsed vs. expanded navbar, outline vs. tags vs. info tabs, PDF vs. split vs. markdown editor), extract focused sub-components or view helpers while keeping props minimal and clear.

