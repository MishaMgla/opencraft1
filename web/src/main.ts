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
// Every player renders as this generated character (with its walk cycle) when
// the asset is present in the manifest; resolveCharacter returns null otherwise,
// so setSkin is a no-op and the procedural token shows (spec #83/#84 fallback).
const PLAYER_SKIN = 'horse';

const ROLE_NAMES = new Map<number, string>([
  [ROLE_PULSE, 'Pulse'],
  [ROLE_CROSS, 'Cross'],
  [ROLE_TRAIL, 'Trail'],
]);

interface RosterPlayer {
  id: number;
  name: string;
  role: number;
  charge: number;
  ready: boolean;
}

const overlay = document.getElementById('overlay')!;
const nameForm = document.getElementById('name-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
let startPromise: Promise<void> | null = null;

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

function selectedRole(): number | null {
  const selected = document.querySelector<HTMLInputElement>('input[name="role"]:checked');
  return selected ? Number(selected.value) : null;
}

async function join(name: string, role: number): Promise<void> {
  if (startPromise) return startPromise;
  saveUsername(name);
  overlay.style.display = 'none';
  startPromise = start(name, role);
  return startPromise;
}

nameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const role = selectedRole();
  if (role === null) return;
  await join(normalizeUsername(nameInput.value), role);
});

const savedUsername = loadSavedUsername();
if (savedUsername) {
  const role = selectedRole();
  nameInput.value = savedUsername;
  if (role !== null) void join(savedUsername, role);
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

async function start(name: string, role: number): Promise<void> {
  const manifest = await loadManifest();
  const hudAsset = document.getElementById('hud-asset') as HTMLImageElement | null;
  const bar = resolveHud(manifest, 'healthbar');
  if (hudAsset && bar) { hudAsset.src = assetUrl(bar.file); hudAsset.style.display = 'block'; }
  const r = await createRenderer(manifest);
  void r.skinLocal(PLAYER_SKIN); // horse skin for the local player (no-op without the asset)
  const input = createInput();
  const hudName = document.getElementById('hud-name') as HTMLButtonElement;
  const hudStatus = document.getElementById('hud-status')!;
  const profileDialog = document.getElementById('profile-modal') as HTMLDialogElement;
  const profileForm = document.getElementById('profile-form') as HTMLFormElement;
  const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
  const profileCancel = document.getElementById('profile-cancel') as HTMLButtonElement;
  const roster = document.getElementById('roster-list')!;
  const zoomOutButton = document.getElementById('zoom-out') as HTMLButtonElement;
  const zoomInButton = document.getElementById('zoom-in') as HTMLButtonElement;
  let currentName = name;
  let zoom = 1;

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

  function setZoom(nextZoom: number): void {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
    r.setZoom(zoom);
    zoomOutButton.disabled = zoom <= MIN_ZOOM;
    zoomInButton.disabled = zoom >= MAX_ZOOM;
  }

  zoomOutButton.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  zoomInButton.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  setZoom(zoom);

  hudName.addEventListener('click', () => {
    profileNameInput.value = currentName;
    profileDialog.showModal();
    profileNameInput.focus();
    profileNameInput.select();
  });
  profileCancel.addEventListener('click', () => profileDialog.close());
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nextName = normalizeUsername(profileNameInput.value);
    saveUsername(nextName);
    setDisplayName(nextName);
    profileDialog.close();
  });

  const me = { id: 0, x: 2048, y: 2048 };
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 8191, maxY: 8191 };
  const others = new Map<number, Token>();
  const rosterPlayers = new Map<number, RosterPlayer>();
  let lastHeldPaintTile = '';

  function upsertRosterPlayer(state: PlayerState): void {
    rosterPlayers.set(state.id, {
      id: state.id,
      name: state.id === me.id ? currentName : state.name || `player ${state.id}`,
      role: state.role,
      charge: state.charge,
      ready: state.ready,
    });
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

  const net = connect(await resolveWsUrl(), currentName, role, {
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
    },
    enter(m) {
      if (m.id === me.id) return;
      const token = r.addToken(m.id, m.name, m.color, m.x, m.y);
      others.set(m.id, token);
      void r.setSkin(token, PLAYER_SKIN); // horse skin for remote players (no-op without the asset)
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
    shake(m) {
      if (m.id === me.id) {
        r.shakeLocal();
        return;
      }
      const o = others.get(m.id);
      if (o) r.shakeToken(o);
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
  });

  let last = performance.now();
  let acc = 0;
  r.app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    input.step(me, MOVE_SPEED, dt, bounds);
    if (me.id !== 0 && input.consumePaint()) {
      net.sendInput(Math.round(me.x), Math.round(me.y));
      net.sendPaint();
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (me.id !== 0 && input.isPaintHeld()) {
      const currentTile = paintTileKey(me.x, me.y, bounds);
      if (currentTile !== lastHeldPaintTile) {
        lastHeldPaintTile = currentTile;
        net.sendInput(Math.round(me.x), Math.round(me.y));
        net.sendPaint();
      }
    } else {
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (me.id !== 0 && input.consumeUlt()) {
      net.sendUlt();
    }
    if (me.id !== 0 && input.consumeJump()) {
      net.sendJump();
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
      if (me.id !== 0) net.sendInput(Math.round(me.x), Math.round(me.y));
    }

    hudStatus.textContent = `players online: ${rosterPlayers.size}`;
  });
}
