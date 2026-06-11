# Spec: Add CONTRIBUTING.md with a one-line intro (#1)

## Goal

Create a top-level `CONTRIBUTING.md` whose entire body is the single line "Contributions welcome — open an issue to start the agent flow."

## Context

The repository has no `CONTRIBUTING.md` today. GitHub surfaces this file automatically on the "New issue" and "New pull request" pages, and in the repository root. The project uses an agent-driven workflow (see `docs/project-map/README.md`) where every contribution starts with an issue; the one-liner reinforces that entry point.

## Requirements

1. A file named `CONTRIBUTING.md` exists at the repository root.
2. The file contains exactly one line: `Contributions welcome — open an issue to start the agent flow.`
3. No other content appears in the file (no headings, no blank lines before or after, no trailing newline beyond what the line itself requires).

## Out of scope

- Detailed contribution guidelines, code-style docs, or setup instructions.
- Modifications to any other file.

## Acceptance

A reviewer confirms the spec is satisfied by running:

```
cat CONTRIBUTING.md
```

Output must be exactly:

```
Contributions welcome — open an issue to start the agent flow.
```
