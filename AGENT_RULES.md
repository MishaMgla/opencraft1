# agent rules

single source of truth for rules and documentation pointers shared by all AI coding agents working in this repository.

> **scaffold status.** this repo is an early scaffold — most code does not exist yet. sections marked _(pending stack)_ are placeholders to fill in once the codebase lands. do not invent rules to fill them; add a rule when the code it governs exists.

## how this doc works

- this file holds all shared rules. `CLAUDE.md` and `AGENTS.md` at the repo root are thin pointer stubs that link here and must not contain rules of their own.
- when adding or changing a rule: edit this file. touch the root stubs only if the pointer or purpose line itself changes.
- when adding or changing architecture or code behavior: update the matching `docs/project-map/*` doc in the same change. see [documentation maintenance protocol](#documentation-maintenance-protocol).
- keep `CLAUDE.md` and `AGENTS.md` in sync. they are intentionally near-identical. divergence is a bug.

## important rules

- **use Context7 MCP** to fetch up-to-date docs for any library, framework, or API task (`mcp__context7__resolve-library-id`, `mcp__context7__query-docs`).
- **use Web Search** when Context7 is insufficient or info needs to be current.
- **ask clarification questions** if requirements are unclear, before proceeding.
- **no unsolicited tests.** do not add or update automated tests (unit, integration, e2e) unless the user explicitly asks for test work.
- **environment & secrets.** keep secrets in `.env` or `.env.local`; never commit credentials. document new env vars in `.env.example`.

## coding style & naming

_(pending stack)_ — define once the toolchain lands (language, framework, formatter, import alias). record the conventions here and the full tooling detail in `docs/project-map/tooling.md`.

## testing layout

_(pending stack)_ — define the single test convention (where shared mocks/fixtures live, where unit tests live, where e2e lives) once a test framework is chosen.

## commit & pull request guidelines

- concise, imperative commit messages; keep related changes together.
- for PRs, describe the affected surface, link related issues, and include screenshots for UI changes.

## documentation maintenance protocol

- before changing routes, APIs, shared UI, auth, services, tooling, or shared types, read the matching `docs/project-map/*` doc first.
- when a change alters behavior, architecture, integrations, commands, or verification workflow, update the affected `docs/project-map/*` file in the same change.
- when rules change, edit this file. root stubs `CLAUDE.md` and `AGENTS.md` only need touching if the pointer or purpose line changes — keep them in sync.
- when you ship something that changes project-map structure (a leaf doc added/removed/renamed, an index format change) or a notable feature, prepend a one-line entry to the `## changelog` section in `docs/project-map/README.md`.

## development commands

_(pending stack)_ — fill in `install` / `dev` / `build` / `lint` / `typecheck` / `test` once a package manifest exists.

- `tsx scripts/build-index.ts` regenerates `docs/project-map/index/*.json` from `src/`. it has no npm dependencies but is TypeScript, so it needs a TS runner (`tsx`, or Node ≥22.6 with `--experimental-strip-types`); this repo is on Node 20 with no runner installed, so it does not run yet. once a `package.json` and toolchain exist, alias it as `yarn index` and add a `yarn index:check` that rebuilds + fails on drift.

> the generator produces empty results until `src/app`, `src/components/ui`, and `src/` exist; the committed index files are hand-seeded with that empty output for now.

## common pitfalls

patterns that have actually bitten in this repo. read before doing similar work.

- _none recorded yet._

add to this list when something bites. keep each entry to one line of rule + one of context.

## project-map pointer table

start at `docs/project-map/README.md`, then load the subtree doc relevant to the task:

| task area | read this |
|---|---|
| repo overview | `docs/project-map/README.md` |
| look up routes, pages, components, exported symbols | `docs/project-map/index/README.md` (machine-readable JSON) |
| project-specific terms / acronyms | `docs/project-map/glossary.md` |
| PM/Dev agent system (workflows, prompts, permissions) | `docs/project-map/agents.md` |

> as subsystems land, add one row per leaf doc (e.g. `app architecture`, `service / lib layer`, `API routes`, `shared UI`) pointing at its `docs/project-map/*` file.
