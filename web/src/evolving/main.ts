import { connect } from '../net.js';
import type { NetControl } from '../net.js';
import { createScene } from './scene.js';
import type { Avatar } from './scene.js';
import { movementInput } from './input.js';
import { previewRequest, savedConversation } from './conversation.js';
import type { Guest } from './conversation.js';

function element<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }
const canvas = element<HTMLCanvasElement>('scene');
const entry = element('entry');
const nameInput = element<HTMLInputElement>('name');
const joinButton = element<HTMLButtonElement>('join');
const reroll = element<HTMLButtonElement>('reroll');
const previousLook = element<HTMLButtonElement>('previous-look');
const expandChat = element<HTMLButtonElement>('expand-chat');
const controls = element('controls');
const conversation = element('conversation');
const openChat = element<HTMLButtonElement>('open-chat');
const closeChat = element<HTMLButtonElement>('close-chat');
const messageInput = element<HTMLInputElement>('message');
const sendButton = element<HTMLButtonElement>('send');
const delivery = element('delivery');
const retry = element<HTMLButtonElement>('retry');
const connection = element('connection');
const messages = element<HTMLOListElement>('messages');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const profileKey = 'opencraft.evolving-preview.profile';

let seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
let avatarVersion = 2;
const previousLooks: { seed: number; version: number }[] = [];
try {
  const saved = JSON.parse(localStorage.getItem(profileKey) || 'null');
  if (saved && typeof saved.name === 'string' && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xffffffff) {
    seed = saved.seed;
    nameInput.value = saved.name.slice(0, 24);
  }
} catch { /* Browser-local convenience only; not authentication or world storage. */ }

const scene = createScene(canvas, element('labels'));
const actors = new Map<number, Avatar>();
let me = scene.makeAvatar(seed, '');
let id = 0;
let online = false;
let starting = false;
let fatal = false;
let verified = false;
let persistent = false;
let guest: Guest | undefined;
let savedChat: ReturnType<typeof savedConversation> | undefined;
let network: NetControl | undefined;
let generation = 0;
let joinedName = '';
let bounds = { minX: 0, minY: 0, maxX: 8191, maxY: 8191 };
let pending = '';
let deliveryTimer = 0;
let expanded = false;
let chatScroll = { top: 0, bottom: true };
let chatAnchor: { line: Element; offset: number } | undefined;
const input = movementInput(element<HTMLButtonElement>('stick'), element('stick-knob'),
  () => online && !expanded && document.activeElement !== messageInput && document.activeElement !== messages && !document.hidden);

function status(text: string, canRetry = false) {
  connection.hidden = !text;
  element('connection-text').textContent = text;
  retry.hidden = !canRetry;
}
function updatePresence() {
  element('presence').textContent = online ? `In the world: ${actors.size + 1}` : 'Disconnected';
}
function stopMoving() {
  input.clear();
  me.tx = me.x; me.ty = me.y;
}
function rememberScroll() {
  if (!conversation.hidden && expanded) {
    chatScroll = { top: messages.scrollTop, bottom: messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40 };
    const top = messages.getBoundingClientRect().top;
    const line = [...messages.children].find(line => line.getBoundingClientRect().bottom > top);
    chatAnchor = line ? { line, offset: line.getBoundingClientRect().top - top } : undefined;
  }
  conversation.dataset.reading = String(!chatScroll.bottom);
}
function restoreScroll() {
  messages.scrollTop = chatScroll.bottom ? messages.scrollHeight : chatScroll.top;
  // The same message stays in view when widths or timestamp visibility change.
  if (!chatScroll.bottom && chatAnchor?.line.isConnected) {
    const line = chatAnchor.line.getBoundingClientRect();
    const offset = Math.max(chatAnchor.offset, 1 - line.height);
    messages.scrollTop += line.top - messages.getBoundingClientRect().top - offset;
  }
}
function unread(value: boolean) {
  element('unread-dot').hidden = !value;
  openChat.setAttribute('aria-label', value ? 'Chat: new messages' : 'Open chat');
}
function setChat(open: boolean) {
  rememberScroll();
  conversation.hidden = !open;
  if (!open) expanded = false;
  conversation.classList.toggle('expanded', expanded);
  expandChat.textContent = expanded ? '−' : '≡';
  expandChat.title = expanded ? 'Collapse history' : 'Open history';
  expandChat.setAttribute('aria-label', expandChat.title);
  expandChat.setAttribute('aria-expanded', String(expanded));
  openChat.hidden = open;
  openChat.setAttribute('aria-expanded', String(open));
  if (!open) messageInput.blur();
  viewport();
  if (open) {
    unread(false);
    closeChat.focus({ preventScroll: true });
  } else {
    openChat.focus({ preventScroll: true });
  }
  if (open && expanded) restoreScroll();
}
openChat.addEventListener('click', () => setChat(true));
closeChat.addEventListener('click', () => setChat(false));
expandChat.addEventListener('click', () => {
  rememberScroll();
  expanded = !expanded;
  if (expanded) { stopMoving(); unread(false); }
  conversation.classList.toggle('expanded', expanded);
  expandChat.textContent = expanded ? '−' : '≡';
  expandChat.title = expanded ? 'Collapse history' : 'Open history';
  expandChat.setAttribute('aria-label', expandChat.title);
  expandChat.setAttribute('aria-expanded', String(expanded));
  viewport();
  if (expanded) restoreScroll();
});
messageInput.addEventListener('focus', () => { stopMoving(); viewport(); });
messageInput.addEventListener('blur', () => requestAnimationFrame(viewport));
messages.addEventListener('focus', stopMoving);
// A send tap keeps the input/keyboard focused, including while the write is pending.
sendButton.addEventListener('pointerdown', event => { if (document.activeElement === messageInput) event.preventDefault(); });
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || conversation.hidden) return;
  if (document.activeElement === messageInput) { messageInput.blur(); closeChat.focus(); }
  else setChat(false);
});

function viewport() {
  const view = window.visualViewport;
  const inset = view ? Math.max(0, innerHeight - view.height - view.offsetTop) : 0;
  const typing = document.activeElement === messageInput;
  document.body.classList.toggle('typing', typing);
  controls.hidden = !entry.hidden || typing || expanded;
  document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
  conversation.style.maxHeight = `${(view?.height ?? innerHeight) * .78}px`;
  entry.style.bottom = `${inset}px`;
  const top = entry.hidden ? 0 : entry.querySelector('.entry-copy')!.getBoundingClientRect().bottom + 8;
  const available = entry.hidden ? innerHeight : element('entry-form').getBoundingClientRect().top;
  element('world').style.top = `${top}px`;
  element('world').style.height = `${Math.max(1, available - top)}px`;
}
element('entry-info').addEventListener('toggle', viewport);
window.addEventListener('resize', viewport);
window.visualViewport?.addEventListener('resize', viewport);
window.visualViewport?.addEventListener('scroll', viewport);
viewport();

function showLook() {
  scene.remove(me);
  me = scene.makeAvatar(seed, '', avatarVersion);
}
function choiceControls() {
  const canChoose = !guest || guest.appearanceChoicePending;
  reroll.hidden = !canChoose;
  reroll.disabled = starting || !verified;
  previousLook.hidden = !canChoose || !previousLooks.length;
  previousLook.disabled = starting;
  joinButton.textContent = guest && !guest.appearanceChoicePending ? 'Return' : 'Enter';
  viewport();
}
reroll.addEventListener('click', () => {
  if (starting || !verified || (guest && !guest.appearanceChoicePending)) return;
  previousLooks.push({ seed, version: avatarVersion });
  // Keep the immediately previous choices, not an unbounded character catalogue.
  if (previousLooks.length > 20) previousLooks.splice(1, 1); // Retain the original body too.
  const previousKind = avatarVersion === 2 ? seed % 5 : -1;
  do { seed = crypto.getRandomValues(new Uint32Array(1))[0]!; } while (seed % 5 === previousKind);
  avatarVersion = 2;
  showLook(); choiceControls();
});
previousLook.addEventListener('click', () => {
  if (starting) return;
  const look = previousLooks.pop();
  if (look) { seed = look.seed; avatarVersion = look.version; showLook(); choiceControls(); }
});

function loseConnection() {
  savedChat?.stop();
  online = false;
  starting = false;
  input.clear();
  me.tx = me.x; me.ty = me.y;
  for (const actor of actors.values()) scene.remove(actor);
  actors.clear();
  messageInput.disabled = true;
  sendButton.disabled = true;
  joinButton.disabled = false;
  choiceControls();
  if (pending) delivery.textContent = 'Delivery unconfirmed. Your draft is still in the field; retrying may create a duplicate.';
  pending = '';
  clearTimeout(deliveryTimer);
  updatePresence();
  status(persistent ? 'Disconnected from the world. If this guest is open in another tab, close it and reconnect.' : 'Connection lost. The world is unavailable; your text is still here.', true);
}

function appendMessage(name: string, text: string, record?: { id: string; createdAt: string }) {
  element('empty-chat')?.remove();
  const atEnd = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
  const li = document.createElement('li');
  const author = document.createElement('span');
  author.className = 'author';
  author.textContent = name;
  if (record) {
    li.dataset.messageId = record.id;
    const time = document.createElement('time');
    time.dateTime = record.createdAt;
    time.textContent = ` · ${new Date(record.createdAt).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    author.append(time);
  }
  li.append(author, document.createTextNode(text));
  messages.append(li);
  // ponytail: render at most 200 lines; older durable messages are read by cursor.
  if (messages.children.length > 200) messages.firstElementChild?.remove();
  if (atEnd) messages.scrollTop = messages.scrollHeight;
  if (!record && conversation.hidden) unread(true);
  if (pending && name === joinedName && text === pending) {
    // The legacy chat frame has no sender ID or message ID. With duplicate
    // display names, never discard a draft based on another person's echo.
    if ([...actors.values()].some(actor => actor.label.textContent === joinedName)) return;
    clearTimeout(deliveryTimer);
    if (messageInput.value.trim() === pending) messageInput.value = '';
    pending = '';
    delivery.textContent = 'Received by the server. Chat history is not saved yet.';
    // Match the existing server's chat throttle without pretending rejected sends succeeded.
    sendButton.disabled = true;
    deliveryTimer = window.setTimeout(() => { sendButton.disabled = !online; }, 650);
  }
}

async function join() {
  let name = nameInput.value.trim();
  if (!name || starting || fatal || !verified) return;
  generation++;
  const attempt = generation;
  network?.close();
  starting = true;
  joinButton.disabled = true;
  reroll.disabled = true;
  previousLook.disabled = true;
  joinedName = name;
  status('Connecting to the shared world…');
  input.clear();
  for (const actor of actors.values()) scene.remove(actor);
  actors.clear();
  try { localStorage.setItem(profileKey, JSON.stringify({ name, seed })); } catch { /* Optional local profile. */ }
  const timeout = window.setTimeout(() => {
    if (attempt === generation && starting) { network?.close(); loseConnection(); }
  }, 10000);
  if (persistent) {
    try {
      if (guest?.appearanceChoicePending) {
        try {
          guest = await previewRequest('appearance', avatarVersion === guest.avatarVersion && seed === guest.seed ? { keep: true } : { seed });
        } catch {
          // A response may be lost after commit. Read before offering another choice.
          guest = await previewRequest('session');
          if (guest?.appearanceChoicePending) throw new Error('choice not saved');
        }
      }
      guest = await previewRequest('session', { name, seed, avatarVersion: 2 });
      if (attempt !== generation || !starting || fatal) return;
      name = guest!.name; seed = guest!.seed; avatarVersion = guest!.avatarVersion;
      nameInput.value = name; nameInput.readOnly = true;
      previousLooks.length = 0;
      showLook();
    } catch {
      clearTimeout(timeout); loseConnection();
      status('Could not restore your guest. Check your connection and try entering again.', true);
      return;
    }
  }
  network = connect(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?recipes=2`, name, 1, `${avatarVersion === 1 ? 'shape' : 'shape2'}-${seed.toString(16)}`, {
    welcome: message => {
      if (attempt !== generation) return;
      clearTimeout(timeout);
      starting = false; online = true; id = message.id; bounds = message;
      me.x = me.tx = message.x; me.y = me.ty = message.y;
      me.label.textContent = name;
      entry.hidden = true;
      element('hud').hidden = false;
      element('your-name').textContent = name;
      choiceControls(); viewport();
      nameInput.blur();
      messageInput.disabled = false; sendButton.disabled = false;
      updatePresence(); status('');
      if (guest) savedChat?.start(guest);
    },
    enter: message => {
      if (attempt !== generation || message.id === id) return;
      const previous = actors.get(message.id);
      if (previous) scene.remove(previous);
      const recipe = /^(shape|shape2)-([a-f0-9]{1,8})$/.exec(message.character);
      if (!recipe) { fatal = true; network?.close(); stopMoving(); status('Reload the page: new character forms are available.', true); retry.textContent = 'Reload'; return; }
      const actorSeed = Number.parseInt(recipe[2]!, 16) >>> 0;
      const actor = scene.makeAvatar(actorSeed, message.name, recipe[1] === 'shape' ? 1 : 2);
      actor.x = actor.tx = message.x; actor.y = actor.ty = message.y;
      actors.set(message.id, actor); updatePresence();
    },
    snapshot: message => {
      if (attempt !== generation) return;
      for (const entity of message.ents) {
        const actor = actors.get(entity.id);
        if (actor) { actor.tx = entity.x; actor.ty = entity.y; }
      }
    },
    leave: message => {
      if (attempt !== generation) return;
      const actor = actors.get(message.id);
      if (actor) scene.remove(actor);
      actors.delete(message.id); updatePresence();
    },
    chat: message => {
      if (persistent || attempt !== generation) return;
      appendMessage(message.name, message.text);
      const speakers = [me, ...actors.values()].filter(actor => actor.label.textContent === message.name);
      // The legacy frame has only a name. Never attach speech to a guessed author.
      if (speakers.length === 1) scene.say(speakers[0]!, message.text);
    },
    close: () => { clearTimeout(timeout); if (attempt === generation && !fatal) loseConnection(); },
  });
}

element<HTMLFormElement>('entry-form').addEventListener('submit', event => { event.preventDefault(); join(); });
retry.addEventListener('click', () => { if (fatal) location.reload(); else join(); });
element<HTMLFormElement>('message-form').addEventListener('submit', event => {
  event.preventDefault();
  if (persistent) return;
  const text = messageInput.value.trim();
  if (!text || !online || sendButton.disabled || pending) return;
  pending = text;
  sendButton.disabled = true;
  delivery.textContent = 'Sending…';
  scene.say(me, text, 'pending');
  network?.sendChat(text);
  deliveryTimer = window.setTimeout(() => {
    pending = '';
    sendButton.disabled = !online;
    delivery.textContent = 'Delivery unconfirmed. Sending again may create a duplicate.';
    scene.say(me, text, 'error');
  }, 5000);
});

canvas.addEventListener('webglcontextlost', event => {
  savedChat?.stop();
  event.preventDefault(); fatal = true; online = false; input.clear(); network?.close();
  messageInput.disabled = true; sendButton.disabled = true;
  status('The 3D scene stopped. Reload the page to recover.', true);
  retry.textContent = 'Reload';
});

let lastTime = performance.now();
let lastSend = 0;
function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .05);
  lastTime = now;
  const direction = input.direction();
  const movement = scene.movement(direction.x, direction.y);
  me.tx = Math.min(bounds.maxX, Math.max(bounds.minX, me.tx + movement.x * 180 * dt));
  me.ty = Math.min(bounds.maxY, Math.max(bounds.minY, me.ty + movement.y * 180 * dt));
  if (online && now - lastSend >= 1000 / 15) {
    network?.sendInput(Math.round(me.tx), Math.round(me.ty)); lastSend = now;
  }
  if (!fatal && !document.hidden) scene.render([me, ...actors.values()], me, dt, reducedMotion.matches, !entry.hidden);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Never connect this page to the legacy production world, even if served there.
try {
  const response = await fetch('/preview-info', { signal: AbortSignal.timeout(5000) });
  const info = await response.json();
  if (!response.ok || info.mode !== 'evolving-preview') throw new Error('wrong server');
  persistent = info.persistent === true;
  if (persistent) {
    if (info.apiVersion !== 2) throw new Error('incompatible preview');
    savedChat = savedConversation(appendMessage, () => { if (conversation.hidden || !expanded) unread(true); }, record => {
      const actor = actors.get(record.actorId ?? 0);
      // Backlog after a network gap belongs in history, not above today's head.
      if (actor && Date.now() - Date.parse(record.createdAt) < 15000) scene.say(actor, record.text);
    }, (text, state) => scene.say(me, text, state));
    element('entry-note').textContent = 'Your guest belongs to this browser for 30 days. Chat is saved and visible to all participants and the test operator; messages are not automatically deleted. World evolution is not connected.';
    element('history-status').textContent = 'Saved chat will load after you enter.';
    try {
      guest = await previewRequest('session');
      nameInput.value = guest!.name; nameInput.readOnly = true;
      seed = guest!.seed; avatarVersion = guest!.avatarVersion; showLook();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== '401') throw error;
    }
  }
  verified = true;
  joinButton.disabled = false;
  choiceControls(); viewport();
} catch {
  fatal = true;
  status(persistent ? 'Could not load your guest. Check your connection and reload.' : 'This scene needs its own test server. The regular game server is not connected.', persistent);
  if (persistent) retry.textContent = 'Reload';
}

window.addEventListener('pagehide', () => { generation++; savedChat?.stop(); network?.close(); scene.dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
