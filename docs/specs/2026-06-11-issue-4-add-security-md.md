# spec: Add SECURITY.md with a one-line policy (#4)

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

## Goal

Add a top-level `SECURITY.md` file that tells security reporters where to submit vulnerability reports.

## Context

GitHub surfaces `SECURITY.md` at the repo root as the project's security policy. Without it, reporters have no designated channel. The opencraft1 repository currently has no security policy file.

## Requirements

1. A file named `SECURITY.md` exists at the repository root.
2. The file body is exactly one line: `Report security issues by opening a private advisory.`
3. No other content appears in the file (no headings, no blank lines beyond a single trailing newline, no additional prose).

## Out of scope

- GitHub repository settings (enabling private security advisories, branch protection, etc.).
- Any changes to existing documentation or project-map files.
- Policy prose beyond the single required line.

## Acceptance

A reviewer confirms the task is done by running:

```sh
cat SECURITY.md
```

Expected output:

```
Report security issues by opening a private advisory.
```

And verifying that `wc -l SECURITY.md` returns `1`.
