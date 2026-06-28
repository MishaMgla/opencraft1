import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInput } from '../src/input.js';

type Listener = (e: KeyboardEvent) => void;

class FakeKeyboardTarget {
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== 'function') return;
    const current = this.listeners.get(type) ?? [];
    current.push(listener as Listener);
    this.listeners.set(type, current);
  }

  dispatchKey(type: string, init: Partial<KeyboardEvent>): KeyboardEvent {
    let defaultPrevented = false;
    const event = {
      code: init.code ?? '',
      key: init.key ?? '',
      repeat: init.repeat ?? false,
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault() {
        defaultPrevented = true;
      },
    } as KeyboardEvent;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

test('F requests one paint action and prevents default browser handling', () => {
  const target = new FakeKeyboardTarget();
  const input = createInput(target as unknown as Window);

  const event = target.dispatchKey('keydown', { code: 'KeyF', key: 'f', repeat: false });

  assert.equal(event.defaultPrevented, true);
  assert.equal(input.consumePaint(), true);
  assert.equal(input.consumePaint(), false);
});

test('Space requests jump without paint', () => {
  const target = new FakeKeyboardTarget();
  const input = createInput(target as unknown as Window);

  const event = target.dispatchKey('keydown', { code: 'Space', key: ' ', repeat: false });

  assert.equal(event.defaultPrevented, true);
  assert.equal(input.consumeJump(), true);
  assert.equal(input.consumePaint(), false);
});

test('held F repeat does not queue another paint action', () => {
  const target = new FakeKeyboardTarget();
  const input = createInput(target as unknown as Window);

  target.dispatchKey('keydown', { code: 'KeyF', key: 'f', repeat: false });
  target.dispatchKey('keydown', { code: 'KeyF', key: 'f', repeat: true });

  assert.equal(input.consumePaint(), true);
  assert.equal(input.consumePaint(), false);
});
