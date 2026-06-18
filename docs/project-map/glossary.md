# glossary

short definitions of project-specific terms, product names, and acronyms that show up in code, docs, and conversations. when you see one of these in a file or a user message, this is what it means.

terms are grouped: **product / domain** first, then **technical**, then **external services**. within each group, alphabetical.

---

## product / domain

- **opencraft1** — a multiplayer, browser-native shared 2D world rendered isometrically with symbolic graphics. MVP proves a scalable real-time movement engine; the world's purpose (build/craft/social/survival) is deliberately undecided. see [`../vision.md`](../vision.md).
- **world** — the single shared coordinate space all players inhabit. flat `(wx, wy)` world units server-side; projected to isometric only at render time.
- **presence** — the MVP capability: join, move, and see other players move in real time. no chat, no persistence, no world interaction.
- **token** — a player's symbolic on-screen representation: a colored shape + name label + shadow.

## technical

- **AoI (area of interest)** — the subset of the world a given client receives updates about: its spatial-grid cell plus the 8 neighbors. the mechanism that bounds per-client cost independent of total population.
- **interest management** — server-side filtering so each client gets only its AoI, not the whole world. lives in the spatial grid.
- **tick** — one step of the server's fixed-rate (15 Hz) simulation loop; the unit of snapshot cadence.
- **snapshot** — the per-tick binary message listing the entities in a client's AoI.
- **authoritative-relay** — the MVP movement model: clients compute their own position; the server validates bounds and relays to interested peers. distinct from server-authoritative simulation (a later hardening layer).
- **quantization** — encoding positions as int16 (fixed scale) instead of float32 to shrink the wire protocol.

## external services & models

_empty — add third-party services, providers, and model names once integrations exist._

---

## not in this glossary

if you encounter a term that should be here, add it. keep entries short (1-3 sentences) and link to the canonical doc/file where the full definition lives. when something changes, update the entry rather than letting it rot.
