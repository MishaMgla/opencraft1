import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

test('native package uses the shared scene and contains every local module import', async () => {
  const root = new URL('../dist/', import.meta.url);
  const read = path => readFile(new URL(path, root), 'utf8');
  assert.equal(await read('src/evolving/main.js'), await readFile(new URL('../../web/src/evolving/main.js', import.meta.url), 'utf8'));
  const html = await read('index.html');
  assert.match(html, /import\('\/native.js'\)\.then\(\(\) => import\('\/src\/evolving\/main.js'\)\)/);
  const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.server, undefined, 'no remotely loaded executable client');
  assert.equal(config.loggingBehavior, 'none', 'native HTTP may log cookie values');
  assert.equal(config.android.allowMixedContent, false);
  assert.equal(config.android.webContentsDebuggingEnabled, false);
  for (const path of await readdir(root, { recursive: true })) {
    assert.doesNotMatch(path, /(^|\/)\.env|\.ts$|node_modules/);
    if (!path.endsWith('.js')) continue;
    for (const match of (await read(path)).matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = imports[match[1]] || match[1];
      assert.match(specifier, /^(\/|\.\/|\.\.\/)/, `unbundled import in ${path}`);
      const target = specifier.startsWith('/') ? new URL(specifier.slice(1), root) : new URL(specifier, new URL(path, root));
      assert(target.href.startsWith(root.href), `import escapes package: ${path}`);
      assert((await stat(target)).isFile(), `missing import in ${path}`);
    }
  }
});
