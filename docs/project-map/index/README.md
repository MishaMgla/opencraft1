# project-map index

machine-readable maps of the repo's external-facing surface. consult these before greping. for ground truth (signatures, types, JSDoc body), read the file the index points to.

> the four JSON files are currently empty — they populate once `src/app`, `src/components/ui`, and `src/` exist. the generator produces empty results (`[]` / `{}`) against a bare scaffold.

## files

| file | contents |
|---|---|
| `routes.json` | api routes: `{method, path, file, auth}` from `src/app/api/**/route.ts` |
| `pages.json` | app router pages: `{url, file}` from `src/app/**/page.tsx` |
| `components.json` | design system primitives in `src/components/ui/*`: `{name, file, role}` |
| `exports.json` | flat map of every exported symbol → `{file, kind}`. collisions become arrays. |

## regenerate

```
tsx scripts/build-index.ts      # rebuild all four files
```

the generator has no npm dependencies of its own, but it is TypeScript, so it needs a TS-aware runner — `tsx`, or Node ≥22.6 with `--experimental-strip-types` (this repo is currently on Node 20, with no runner installed, so it does not run yet). once a `package.json` and toolchain exist, alias the above as `yarn index`, and add `yarn index:check` (rebuild + fail on git drift, for CI). regenerate after adding or removing: api routes, pages, components, or exported symbols.

until then the four JSON files are hand-seeded empty (`[]` / `{}`) — the exact output the generator produces against a tree with no `src/`.

## known limits

- `export * from` re-exports are not followed. barrel-only symbols won't appear in `exports.json`.
- computed / dynamic exports are invisible.
- `auth` on routes is an import-name heuristic — checks for `getServerSession` or `getAuthUser` in the route file. false negatives are possible; verify before assuming a route is public. adjust the markers in `scripts/build-index.ts` to match this repo's auth helper once it exists.
- not a type checker. for signatures, JSDoc bodies, or call-site verification, read the file.

## source

generator: `scripts/build-index.ts`.
