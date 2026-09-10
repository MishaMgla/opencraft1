import { worldRequest } from './transport.js';

export interface Guest { id: string; name: string; seed: number; avatarVersion: number; appearanceChoicePending: boolean }
interface SavedMessage { id: string; playerId: string; actorId?: number; requestId: string; name: string; text: string; createdAt: string }

export async function previewRequest(path: string, body?: unknown) {
  return worldRequest(`/evolving-api/${path}`, body);
}

// HTTP history is independent of the lossy movement socket. No second live
// transport: bounded polling catches up by committed ID, including after gaps.
export function savedConversation(append: (name: string, text: string, record: SavedMessage) => void, onNew: () => void,
  speak: (record: SavedMessage) => void, ownSpeech: (text: string, state: string) => void) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const list = get<HTMLOListElement>('messages');
  const input = get<HTMLInputElement>('message');
  const send = get<HTMLButtonElement>('send');
  const delivery = get('delivery');
  const historyStatus = get('history-status');
  const earlier = get<HTMLButtonElement>('earlier');
  const latest = get<HTMLButtonElement>('latest');
  let guest: Guest | undefined;
  let connected = false;
  let sending = false;
  let reading = false;
  let live = true;
  let cursor = '';
  let needsReset = true;
  let epoch = 0;
  let timer = 0;
  let pending: { requestId: string; text: string } | undefined;
  let storageOK = true;
  const key = () => `opencraft.preview.draft.${guest?.id}`;

  function remember() {
    try { localStorage.setItem(key(), JSON.stringify({ text: input.value, pending })); }
    catch { storageOK = false; }
  }
  input.addEventListener('input', () => { if (guest) remember(); });

  async function read(before = '', reset = false) {
    if (!connected || reading) return;
    reset ||= needsReset;
    clearTimeout(timer);
    const attempt = epoch;
    reading = true;
    earlier.disabled = latest.disabled = true;
    try {
      const query = before ? `?before=${before}` : !reset && cursor ? `?after=${cursor}` : '';
      const records: SavedMessage[] = await previewRequest(`messages${query}`);
      if (attempt !== epoch) return;
      historyStatus.classList.remove('error');
      if (!reset && !before && records.length) {
        onNew();
        cursor = records[records.length - 1]!.id;
        for (const record of records) {
          if (record.playerId !== guest?.id) speak(record);
        }
        // Freeze the displayed page when reading above its end. No eviction of
        // the line being read; the existing cursor API reloads on "Latest".
        if (!live || ((!get('conversation').classList.contains('expanded') || get('conversation').hidden) && get('conversation').dataset.reading === 'true') ||
          (!get('conversation').hidden && get('conversation').classList.contains('expanded') && list.scrollHeight - list.scrollTop - list.clientHeight >= 40)) {
          live = false;
          historyStatus.textContent = 'New messages — select Latest.';
          return;
        }
      }
      if (before && !records.length) {
        historyStatus.textContent = 'This is the start of the conversation.';
      } else {
        if (reset || before) list.replaceChildren();
        if (reset) cursor = records[records.length - 1]?.id || '';
        needsReset = false;
        if (before) live = false;
        for (const record of records) {
          append(record.name, record.text, record);
        }
        if (!list.children.length) {
          const empty = document.createElement('li');
          empty.id = 'empty-chat'; empty.className = 'note';
          empty.textContent = 'No messages yet.'; list.append(empty);
        }
        historyStatus.textContent = live ? 'Saved chat. Visible to everyone in this world.' : 'Older messages. Select Latest for new ones.';
        if (reset || before) list.scrollTop = before ? 0 : list.scrollHeight;
      }
    } catch {
      if (attempt === epoch) { historyStatus.textContent = 'Could not refresh history. The messages already shown are still here.'; historyStatus.classList.add('error'); }
    } finally {
      reading = false;
      earlier.disabled = !connected || !list.firstElementChild?.getAttribute('data-message-id');
      latest.disabled = !connected;
      latest.hidden = live;
      // Keep live speech flowing even while the visible history page is frozen.
      if (connected) timer = window.setTimeout(() => void read(), 1000);
    }
  }
  earlier.addEventListener('click', () => void read(list.firstElementChild?.getAttribute('data-message-id') || ''));
  latest.addEventListener('click', () => { live = true; void read('', true); });

  get<HTMLFormElement>('message-form').addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !connected || sending || !guest) return;
    if (!pending || pending.text !== text) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      pending = { requestId: [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''), text };
    }
    remember(); // Keep the same request ID even across reload after a lost acknowledgement.
    const request = pending;
    sending = true; send.disabled = true;
    ownSpeech(text, 'pending');
    delivery.dataset.state = 'pending';
    delivery.textContent = storageOK ? 'Sending…' : 'Sending… Keep this page open: your draft cannot be saved.';
    try {
      const saved: SavedMessage = await previewRequest('messages', request);
      if (saved.playerId !== guest.id || saved.requestId !== request.requestId || saved.text !== request.text) throw new Error('invalid acknowledgement');
      if (input.value.trim() === text) input.value = '';
      pending = undefined; remember();
      ownSpeech(text, 'saved');
      delivery.dataset.state = 'saved';
      delivery.textContent = 'Saved to chat.';
    } catch (error) {
      ownSpeech(text, 'error');
      delivery.dataset.state = 'error';
      delivery.textContent = error instanceof Error && error.message === '429'
        ? 'Wait a moment and try again. Your text is still in the field.'
        : 'Not confirmed. You can retry: the same message will not be saved twice.';
      if (!storageOK) delivery.textContent += ' Do not reload: this browser cannot save your draft.';
    } finally { sending = false; send.disabled = !connected; }
  });

  return {
    start(profile: Guest) {
      if (guest?.id !== profile.id) {
        guest = profile;
        try {
          const draft = JSON.parse(localStorage.getItem(key()) || 'null');
          if (draft && typeof draft.text === 'string') input.value = draft.text.slice(0, 200);
          if (draft?.pending && /^[a-f0-9]{32}$/.test(draft.pending.requestId) && typeof draft.pending.text === 'string') {
            pending = draft.pending;
            delivery.textContent = 'An earlier send is unconfirmed. Retrying will not create a duplicate.';
          }
        } catch { /* Optional local draft; ownership is in the HttpOnly cookie. */ }
      }
      connected = true; live = true; needsReset = true;
      input.disabled = false; send.disabled = sending;
      get('history-controls').hidden = false;
      void read('', true);
    },
    stop() {
      connected = false; epoch++; clearTimeout(timer);
      input.disabled = send.disabled = earlier.disabled = latest.disabled = true;
    },
  };
}
