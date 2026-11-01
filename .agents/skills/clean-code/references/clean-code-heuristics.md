# Clean Code 66 Heuristics Catalog (Robert C. Martin)

Complete reference of the 66 rules from *Clean Code* Chapter 17 ("Smells and Heuristics"), adapted for TypeScript and modern web applications.

## Comments (`C1–C5`)
- **C1: Inappropriate Information** — Do not store change histories, authors, or metadata in comments; use Git.
- **C2: Obsolete Comment** — Delete or update comments that have grown out of sync with the code immediately.
- **C3: Redundant Comment** — Do not comment what the code already clearly states (e.g., `// Close modal` above `closeModal()`).
- **C4: Poorly Written Comment** — If a comment is worth writing (to explain *why* a non-obvious constraint exists), write it concisely and accurately.
- **C5: Commented-Out Code** — Never leave commented-out code blocks in the codebase.

## Environment (`E1–E2`)
- **E1: Build Requires at Most One Step** — `npm run build` must cleanly typecheck and bundle the project in a single command.
- **E2: Tests Require at Most One Step** — Verification must be runnable with a single command.

## Functions (`F1–F4`)
- **F1: Too Many Arguments** — Keep function parameters to at most 3; group related arguments into a typed options/payload object when 4+ are needed.
- **F2: Output Arguments** — Avoid mutating input arguments as an output mechanism; return new values instead.
- **F3: Flag Arguments** — Avoid boolean parameters that make a function do two fundamentally different things; split into clear, separate functions where appropriate.
- **F4: Dead Function** — Remove functions that are never called.

## General (`G1–G36`)
- **G1: Multiple Languages in One Source File** — Minimize mixing raw inline styles/scripts where dedicated classes or modules belong.
- **G2: Obvious Behavior Is Unimplemented** — Functions and UI controls should behave according to the Principle of Least Surprise.
- **G3: Incorrect Behavior at the Boundaries** — Always handle empty arrays, null/undefined, minimum/maximum bounds, and missing files gracefully.
- **G4: Overridden Safeties** — Do not disable compiler checks (`@ts-ignore`, `any`) to silence legitimate type errors.
- **G5: Duplication (DRY)** — Eliminate duplicate code blocks, repeated API wrappers, and copy-pasted utilities.
- **G6: Code at Wrong Level of Abstraction** — Keep low-level mechanics in utility modules and high-level orchestration in stores/components.
- **G7: Base Classes Depending on Their Derivatives** — Higher-level abstractions must not depend on lower-level specifics.
- **G8: Too Much Information** — Keep module exports minimal; only export what external callers actually need.
- **G9: Dead Code** — Remove unreachable branches, unused variables, and obsolete fallbacks.
- **G10: Vertical Separation** — Declare variables and private helpers close to where they are used.
- **G11: Inconsistency** — Follow consistent conventions for naming, error handling, and state selection across the entire project.
- **G12: Clutter** — Remove unused imports, empty blocks, and pointless variables.
- **G13: Artificial Coupling** — Do not place general-purpose utilities inside a specific UI component just because it was used there first.
- **G14: Feature Envy** — Keep operations on a data structure in the module that owns that data structure.
- **G15: Selector Arguments** — Prefer dedicated functions or descriptive union types over opaque selector booleans/numbers.
- **G16: Obscured Intent** — Write clear, expressive expressions rather than dense, cryptic one-liners.
- **G17: Misplaced Responsibility** — Place functions where a reader naturally expects to find them (e.g., file utilities in `fileUtils.ts`, tree helpers in `treeUtils.ts`).
- **G18: Inappropriate Static** — Keep pure functions pure and stateful methods bound to their state container.
- **G19: Use Explanatory Variables** — Break complex conditions or calculations into well-named intermediate `const` variables.
- **G20: Function Names Should Say What They Do** — If you have to inspect the implementation to know what a function does, rename it.
- **G21: Understand the Algorithm** — Make sure edge cases (e.g., debouncing, race conditions, ID preservation) are cleanly and deterministically handled.
- **G22: Make Logical Dependencies Physical** — Instead of assuming another module's constants or format implicitly, import shared constants explicitly.
- **G23: Prefer Polymorphism / Lookup Maps to If/Else or Switch/Case** — Use lookup tables (`Record<Key, Value>`) or strategy handlers instead of repetitive conditional chains.
- **G24: Follow Standard Conventions** — Adhere to idiomatic TypeScript and React conventions.
- **G25: Replace Magic Numbers with Named Constants** — Never scatter raw numbers (`180`, `600`, `2500`, `150`, `400`, `800`) without named constants explaining their meaning.
- **G26: Be Precise** — Handle currency, dates, types, and nullability explicitly.
- **G27: Structure over Convention** — Enforce contracts with TypeScript types and discriminated unions (`type: 'note' | 'folder'`).
- **G28: Encapsulate Conditionals** — Extract complex boolean expressions into descriptive predicate functions (`isPdfNote(note)`).
- **G29: Avoid Negative Conditionals** — Prefer `if (isValid)` over `if (!isInvalid)` when possible.
- **G30: Functions Should Do One Thing** — Each function should have a single, clear responsibility.
- **G31: Hidden Temporal Couplings** — Make execution order requirements explicit through function composition or return values.
- **G32: Don't Be Arbitrary** — Organize files and exports systematically.
- **G33: Encapsulate Boundary Conditions** — Centralize clamping/bounds logic (e.g., `clamp(value, min, max)`).
- **G34: Functions Should Descend Only One Level of Abstraction** — Delegate lower-level details to helper functions.
- **G35: Keep Configurable Data at High Levels** — Place configuration constants at the top of modules or in dedicated config files.
- **G36: Avoid Transitive Navigation (Law of Demeter)** — Avoid brittle deep property chains.

## Names (`N1–N7`)
- **N1: Choose Descriptive Names**
- **N2: Choose Names at the Appropriate Level of Abstraction**
- **N3: Use Standard Nomenclature Where Possible**
- **N4: Unambiguous Names**
- **N5: Use Longer Names for Longer Scopes**
- **N6: Avoid Encodings**
- **N7: Names Should Describe Side-Effects**

## TypeScript-Specific (`TS1–TS3`)
- **TS1: Explicit and Stable Imports** — Avoid circular dependencies; import types and values cleanly from their canonical modules.
- **TS2: Literal Unions & Const Objects over Magic Strings** — Use discriminated unions and `as const` maps.
- **TS3: Strict Typing at Boundaries** — Never use `any`; type API payloads, DOM events, and recursive structures explicitly.

## Tests (`T1–T9`)
- **T1–T9**: Test boundary conditions, keep tests fast and deterministic, and verify all refactored modules compile and pass checks cleanly.

