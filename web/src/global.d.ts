import type { Token } from './render.js';
import type { Bounds } from './input.js';

declare global {
  interface Window {
    __E2E?: boolean;
    __game?: {
      me: { id: number; x: number; y: number };
      others: Map<number, Token>;
      bounds: Bounds;
    };
  }
}

export {};
