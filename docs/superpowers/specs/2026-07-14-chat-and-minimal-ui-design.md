# chat + minimal UI (thin-line / mono) — design

Status: approved (2026-07-14), pending implementation plan.

## motivation

opencraft is an experimental multiplayer isometric world where verbs (paint,
bomb, jump) arrive via GitHub issues. Today it "feels rough": the world reads as
empty and the verbs feel meaningless because other players don't feel like
*people* and the UI chrome (the flat "irregular house" style from issue #140)
doesn't match the AI-slop sprites.

We deliberately reject the tempting large fix (a reactive elemental-physics world
with tile animations) — that is depth, not a cure for "rough", and papering over
gameplay with animation is the wrong move. Instead, two small, focused changes:

1. **Chat** — the cheapest thing that turns silent pixels into people.
2. **Minimalist UI (thin-line / mono)** — chrome that gets out of the way of the
   sprites instead of competing with them.

Out of scope (separate future decisions): removing jump; persistent-mark
legibility; the elemental reaction system.

## 1. chat

Global, ephemeral live chat. Everyone sees everyone; nothing is persisted; a
joiner does not receive history. This is presence "right now", not a record.

### protocol

Two new wire frames (next free opcodes; strings are length-prefixed exactly like
the existing `character` field in `wire.ts`):

- `C_CHAT = 0x08` — client→server. Payload: `text` (UTF-8, length-prefixed).
- `S_CHAT = 0x8f` — server→all. Payload: `name` (length-prefixed) + `text`
  (length-prefixed).

Sending `name` inline (rather than a sender id the client resolves) keeps the
client dumb and robust against roster gaps; wire cost is trivial for chat.

Chat frames are NOT part of `S_SNAPSHOT`/`S_WELCOME` — ephemeral only.

### server (internal/world/sim.go + server)

On `C_CHAT` from a connected player:

1. Decode text; `trim`; reject empty after trim.
2. **Cap length** to 200 runes (truncate, don't drop).
3. **Rate-limit** per player: minimum interval between accepted messages
   (~500ms) using a per-player last-sent timestamp; silently drop messages that
   arrive too fast. (Trust-boundary validation — not simplified away.)
4. Broadcast `S_CHAT{name, text}` to every connected player (including sender,
   so the sender sees their own line echoed by the server — single source of
   truth, no optimistic local echo).

Chat never touches the `Store` (no persistence) and never enters the paint /
fire / bomb simulation.

### client — input (web/src/input.ts, main.ts)

- A chat text input in the DOM (see UI section), bottom-left.
- **Enter** sends (via `net`), clears the field, keeps focus for a quick reply.
- **Esc** blurs the field back to the game.
- **While the chat field is focused, game keys (WASD / Space / F / E / B) do not
  drive the game.** This is the one real integration point: input handling must
  check focus/target so typing "e" in chat never fires an ult. Implement by
  gating the keydown handler on `document.activeElement` being the game canvas /
  body, not the chat input.

### client — render (web/src/render.ts or DOM)

- A chat log, bottom-left, showing the last ~6 lines; older lines fade.
- Line format: `name  text`, monospace, in the new UI style.
- Rendered as DOM (not Pixi) alongside the rest of the HUD, so it inherits the
  minimalist CSS tokens.

## 2. minimalist UI (thin-line / mono)

Rewrite the UI chrome to a single coherent "editor-minimalist" system: monospace
type, 1px hairline borders, no fills, one accent color. Replace the issue-#140
"irregular house" decoration.

### CSS tokens (web/ui.css)

Define and use throughout:

- `--font-mono` — a mono stack.
- `--hairline` — 1px border color (low-contrast).
- `--accent` — the single accent color (selection, focus, active state).
- `--fg` / `--bg-scrim` — text color and a faint scrim behind floating text for
  readability over the world.

### surfaces restyled

All existing DOM UI, unified under the tokens above:

- entry overlay + character picker
- HUD: `name · ☠ kills · ⚡ ult/12` as thin text
- profile modal
- roster list
- controls-help panel
- mobile controls (touch buttons) — keep function, restyle to hairline/mono
- repo link
- **chat log + input** (new surface, born in this style)

### HUD healthbar

Drop the nano-banana `healthbar` HUD asset in favor of thin text (`⚡ 8/12`).
Less visual noise, closer to the mono style. (`resolveHud`/`hud-asset` wiring in
`main.ts` is removed or left inert.)

### index.html

- Add chat DOM (log container + input).
- Simplify wrapper markup that only existed to support the old decorative style.

## testing

- **Go:** encode/decode round-trip for `C_CHAT` / `S_CHAT`, added to the golden
  wire fixtures (`web/test/wire_fixtures.json`, regenerated via
  `go test ./internal/wire -update`). Server test: a `C_CHAT` broadcasts
  `S_CHAT` to all connections; over-length text is truncated; too-frequent
  messages are dropped by the rate limiter.
- **JS:** protocol-parity test for the new frames against the shared fixtures.
- **e2e (web/e2e):** a client sends a chat message and observes its own line in
  the log (extends the existing load→join→move smoke spec).
- **Manual/visual:** the minimalist UI renders coherently across all surfaces on
  desktop and mobile; chat field focus suppresses game input.

## increments (each independently shippable)

1. **UI system** — rewrite `ui.css` to thin-line/mono tokens, restyle every
   existing surface, tidy `index.html`, drop the healthbar asset. Establishes
   the design tokens.
2. **Chat** — `C_CHAT`/`S_CHAT` frames, server broadcast + validation +
   rate-limit, client input (with game-key suppression) and log render, tests.
   Slots into the UI tokens from increment 1.

Rationale for order: building chat after the UI system avoids styling the chat
surface twice.
