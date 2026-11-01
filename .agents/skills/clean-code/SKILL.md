---
name: clean-code
description: >-
  Enforces Clean Code principles, SOLID architecture, DRY/KISS/YAGNI, design patterns,
  Robert C. Martin's 66 Clean Code heuristics (C1-C5, E1-E2, F1-F4, G1-G36, N1-N7, TS1-TS3, T1-T9),
  and the Boy Scout Rule. Use when writing, reviewing, fixing, editing, or refactoring code,
  checking code quality, or evaluating software architecture.
  Triggers on "clean code", "refactor", "review architecture", "check code quality",
  "SOLID principles", "DRY", "code smells", or "boy scout".
license: MIT
metadata:
  sources:
    - "ertugrul-dmr/clean-code-skills (Skills, Not Vibes: Teaching AI Agents to Write Clean Code)"
    - "AsyrafHussin/agent-skills/clean-code-principles"
  version: "1.0.0"
---

# Clean Code & Software Craftsmanship Skill

Disciplined engineering guidelines combining **Robert C. Martin's *Clean Code* 66 Heuristics**, **The Boy Scout Rule**, and **SOLID / Core Architectural Principles** (`clean-code-principles`).

> "Always check a module in cleaner than when you checked it out." — *The Boy Scout Rule*

---

## When to Apply

Activate and follow this skill whenever:
- Writing new features, modules, hooks, or components
- Refactoring existing code for readability, modularity, and maintainability
- Reviewing architecture or auditing for code smells and technical debt
- Fixing bugs or editing existing files (apply the **Boy Scout Rule** alongside changes)

---

## Rule Categories by Priority

| Priority | Category | Impact | Rule Codes / Prefixes |
| :--- | :--- | :--- | :--- |
| **1** | **SOLID Principles** | CRITICAL | `solid-srp`, `solid-ocp`, `solid-lsp`, `solid-isp`, `solid-dip` |
| **2** | **Core Principles & General** | CRITICAL | `core-dry` (`G5`), `core-kiss`, `core-yagni`, `core-separation-of-concerns`, `core-fail-fast`, `G1-G36` |
| **3** | **Functions & Methods** | HIGH | `func-small`, `func-single-purpose` (`G30`), `F1` (max 3 args), `F2` (no output args), `F3` (no flag args), `F4` (no dead functions) |
| **4** | **Code Organization** | HIGH | `org-module-boundaries`, `org-layered-architecture`, `org-package-cohesion`, `TS1-TS3` |
| **5** | **Design Patterns** | HIGH | `pattern-factory`, `pattern-strategy`, `pattern-repository`, `pattern-facade`, `pattern-adapter` |
| **6** | **Naming & Readability** | MEDIUM | `name-meaningful` (`N1`), `N2-N7`, `G16` (no obscured intent), `G25` (named constants over magic numbers) |
| **7** | **Comments & Documentation** | LOW | `doc-self-documenting`, `doc-why-not-what`, `C1-C5` (no redundant, metadata, or commented-out code) |
| **8** | **Tests** | MEDIUM | `T1-T9` (boundary conditions, fast tests, coverage) |

---

## Quick Reference Catalog

### 1. SOLID & Core Principles (CRITICAL)
- **`solid-srp` / `G30` (Single Responsibility)**: Every module, class, component, or function should have only one reason to change and do one thing well.
- **`solid-ocp` / `G23` (Open/Closed)**: Open for extension, closed for modification. Prefer union lookup tables, strategy maps, or polymorphism over growing `if/else` or `switch` chains.
- **`solid-lsp` (Liskov Substitution)**: Subtypes and implementations must honor base contracts without surprising callers.
- **`solid-isp` (Interface Segregation)**: Keep interfaces and component props focused; do not force callers to pass unused options.
- **`solid-dip` (Dependency Inversion)**: Depend on abstractions/interfaces; decouple high-level domain state from low-level I/O (HTTP, IndexedDB, filesystem).
- **`core-dry` / `G5` (Don't Repeat Yourself)**: Every piece of knowledge must have a single, unambiguous, authoritative representation. Extract shared utilities, hooks, and constants.
- **`core-kiss` (Keep It Simple)**: Prefer flat, direct control flow with guard clauses and early returns over deep nesting or over-engineered abstractions.
- **`core-yagni` / `F4` / `G9` (No Dead Code)**: Delete unused functions, unreachable branches, and speculative dead code immediately.
- **`core-law-of-demeter` / `G36` (No Train Wrecks)**: Avoid reaching through deep object chains; encapsulate traversal in dedicated helpers.

### 2. Functions & Methods (`F1-F4`, `G30`, `G34`)
- **`F1` (Maximum 3 Arguments)**: Functions taking 4+ parameters must use a typed parameter/options object.
- **`F2` (No Output Arguments)**: Do not mutate input parameters as side effects; return new values or updated copies.
- **`F3` (No Flag Arguments)**: Split functions that branch on a boolean flag into distinct, intention-revealing functions when behaviors diverge.
- **`G30` & `G34` (Single Abstraction Level)**: Keep functions small (<30–40 lines ideally) and operating at a single level of abstraction.

### 3. Naming & Constants (`N1-N7`, `G25`, `TS1-TS3`)
- **`N1` & `N4` (Intention-Revealing, Unambiguous Names)**: Names must state what the value represents or what the function does (`filterPositiveNumbers` instead of `proc`).
- **`N5` (Scope-Appropriate Length)**: Short names (`i`, `el`) only in tiny 1–3 line lambdas; descriptive names for module/component scope.
- **`N6` (No Encodings)**: Avoid Hungarian notation or redundant prefixes (`IUser`).
- **`N7` (Describe Side Effects)**: If a function writes to disk, mutates storage, or triggers navigation, its name must reflect that (`saveAndSwitchSession`, not `getSession`).
- **`G25` & `TS2` (No Magic Numbers/Strings)**: Extract magic numbers, timeouts, limits, regexes, and storage keys into named UPPER_SNAKE_CASE constants or literal union types.
- **`TS1` & `TS3` (Strict TypeScript Boundaries)**: Use explicit named imports, explicit return types on shared utilities/APIs, and avoid `any` (use specific types or `unknown` with type narrowing).

### 4. Comments (`C1-C5`, `doc-*`)
- **`C1` (No Metadata)**: Never put author/date/changelog history in comments—Git tracks history.
- **`C2` & `C5` (No Obsolete or Commented-Out Code)**: Delete dead commented-out code immediately.
- **`C3` (No Redundant Noise)**: Do not write comments that merely restate the next line of code. Write comments only to explain **why** a non-obvious decision or constraint exists (`doc-why-not-what`).

---

## The Boy Scout Workflow

Every time you touch or refactor a file:
1. **Preserve Behavior First**: Ensure 100% of existing functionality, edge cases, and public contracts remain intact.
2. **Eliminate Duplication (`core-dry` / `G5`)**: Consolidate repeated file readers, ID generators, API fetch wrappers, DOM listeners, and tree traversals into shared modules.
3. **Decompose Large Files & Functions (`solid-srp` / `G30`)**: Break monolithic files or 500+ line modules into focused, cohesive modules or sub-components.
4. **Extract Magic Values (`G25`)**: Replace inline magic numbers (timeouts, dimension bounds, slice limits) and regex literals with descriptive constants.
5. **Tighten Types (`TS3`)**: Replace `any` with accurate domain interfaces and type guards.
6. **Verify**: Run typecheck (`tsc --noEmit`) and production build (`npm run build`) or tests to guarantee zero regressions.

---

## Audit & Refactoring Output Format

When auditing code or reporting refactoring improvements, cite the location and rule code:

```text
path/to/file.ts:line - [rule-code] Description of issue and fix applied
```

Examples:
- `src/lib/fsApi.ts:10 - [core-dry / G5] Duplicated POST fetch and JSON error handling across 6 methods -> extracted postJson<T> helper`
- `src/store/useNotesStore.ts:88 - [org-module-boundaries / solid-srp] Tree traversal and sorting mixed with Zustand store -> extracted to src/lib/treeUtils.ts`
- `vite.config.ts:63 - [TS3] Untyped 'any[]' in countNotes -> replaced with typed node traversal`

---

## Detailed Reference Guides

Load these reference files on-demand when deeper examples or catalog lookups are needed:
- [SOLID & Core Principles Reference](./references/solid-and-core-principles.md)
- [Clean Code 66 Heuristics Catalog](./references/clean-code-heuristics.md)
- [TypeScript & React Clean Code Guide](./references/typescript-react-guide.md)

