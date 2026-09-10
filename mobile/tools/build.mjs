import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkedOrigin } from '../src/transport.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(root, '..');
const origin = checkedOrigin(process.env.OPENCRAFT_MOBILE_ORIGIN || 'https://opencraft1.com');
const output = resolve(root, 'dist');
async function copy(source, target) {
  const to = resolve(output, target);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(resolve(repo, source), to);
}
// Fixed generated output only; remove stale assets from previous builds.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Explicit assets only; never copy repository contents, .env, or all node_modules.
await copy('web/evolving/style.css', 'evolving/style.css');
for (const file of await readdir(resolve(repo, 'web/src/evolving'))) {
  if (file.endsWith('.js')) await copy(`web/src/evolving/${file}`, `src/evolving/${file}`);
}
for (const file of ['net.js', 'wire.js']) await copy(`web/src/${file}`, `src/${file}`);
for (const file of ['three.module.js', 'three.core.js']) await copy(`web/node_modules/three/build/${file}`, `preview-vendor/${file}`);
await copy('mobile/node_modules/@capacitor/core/dist/index.js', 'preview-vendor/capacitor.js');
await copy('mobile/src/native.js', 'native.js');
await copy('mobile/src/transport.js', 'native-transport.js');
await writeFile(resolve(output, 'native-config.json'), JSON.stringify({ origin }));
const html = await readFile(resolve(repo, 'web/evolving/index.html'), 'utf8');
const marker = "import('/src/evolving/main.js')";
if (html.split(marker).length !== 2) throw new Error('Game entry changed: update the native bootstrap');
await writeFile(resolve(output, 'index.html'), html.replace(marker, `import('/native.js').then(() => ${marker})`));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({ revision, dirty, origin }));
console.log(`Prepared shared game assets for ${origin} (${revision.slice(0, 7)}${dirty ? ', working tree' : ''}).`);
