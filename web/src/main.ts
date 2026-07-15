import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { resolveWsUrl } from './config.js';
import { loadManifest, resolveCharacter, assetUrl } from './assets.js';
import { ROLE_CROSS, ROLE_PULSE, ROLE_TRAIL } from './wire.js';
import { isTemplePosition } from './temple.js';
import type { Bounds } from './input.js';
import type { Token } from './render.js';
import type { PlayerState } from './wire.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;
const PAINT_TILE_SIZE = 128;
const ULT_CHARGE_NEEDED = 12;
const USERNAME_STORAGE_KEY = 'opencraft1.username';
const CHARACTER_STORAGE_KEY = 'opencraft1.character';
const MOBILE_MAX_WIDTH_PX = 760;
const TAP_MOVE_MAX_DRIFT_PX = 12;
const DEFAULT_CHARACTER = 'horse-poison';

const CHARACTER_NAMES = new Map<string, string>([
  ['horse-poison', 'Horse'],
  ['pigeon-poison', 'Pigeon Man'],
  ['pinniped-poison', 'Pinniped Man'],
  ['jesus-poison', 'Jesus'],
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
  kills: number;
}

const overlay = document.getElementById('overlay')!;
const nameForm = document.getElementById('name-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
let startPromise: Promise<void> | null = null;
const manifestPromise = loadManifest();

async function loadCharacterPreviews(): Promise<void> {
  const manifest = await manifestPromise;
  for (const preview of document.querySelectorAll<HTMLImageElement>('[data-character-preview]')) {
    const character = preview.dataset.characterPreview;
    if (!character) continue;
    const asset = resolveCharacter(manifest, character);
    const file = asset?.frames['south-east'] ?? Object.values(asset?.frames ?? {})[0];
    if (file) preview.src = assetUrl(file);
  }
}

void loadCharacterPreviews();

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
  const manifest = await manifestPromise;
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
  const mobileControls = document.getElementById('mobile-controls') as HTMLDivElement;
  const mobilePaint = document.getElementById('mobile-paint') as HTMLButtonElement;
  const mobileJump = document.getElementById('mobile-jump') as HTMLButtonElement;
  const mobileUlt = document.getElementById('mobile-ult') as HTMLButtonElement;
  const chatLog = document.getElementById('chat-log')!;
  const chatForm = document.getElementById('chat-form') as HTMLFormElement;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;

  const CHAT_MAX_LINES = 6;
  // Ephemeral: append one line and drop the oldest past the cap. textContent
  // (never innerHTML) keeps player-authored text inert against markup injection.
  function appendChatLine(who: string, text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const name = document.createElement('span');
    name.className = 'chat-name';
    name.textContent = who;
    const body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = text;
    line.append(name, body);
    chatLog.append(line);
    while (chatLog.children.length > CHAT_MAX_LINES) chatLog.firstElementChild!.remove();
  }

  let currentName = name;
  let currentCharacter = character;
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

  const me = { id: 0, x: 2048, y: 2048, alive: true };
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 8191, maxY: 8191 };
  const others = new Map<number, Token>();
  interface CritterView {
    token: Token;
    state: number;
    holderId: number;
  }
  const critters = new Map<number, CritterView>();
  const rosterPlayers = new Map<number, RosterPlayer>();
  let lastHeldPaintTile = '';
  let tapStart: { id: number; x: number; y: number } | null = null;

  const GRAB_HIT_RADIUS = 64; // world units around a critter that counts as a hit

  function critterIdAt(wx: number, wy: number): number {
    let best = 0;
    let bestD = GRAB_HIT_RADIUS * GRAB_HIT_RADIUS;
    for (const [id, v] of critters) {
      const dx = v.token.rx - wx;
      const dy = v.token.ry - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  // Hand: heldId is our *request*; confirmation arrives when the snapshot
  // shows holderId === me.id. Until then we don't predict.
  let heldId = 0;
  let handCursor = { x: 0, y: 0 };
  function handConfirmed(): boolean {
    const v = heldId ? critters.get(heldId) : undefined;
    return !!v && v.holderId === me.id;
  }

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
    const w = r.screenToWorld(e.clientX, e.clientY);
    if (heldId && me.alive) {
      // second tap = drop at the tapped ground position; NOT a move destination
      conn.sendDrop(Math.round(w.x), Math.round(w.y));
      heldId = 0;
      return;
    }
    const critter = critterIdAt(w.x, w.y);
    if (critter && me.alive) {
      conn.sendGrab(critter);
      heldId = critter; // server derives the carry position (above the player)
      return;
    }
    input.setMoveDestination(w, bounds, isTemplePosition);
  });
  r.app.canvas.addEventListener('pointercancel', (e) => {
    if (tapStart?.id === e.pointerId) tapStart = null;
  });

  r.app.canvas.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('mobile-controls-enabled')) return;
    if (!e.isPrimary || e.button !== 0 || !me.alive) return;
    const w = r.screenToWorld(e.clientX, e.clientY);
    const id = critterIdAt(w.x, w.y);
    if (id) {
      conn.sendGrab(id);
      heldId = id;
      handCursor = w;
    }
  });
  r.app.canvas.addEventListener('pointermove', (e) => {
    if (!heldId || document.body.classList.contains('mobile-controls-enabled')) return;
    handCursor = r.screenToWorld(e.clientX, e.clientY);
  });
  r.app.canvas.addEventListener('pointerup', (e) => {
    if (!heldId || document.body.classList.contains('mobile-controls-enabled')) return;
    const w = r.screenToWorld(e.clientX, e.clientY);
    conn.sendDrop(Math.round(w.x), Math.round(w.y));
    heldId = 0;
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
      kills: state.kills,
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

        const kills = document.createElement('span');
        kills.className = 'roster-kills';
        kills.textContent = `☠ ${p.kills}`;

        row.append(identity, roleLabel, ult, kills);
        return row;
      }),
    );
  }

  // E2E test hook (inert in prod). These objects are mutated in place by the
  // game loop, so exposing the references once is enough for a test to read
  // live state. Enabled by an init script that sets window.__E2E before load.
  if (window.__E2E) window.__game = { me, others, bounds, critters };
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
      fire(m) {
        r.fireTile(m.x, m.y);
      },
      bomb(m) {
        r.bombTile(m.x, m.y);
      },
      blast(m) {
        r.blast(m.x, m.y, m.arms);
      },
      ko(m) {
        if (m.victimId === me.id) {
          me.alive = false;
          r.setLocalGhost(true);
          return;
        }
        const o = others.get(m.victimId);
        if (o) r.setGhost(o, true);
      },
      respawn(m) {
        if (m.id === me.id) {
          me.x = m.x;
          me.y = m.y;
          me.alive = true;
          input.clearMoveDestination();
          lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
          r.setLocalGhost(false);
          return;
        }
        const o = others.get(m.id);
        if (o) {
          o.tx = m.x; o.ty = m.y; o.rx = m.x; o.ry = m.y;
          r.setGhost(o, false);
        }
      },
      jump(m) {
        if (m.id === me.id) {
          r.jumpLocal();
          return;
        }
        const o = others.get(m.id);
        if (o) r.jumpToken(o);
      },
      critters(m) {
        // our grab was denied or our critter was released elsewhere: un-stick the hand
        if (heldId) {
          const mine = m.ents.find((e) => e.id === heldId);
          if (!mine || (mine.holderId !== me.id && mine.holderId !== 0)) heldId = 0;
        }
        const seen = new Set<number>();
        for (const e of m.ents) {
          seen.add(e.id);
          let v = critters.get(e.id);
          if (!v) {
            v = { token: r.addCritter(e.id, e.x, e.y), state: e.state, holderId: e.holderId };
            critters.set(e.id, v);
            if (e.state === 3) r.setHeldLift(v.token, true);
          }
          v.token.tx = e.x;
          v.token.ty = e.y;
          const held = e.state === 3;
          if (held !== (v.state === 3)) r.setHeldLift(v.token, held);
          v.state = e.state;
          v.holderId = e.holderId;
        }
        for (const [id, v] of critters) {
          if (!seen.has(id)) {
            r.removeToken(v.token);
            critters.delete(id);
          }
        }
      },
      player(m) {
        upsertRosterPlayer(m);
      },
      chat(m) {
        appendChatLine(m.name, m.text);
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

  // Chat send: Enter submits (the server echoes it back, so no local echo here);
  // Esc returns focus to the game. The 200-char slice mirrors the server cap.
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim().slice(0, 200);
    if (!text) return;
    conn.sendChat(text);
    chatInput.value = '';
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') chatInput.blur();
    e.stopPropagation();
  });

  let last = performance.now();
  let acc = 0;
  const tick = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    const canAct = me.id !== 0 && me.alive; // dead players are frozen ghosts until respawn
    if (me.alive) input.step(me, MOVE_SPEED, dt, bounds, isTemplePosition);
    if (canAct && input.consumePaint()) {
      conn.sendInput(Math.round(me.x), Math.round(me.y));
      conn.sendPaint();
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (canAct && input.isPaintHeld()) {
      const currentTile = paintTileKey(me.x, me.y, bounds);
      if (currentTile !== lastHeldPaintTile) {
        lastHeldPaintTile = currentTile;
        conn.sendInput(Math.round(me.x), Math.round(me.y));
        conn.sendPaint();
      }
    } else {
      lastHeldPaintTile = paintTileKey(me.x, me.y, bounds);
    }
    if (canAct && input.consumeUlt()) {
      conn.sendUlt();
    }
    if (canAct && input.consumeJump()) {
      conn.sendJump();
    }
    if (canAct && input.consumeBomb()) {
      conn.sendBomb();
    }
    r.setLocal(me.x, me.y);

    for (const o of others.values()) {
      o.rx += (o.tx - o.rx) * 0.2; // smooth toward latest snapshot
      o.ry += (o.ty - o.ry) * 0.2;
      r.placeToken(o);
    }

    if (heldId && handConfirmed() && !document.body.classList.contains('mobile-controls-enabled')) {
      const v = critters.get(heldId)!;
      v.token.tx = handCursor.x;
      v.token.ty = handCursor.y;
    }

    for (const v of critters.values()) {
      v.token.rx += (v.token.tx - v.token.rx) * 0.2;
      v.token.ry += (v.token.ty - v.token.ry) * 0.2;
      r.placeToken(v.token);
    }

    r.centerCamera(me.x, me.y);

    acc += dt;
    if (acc >= 1 / INPUT_HZ) {
      acc = 0;
      // Don't stream input until Welcome has set our id + spawn position, or the
      // first frames would overwrite a returning player's restored position.
      if (me.id !== 0) conn.sendInput(Math.round(me.x), Math.round(me.y));
      if (heldId && handConfirmed() && !document.body.classList.contains('mobile-controls-enabled')) {
        conn.sendHold(Math.round(handCursor.x), Math.round(handCursor.y));
      }
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
