export function movementInput(stick: HTMLButtonElement, knob: HTMLElement, enabled: () => boolean) {
  const keys = new Set<string>();
  const directions = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
  let pointer: number | null = null;
  let x = 0, y = 0;
  function clear() {
    keys.clear(); x = 0; y = 0;
    knob.style.transform = '';
    if (pointer !== null && stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer);
    pointer = null;
  }
  window.addEventListener('keydown', e => {
    if (!directions.has(e.code) || !enabled() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault(); keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  function move(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const rect = stick.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const radius = rect.width * .32;
    const length = Math.hypot(dx, dy);
    const scale = Math.min(1, radius / Math.max(length, 1));
    x = length < 6 ? 0 : dx * scale / radius;
    y = length < 6 ? 0 : dy * scale / radius;
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
  stick.addEventListener('pointerdown', e => {
    if (!enabled() || pointer !== null || e.button !== 0) return;
    e.preventDefault(); pointer = e.pointerId; stick.setPointerCapture(pointer); move(e);
  });
  stick.addEventListener('pointermove', move);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(event, e => { if ((e as PointerEvent).pointerId === pointer) clear(); });
  }
  return {
    clear,
    direction() {
      if (!enabled()) return { x: 0, y: 0 };
      let dx = x + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      let dy = y + Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
      const length = Math.max(1, Math.hypot(dx, dy));
      return { x: dx / length, y: dy / length };
    },
  };
}
