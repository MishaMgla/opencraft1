// Types the runtime CDN import of PixiJS by re-exporting the npm package's
// declarations. The URL is the real runtime module; `pixi.js` is a types-only
// devDependency pinned to the same version as the CDN URL below.
declare module 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs' {
  export * from 'pixi.js';
}
