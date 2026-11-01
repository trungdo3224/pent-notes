# SOLID & Core Principles Reference

Detailed guide to architectural and design rules from `clean-code-principles`.

## 1. SOLID Principles (`solid-`)

### `solid-srp` — Single Responsibility Principle
- **Class / Module Level (`solid-srp-class`)**: A module, service, or React component should be responsible to one actor or concern.
  - *Smell*: A single file defines HTTP middleware, database persistence, file tree scanning, and Vite bundler config.
  - *Fix*: Split into cohesive modules (e.g., `sessionService.ts`, `fsScanner.ts`, `apiMiddleware.ts`).
- **Function Level (`solid-srp-function`)**: A function should do one thing and operate at one level of abstraction.
  - *Smell*: A function parses HTML, mutates DOM nodes, AND updates state.
  - *Fix*: Extract pure helper functions for parsing/transformation and keep state updates separate.

### `solid-ocp` — Open/Closed Principle
- Software entities should be open for extension, closed for modification.
- Replace repetitive `if/else` or `switch` chains over type discriminators with configuration maps, lookup records (`Record<Key, Handler>`), or polymorphic dispatch.

### `solid-lsp` — Liskov Substitution Principle
- Subtypes and interface implementations must honor the behavioral contract of their base type (no unexpected throws or weakened postconditions).

### `solid-isp` — Interface Segregation Principle
- Clients should not be forced to depend on properties or methods they do not use. Keep React component props minimal and domain-specific.

### `solid-dip` — Dependency Inversion Principle
- High-level state and business rules should not depend on low-level transport details (`fetch`, `localStorage`, `IndexedDB`). Abstract I/O behind clean client/storage modules (`fsApi`, `sessionApi`, `workspaceStorage`).

---

## 2. Core Principles (`core-`)

### `core-dry` — Don't Repeat Yourself
- **Rule**: Every piece of knowledge must have a single, unambiguous, authoritative representation within a system.
- **Sub-rules**:
  - `core-dry-extraction`: Extract repeated algorithms (e.g., file reading, error parsing, outside-click detection, drag resizing) into shared functions or custom React hooks.
  - `core-dry-single-source`: Centralize constants, regex patterns (e.g. `NOTE_EXTENSION_REGEX`), ignored directory sets, and storage keys in one shared module.

### `core-kiss` — Keep It Simple, Stupid
- **Rule**: Avoid unnecessary complexity.
- **Practices**:
  - Use guard clauses (`if (!isValid) return;`) to flatten nested `if/else` blocks.
  - Prefer standard array/collection methods (`.map`, `.filter`, `.find`) over manual index-tracking loops when clearer.

### `core-yagni` — You Aren't Gonna Need It
- Do not add speculative parameters, unused branches, or dead helper functions.

### `core-separation-of-concerns`
- Separate pure domain transformations (tree manipulation, markdown parsing, sorting, path manipulation) from stateful UI components and side-effectful I/O.

### `core-fail-fast`
- Validate inputs and boundary conditions at the start of a function or API handler and return/throw clear errors immediately.

### `core-law-of-demeter`
- Avoid chaining deep internal structural access across unrelated boundaries; expose intention-revealing selector or helper functions.

