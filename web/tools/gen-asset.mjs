// web/tools/gen-asset.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './pixellab.mjs';
import { DIRECTIONS } from './contract.mjs';
import {
  assetsDir, assetKey, validateSlug, enforceCaps, readManifest, upsertManifest, defaultPlacement,
} from './manifest.mjs';

const TYPE_DIR = { tile: 'tiles', character: 'characters', hud: 'hud', effect: 'effects' };

function parseArgs(argv) {
  const a = { size: undefined, directions: 4, frames: 4, force: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--force') { a.force = true; continue; }
    const v = argv[++i];
    if (k === '--type') a.type = v;
    else if (k === '--name') a.name = v;
    else if (k === '--prompt') a.prompt = v;
    else if (k === '--size') a.size = Number(v);
    else if (k === '--directions') a.directions = Number(v);
    else if (k === '--frames') a.frames = Number(v);
    else if (k === '--view') a.view = v;
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.type || !a.name || !a.prompt) throw new Error('required: --type --name --prompt');
  if (a.size === undefined) a.size = (a.type === 'tile' || a.type === 'hud') ? 128 : 64;
  return a;
}

export async function run(argv, { generateImpl = generate, env = process.env } = {}) {
  const a = parseArgs(argv);
  validateSlug(a.name);
  if (a.type === 'effect') {
    // /animate-with-text animates an EXISTING sprite (requires a base
    // reference_image + action); it cannot synthesize an effect from text
    // alone. Reject scratch effect generation until the two-step pipeline
    // (generate a base frame -> animate it) is built. The effect category
    // stays in the manifest/render schema for that future path.
    throw new Error('effect generation is not supported via scratch asset generation: '
      + '/animate-with-text needs a base reference sprite + action. Generate the base '
      + 'sprite first, then animate (two-step pipeline not yet built).');
  }
  if (a.type === 'character' && a.directions !== 4) throw new Error('v1 supports 4-direction characters only (got ' + a.directions + ')');
  enforceCaps(a.type, a.size, a.frames);
  const key = assetKey(a.type, a.name);

  if (!a.force && readManifest().assets[key]) {
    console.log(`gen-asset: ${key} already exists — skipping (use --force to regenerate).`);
    return { skipped: true, key, files: [] };
  }

  const { images } = await generateImpl(
    { type: a.type, prompt: a.prompt, size: a.size, frames: a.frames, directions: a.directions, view: a.view },
    { apiKey: env.PIXELLAB_API_KEY },
  );

  const dir = TYPE_DIR[a.type];
  const placement = defaultPlacement(a.type);
  const files = [];
  let entry;

  if (a.type === 'character') {
    const frames = {};
    DIRECTIONS.slice(0, a.directions).forEach((d, i) => {
      const rel = `${dir}/${a.name}-${d}.png`;
      writeFileSync(join(assetsDir(), rel), images[i]);
      frames[d] = rel; files.push(rel);
    });
    entry = { type: 'character', name: a.name, directions: a.directions, size: a.size, frames, prompt: a.prompt, placement };
  } else {
    const rel = `${dir}/${a.name}.png`;
    writeFileSync(join(assetsDir(), rel), images[0]);
    files.push(rel);
    entry = { type: a.type, name: a.name, file: rel, size: a.size, prompt: a.prompt, placement };
  }

  upsertManifest(entry);
  console.log(`gen-asset: wrote ${key} (${files.length} file(s)).`);
  return { skipped: false, key, files };
}

// CLI entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2), {}).catch((e) => { console.error(`gen-asset: ${e.message}`); process.exit(1); });
}
