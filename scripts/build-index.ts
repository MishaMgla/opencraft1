/**
 * Build machine-readable index of routes/pages/components/exports.
 * Outputs four JSON files under docs/project-map/index/ for AI agents
 * (and humans) to consult before resorting to grep.
 *
 * Run: node scripts/build-index.ts        — regenerate (dependency-free)
 *      yarn index                          — alias, once a package.json exists
 *      yarn index:check                    — regenerate + fail on drift (CI)
 *
 * Assumes a Next.js App Router layout (src/app, src/components/ui, src/).
 * Produces empty results against a bare scaffold; adjust AUTH_MARKERS to
 * match this repo's auth helper once it exists.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

const HTTP_VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
type HttpVerb = (typeof HTTP_VERBS)[number];

const AUTH_MARKERS = ["getServerSession", "getAuthUser"] as const;

export type RouteEntry = { method: HttpVerb; path: string; file: string; auth: "protected" | "public" };
export type PageEntry = { url: string; file: string };
export type ComponentEntry = { name: string; file: string; role: string };
export type ExportKind = "const" | "function" | "class" | "type" | "interface" | "default";
export type ExportEntry = { file: string; kind: ExportKind };
export type ExportsMap = Record<string, ExportEntry | ExportEntry[]>;

async function walk(dir: string, filter: (p: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  async function recurse(d: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__" || e.name === "__mocks__") continue;
        await recurse(full);
      } else if (e.isFile() && filter(full)) {
        out.push(full);
      }
    }
  }
  await recurse(dir);
  return out.sort();
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function relFromRoot(root: string, p: string): string {
  return toPosix(path.relative(root, p));
}

// ---------- routes ----------

function appUrlFromFile(file: string, appDir: string): string {
  // file is absolute; strip appDir prefix and trailing /(page|route).tsx?
  const rel = toPosix(path.relative(appDir, file));
  const dir = rel.replace(/\/(page|route)\.tsx?$/, "");
  if (dir === "" || dir === ".") return "/";
  const segments = dir.split("/").filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

export function extractRoutesFromSource(src: string, file: string, urlRoot: string): RouteEntry[] {
  const url = urlRoot;
  const auth: "protected" | "public" = AUTH_MARKERS.some((m) => new RegExp(`\\b${m}\\b`).test(src)) ? "protected" : "public";
  const verbs: HttpVerb[] = [];
  for (const v of HTTP_VERBS) {
    // export async function GET / export function GET / export const GET =
    const re = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+|const\\s+)${v}\\b`);
    if (re.test(src)) verbs.push(v);
  }
  return verbs.map((method) => ({ method, path: url, file, auth }));
}

async function extractRoutes(root: string): Promise<RouteEntry[]> {
  const apiDir = path.join(root, "src/app/api");
  const appDir = path.join(root, "src/app");
  const files = await walk(apiDir, (f) => /\/route\.tsx?$/.test(toPosix(f)));
  const out: RouteEntry[] = [];
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const url = appUrlFromFile(file, appDir);
    const rel = relFromRoot(root, file);
    out.push(...extractRoutesFromSource(src, rel, url));
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// ---------- pages ----------

async function extractPages(root: string): Promise<PageEntry[]> {
  const appDir = path.join(root, "src/app");
  const files = await walk(appDir, (f) => /\/page\.tsx?$/.test(toPosix(f)));
  const out: PageEntry[] = files.map((file) => ({
    url: appUrlFromFile(file, appDir),
    file: relFromRoot(root, file),
  }));
  return out.sort((a, b) => a.url.localeCompare(b.url));
}

// ---------- components ----------

const JSDOC_FIRST_LINE_RE = /\/\*\*\s*\n?\s*\*?\s*([^\n*]+)/;

export function extractComponentFromSource(src: string, basename: string): { name: string; role: string } | null {
  const defaultMatch = src.match(/export\s+default\s+(?:function\s+(\w+)|(\w+))/);
  const defaultName = defaultMatch ? defaultMatch[1] || defaultMatch[2] : null;
  const namedRe = new RegExp(`export\\s+(?:const|function|class)\\s+(${basename})\\b`);
  const namedMatch = src.match(namedRe);
  const name = defaultName || (namedMatch ? namedMatch[1] : null) || basename;
  // Find first JSDoc that precedes any export
  const exportIdx = src.search(/export\s+/);
  const before = exportIdx >= 0 ? src.slice(0, exportIdx) : src;
  // Look for JSDoc immediately before the export (allow whitespace)
  const tail = src.slice(0, exportIdx >= 0 ? exportIdx : src.length);
  const jsdocMatches = [...tail.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
  let role = "";
  if (jsdocMatches.length > 0) {
    const last = jsdocMatches[jsdocMatches.length - 1][1];
    const firstLine = last.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).find((l) => l.length > 0);
    role = firstLine ?? "";
  }
  void before;
  void JSDOC_FIRST_LINE_RE;
  return { name, role };
}

async function extractComponents(root: string): Promise<ComponentEntry[]> {
  const uiDir = path.join(root, "src/components/ui");
  let files: string[];
  try {
    const entries = await fs.readdir(uiDir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)).map((e) => path.join(uiDir, e.name));
  } catch {
    return [];
  }
  const out: ComponentEntry[] = [];
  for (const file of files.sort()) {
    const src = await fs.readFile(file, "utf8");
    const basename = path.basename(file).replace(/\.tsx?$/, "");
    const parsed = extractComponentFromSource(src, basename);
    if (!parsed) continue;
    out.push({ name: parsed.name, file: relFromRoot(root, file), role: parsed.role });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- exports ----------

const EXPORT_RE = /^export\s+(?:async\s+)?(const|function|class|type|interface|default)\s+(\w+)/gm;
const EXPORT_DEFAULT_FN_RE = /^export\s+default\s+(?:async\s+)?function\s+(\w+)/gm;

export function extractExportsFromSource(src: string): Array<{ name: string; kind: ExportKind }> {
  const found = new Map<string, ExportKind>();
  // strip block + line comments to avoid matching examples in JSDoc
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  let m: RegExpExecArray | null;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(stripped)) !== null) {
    const kindRaw = m[1];
    const name = m[2];
    if (kindRaw === "default") {
      // covered below
      continue;
    }
    const kind = kindRaw as ExportKind;
    if (!found.has(name)) found.set(name, kind);
  }
  EXPORT_DEFAULT_FN_RE.lastIndex = 0;
  while ((m = EXPORT_DEFAULT_FN_RE.exec(stripped)) !== null) {
    const name = m[1];
    if (!found.has(name)) found.set(name, "default");
  }
  return Array.from(found, ([name, kind]) => ({ name, kind }));
}

function shouldSkipExportFile(file: string): boolean {
  const base = path.basename(file);
  if (base.startsWith("_")) return true;
  if (/\.(test|spec)\.(ts|tsx)$/.test(base)) return true;
  return false;
}

async function extractExports(root: string): Promise<ExportsMap> {
  const srcDir = path.join(root, "src");
  const files = await walk(srcDir, (f) => /\.(ts|tsx)$/.test(f) && !shouldSkipExportFile(f));
  const map: ExportsMap = {};
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const entries = extractExportsFromSource(src);
    const rel = relFromRoot(root, file);
    for (const { name, kind } of entries) {
      const entry: ExportEntry = { file: rel, kind };
      const existing = map[name];
      if (!existing) {
        map[name] = entry;
      } else if (Array.isArray(existing)) {
        existing.push(entry);
      } else {
        map[name] = [existing, entry];
      }
    }
  }
  // sort keys + sort collision arrays for stability
  const sorted: ExportsMap = {};
  for (const key of Object.keys(map).sort()) {
    const v = map[key];
    if (Array.isArray(v)) {
      sorted[key] = v.slice().sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
    } else {
      sorted[key] = v;
    }
  }
  return sorted;
}

// ---------- main ----------

async function writeJson(file: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2) + "\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

export async function buildIndex(root: string): Promise<void> {
  const outDir = path.join(root, "docs/project-map/index");
  const [routes, pages, components, exportsMap] = await Promise.all([
    extractRoutes(root),
    extractPages(root),
    extractComponents(root),
    extractExports(root),
  ]);
  await Promise.all([
    writeJson(path.join(outDir, "routes.json"), routes),
    writeJson(path.join(outDir, "pages.json"), pages),
    writeJson(path.join(outDir, "components.json"), components),
    writeJson(path.join(outDir, "exports.json"), exportsMap),
  ]);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-index.ts");
if (isMain) {
  buildIndex(process.cwd()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
