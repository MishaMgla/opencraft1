import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { resolveWsUrl } from './config.js';
import { loadManifest, resolveHud, assetUrl } from './assets.js';
import { ROLE_CROSS, ROLE_PULSE, ROLE_TRAIL } from './wire.js';
import type { Bounds } from './input.js';
import type { Token } from './render.js';
import type { PlayerState } from './wire.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const PAINT_TILE_SIZE = 128;
const ULT_CHARGE_NEEDED = 12;
const USERNAME_STORAGE_KEY = 'opencraft1.username';
const CHARACTER_STORAGE_KEY = 'opencraft1.character';
const MOBILE_MAX_WIDTH_PX = 760;
const TAP_MOVE_MAX_DRIFT_PX = 12;
const DEFAULT_CHARACTER = 'horse-pro';

const CHARACTER_NAMES = new Map<string, string>([
  ['horse-pro', 'Horse'],
  ['pigeon-man-pro', 'Pigeon Man'],
  ['pinniped-man-pro', 'Pinniped Man'],
  ['jesus-pro', 'Jesus'],
]);

const ROLE_NAMES = new Map<number, string>([
  [ROLE_PULSE, 'Pulse'],
  [ROLE_CROSS, 'Cross'],
  [ROLE_TRAIL, 'Trail'],
]);

interface RosterPlayer {
  id: number;
  name: string;
  character: string;
  role: number;
  charge: number;
  ready: boolean;
}

const overlay = document.getElementById('overlay')!;
const nameForm = document.getElementById('name-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
let startPromise: Promise<void> | null = null;

function showStartupLoading(): void {
  overlay.hidden = false;
  overlay.dataset.state = 'loading';
  overlay.setAttribute('aria-busy', 'true');
}

function showEntryForm(): void {
  overlay.hidden = false;
  overlay.dataset.state = 'entry';
  overlay.setAttribute('aria-busy', 'false');
  nameInput.focus();
}

function hideOverlay(): void {
  overlay.hidden = true;
  overlay.setAttribute('aria-busy', 'false');
}

function normalizeUsername(value: string): string {
  return value.trim() || 'anon';
}

function loadSavedUsername(): string | null {
  try {
    const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
    return saved && saved.trim() ? saved.trim() : null;
  } catch {
    return null;
  }
}

function saveUsername(name: string): void {
  try {
    localStorage.setItem(USERNAME_STORAGE_KEY, name);
  } catch {
    // The game still works when browser storage is blocked.
  }
}

function validCharacter(value: string | null): string | null {
  return value && CHARACTER_NAMES.has(value) ? value : null;
}

function loadSavedCharacter(): string | null {
  try {
    return validCharacter(localStorage.getItem(CHARACTER_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveCharacter(character: string): void {
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, character);
  } catch {
    // The game still works when browser storage is blocked.
  }
}

function selectedRole(): number | null {
  const selected = document.querySelector<HTMLInputElement>('input[name="role"]:checked');
  return selected ? Number(selected.value) : null;
}

function selectedCharacter(group = 'character'): string | null {
  const selected = document.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`);
  return validCharacter(selected?.value ?? null);
}

function setCharacterChoice(group: string, character: string | null): void {
  if (!character) return;
  const input = document.querySelector<HTMLInputElement>(`input[name="${group}"][value="${character}"]`);
  if (input) input.checked = true;
}

async function join(name: string, role: number, character: string): Promise<void> {
  if (startPromise) return startPromise;
  saveUsername(name);
  saveCharacter(character);
  showStartupLoading();
  startPromise = start(name, role, character);
  try {
    await startPromise;
    hideOverlay();
  } catch (err) {
    console.error('startup failed', err);
    startPromise = null;
    showEntryForm();
  }
}

nameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const role = selectedRole();
  const character = selectedCharacter();
  if (role === null || character === null) return;
  await join(normalizeUsername(nameInput.value), role, character);
});

const savedUsername = loadSavedUsername();
const savedCharacter = loadSavedCharacter();
setCharacterChoice('character', savedCharacter);
if (savedUsername && savedCharacter) {
  const role = selectedRole();
  nameInput.value = savedUsername;
  if (role !== null) {
    void join(savedUsername, role, savedCharacter);
  } else {
    showEntryForm();
  }
} else {
  if (savedUsername) nameInput.value = savedUsername;
  showEntryForm();
}

function paintTileKey(x: number, y: number, bounds: Bounds): string {
  const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, x));
  const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, y));
  const tx = Math.round(clampedX / PAINT_TILE_SIZE) * PAINT_TILE_SIZE;
  const ty = Math.round(clampedY / PAINT_TILE_SIZE) * PAINT_TILE_SIZE;
  return `${tx},${ty}`;
}

function roleName(role: number): string {
  return ROLE_NAMES.get(role) ?? 'Pulse';
}

function shouldUseMobileControls(): boolean {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const mobileSize = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
  return coarsePointer && mobileSize;
}

async function start(name: string, role: number, character: string): Promise<void> {
  const manifest = await loadManifest();
  const hudAsset = document.getElementById('hud-asset') as HTMLImageElement | null;
  const bar = resolveHud(manifest, 'healthbar');
  if (hudAsset && bar) { hudAsset.src = assetUrl(bar.file); hudAsset.style.display = 'block'; }
  const r = await createRenderer(manifest);
  void r.skinLocal(character); // no-op without the asset; procedural token remains playable
  const input = createInput();
  const hudName = document.getElementById('hud-name') as HTMLButtonElement;
  const hudStatus = document.getElementById('hud-status')!;
  const profileDialog = document.getElementById('profile-modal') as HTMLDialogElement;
  const profileForm = document.getElementById('profile-form') as HTMLFormElement;
  const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
  const profileCancel = document.getElementById('profile-cancel') as HTMLButtonElement;
  const roster = document.getElementById('roster-list')!;
  const controlsHelpButton = document.getElementById('controls-help-toggle') as HTMLButtonElement;
  const controlsHelpPanel = document.getElementById('controls-help-panel')!;
  const zoomOutButton = document.getElementById('zoom-out') as HTMLButtonElement;
  const zoomInButton = document.getElementById('zoom-in') as HTMLButtonElement;
  const mobileControls = document.getElementById('mobile-controls') as HTMLDivElement;
  const mobilePaint = document.getElementById('mobile-paint') as HTMLButtonElement;
  const mobileJump = document.getElementById('mobile-jump') as HTMLButtonElement;
  const mobileUlt = document.getElementById('mobile-ult') as HTMLButtonElement;
  let currentName = name;
  let currentCharacter = character;
  let zoom = 1;
  let ready = false;
  let startupTimer = 0;
  let net: ReturnType<typeof connect> | null = null;
  let resolveReady: () => void = () => {};
  let rejectReady: (err: Error) => void = () => {};
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function finishStartup(): void {
    if (ready) return;
    ready = true;
    window.clearTimeout(startupTimer);
    resolveReady();
  }

  function failStartup(message: string): void {
    if (ready) return;
    ready = true;
    window.clearTimeout(startupTimer);
    rejectReady(new Error(message));
    if (net) net.close();
  }

  function setDisplayName(nextName: string): void {
    currentName = nextName;
    hudName.textContent = nextName;
    r.setLocalName(nextName);
    const localRosterPlayer = rosterPlayers.get(me.id);
    if (localRosterPlayer) {
      localRosterPlayer.name = nextName;
      renderRoster();
    }
  }

  function setDisplayCharacter(nextCharacter: string): void {
    currentCharacter = nextCharacter;
    void r.skinLocal(nextCharacter);
    const localRosterPlayer = rosterPlayers.get(me.id);
    if (localRosterPlayer) {
      localRosterPlayer.character = nextCharacter;
      renderRoster();
    }
  }

  function setZoom(nextZoom: number): void {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
    r.setZoom(zoom);
    zoomOutButton.disabled = zoom <= MIN_ZOOM;
    zoomInButton.disabled = zoom >= MAX_ZOOM;
  }

  zoomOutButton.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  zoomInButton.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  setZoom(zoom);

  function syncMobileControls(): void {
    const enabled = shouldUseMobileControls();
    document.body.classList.toggle('mobile-controls-enabled', enabled);
    mobileControls.hidden = !enabled;
  }

  syncMobileControls();
  window.addEventListener('resize', syncMobileControls);

  function setControlsHelpOpen(open: boolean): void {
    controlsHelpPanel.hidden = !open;
    controlsHelpButton.setAttribute('aria-expanded', String(open));
  }

  controlsHelpButton.addEventListener('click', (e) => {
    e.stopPropagation();
    setControlsHelpOpen(controlsHelpPanel.hidden);
  });
  controlsHelpPanel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => setControlsHelpOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setControlsHelpOpen(false);
  });

  hudName.addEventListener('click', () => {
    profileNameInput.value = currentName;
    setCharacterChoice('profile-character', currentCharacter);
    profileDialog.showModal();
    profileNameInput.focus();
    profileNameInput.select();
  });
  profileCancel.addEventListener('click', () => profileDialog.close());
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nextName = normalizeUsername(profileNameInput.value);
    const nextCharacter = selectedCharacter('profile-character') ?? currentCharacter;
    saveUsername(nextName);
    saveCharacter(nextCharacter);
    setDisplayName(nextName);
    setDisplayCharacter(nextCharacter);
    profileDialog.close();
  });

  const me = { id: 0, x: 2048, y: 2048 };
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 8191, maxY: 8191 };
  const others = new Map<number, Token>();
  const rosterPlayers = new Map<number, RosterPlayer>();
  let lastHeldPaintTile = '';
  let tapStart: { id: number; x: number; y: number } | null = null;

  r.app.canvas.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('mobile-controls-enabled') || !e.isPrimary || e.button !== 0) return;
    tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  r.app.canvas.addEventListener('pointerup', (e) => {
    if (!tapStart || tapStart.id !== e.pointerId) return;
    const drift = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    tapStart = null;
    if (!document.body.classList.contains('mobile-controls-enabled') || drift > TAP_MOVE_MAX_DRIFT_PX) return;
    e.preventDefault();
    input.setMoveDestination(r.screenToWorld(e.clientX, e.clientY), bounds);
  });
  r.app.canvas.addEventListener('pointercancel', (e) => {
    if (tapStart?.id === e.pointerId) tapStart = null;
  });

  mobilePaint.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.requestPaint(true);
    mobilePaint.setPointerCapture(e.pointerId);
  });
  mobilePaint.addEventListener('pointerup', (e) => {
    e.preventDefault();
    input.releasePaint();
    if (mobilePaint.hasPointerCapture(e.pointerId)) mobilePaint.releasePointerCapture(e.pointerId);
  });
  mobilePaint.addEventListener('pointercancel', () => input.releasePaint());
  mobileJump.addEventListener('click', () => input.requestJump());
  mobileUlt.addEventListener('click', () => input.requestUlt());

  function upsertRosterPlayer(state: PlayerState): void {
    rosterPlayers.set(state.id, {
      id: state.id,
      name: state.id === me.id ? currentName : state.name || `player ${state.id}`,
      character: state.id === me.id ? currentCharacter : validCharacter(state.character) ?? DEFAULT_CHARACTER,
      role: state.role,
      charge: state.charge,
      ready: state.ready,
    });
    const token = others.get(state.id);
    if (token) void r.setSkin(token, validCharacter(state.character) ?? DEFAULT_CHARACTER);
    renderRoster();
  }

  function renderRoster(): void {
    const rows = [...rosterPlayers.values()].sort((a, b) => a.id - b.id);
    roster.replaceChildren(
      ...rows.map((p) => {
        const row = document.createElement('div');
        row.className = 'roster-row';

        const identity = document.createElement('span');
        identity.className = 'roster-name';
        identity.textContent = p.name;

        const roleLabel = document.createElement('span');
        roleLabel.className = 'roster-role';
        roleLabel.textContent = roleName(p.role);

        const ult = document.createElement('span');
        ult.className = p.ready ? 'roster-ult ready' : 'roster-ult';
        ult.textContent = p.ready ? 'ready' : `${Math.min(p.charge, ULT_CHARGE_NEEDED)}/${ULT_CHARGE_NEEDED}`;

        row.append(identity, roleLabel, ult);
        return row;
      }),
    );
  }

  // E2E test hook (inert in prod). These objects are mutated in place by the
  // game loop, so exposing the references once is enough for a test to read
  // live state. Enabled by an init script that sets window.__E2E before load.
  if (window.__E2E) window.__game = { me, others, bounds };
  setDisplayName(currentName);

  let conn: ReturnType<typeof connect>;
  try {
    conn = connect(await resolveWsUrl(), currentName, role, currentCharacter, {
      welcome(m) {
        me.id = m.id;
        // Adopt the server's spawn position (restored for returning players, else
        // world center). Must happen before we stream input — the loop gates
        // sendInput on me.id so no frame leaves until this runs.
        me.x = m.x;
        me.y = m.y;
        bounds.minX = m.minX;
        bounds.minY = m.minY;
        bounds.maxX = m.maxX;
        bounds.maxY = m.maxY;
        lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
        finishStartup();
      },
      enter(m) {
        if (m.id === me.id) return;
        const token = r.addToken(m.id, m.name, m.color, m.x, m.y);
        others.set(m.id, token);
        void r.setSkin(token, validCharacter(m.character) ?? DEFAULT_CHARACTER);
      },
      leave(m) {
        const o = others.get(m.id);
        if (o) {
          r.removeToken(o);
          others.delete(m.id);
        }
        rosterPlayers.delete(m.id);
        renderRoster();
      },
      snapshot(m) {
        for (const e of m.ents) {
          if (e.id === me.id) continue;
          const o = others.get(e.id);
          if (o) {
            o.tx = e.x;
            o.ty = e.y;
          }
        }
      },
      paint(m) {
        r.paintTile(m.x, m.y, m.color);
      },
      jump(m) {
        if (m.id === me.id) {
          r.jumpLocal();
          return;
        }
        const o = others.get(m.id);
        if (o) r.jumpToken(o);
      },
      player(m) {
        upsertRosterPlayer(m);
      },
      close() {
        failStartup('Connection closed before server welcome');
      },
    });
  } catch (err) {
    r.app.canvas.remove();
    throw err;
  }
  net = conn;
  startupTimer = window.setTimeout(() => failStartup('Timed out waiting for server welcome'), 10000);

  let last = performance.now();
  let acc = 0;
  const tick = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    input.step(me, MOVE_SPEED, dt, bounds);
    if (me.id !== 0 && input.consumePaint()) {
      conn.sendInput(Math.round(me.x), Math.round(me.y));
      conn.sendPaint();
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (me.id !== 0 && input.isPaintHeld()) {
      const currentTile = paintTileKey(me.x, me.y, bounds);
      if (currentTile !== lastHeldPaintTile) {
        lastHeldPaintTile = currentTile;
        conn.sendInput(Math.round(me.x), Math.round(me.y));
        conn.sendPaint();
      }
    } else {
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (me.id !== 0 && input.consumeUlt()) {
      conn.sendUlt();
    }
    if (me.id !== 0 && input.consumeJump()) {
      conn.sendJump();
    }
    r.setLocal(me.x, me.y);

    for (const o of others.values()) {
      o.rx += (o.tx - o.rx) * 0.2; // smooth toward latest snapshot
      o.ry += (o.ty - o.ry) * 0.2;
      r.placeToken(o);
    }

    r.centerCamera(me.x, me.y);

    acc += dt;
    if (acc >= 1 / INPUT_HZ) {
      acc = 0;
      // Don't stream input until Welcome has set our id + spawn position, or the
      // first frames would overwrite a returning player's restored position.
      if (me.id !== 0) conn.sendInput(Math.round(me.x), Math.round(me.y));
    }

    hudStatus.textContent = `players online: ${rosterPlayers.size}`;
  };
  r.app.ticker.add(tick);

  try {
    await readyPromise;
  } catch (err) {
    r.app.ticker.remove(tick);
    r.app.canvas.remove();
    throw err;
  }
}
