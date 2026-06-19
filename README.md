```
┌────────────────────────────────────────────┐
│                                            │
│   o p e n c r a f t 1                      │
│   a world built out of issues              │
│                                            │
└────────────────────────────────────────────┘
```

a multiplayer browser world. half game, half open experiment in letting strangers and AI agents build the thing together.

→ **play:** [opencraft1.com](https://opencraft1.com) — pick a name, you're in the world. no install.
→ **build:** [open an issue](https://github.com/MishaMgla/opencraft1/issues/new) — no fork, no setup. just an idea.

## what it is

a shared, isometric 2D world that a crowd of people inhabit at the same time. minimal and symbolic to look at — diamond tiles, little player tokens — with a serious real-time engine humming underneath.

and nobody hand-builds the features. **you ask. agents do.**

## the deal

you don't send code. you send an _idea_, and a couple of AI agents argue it into existence:

> **you** — players should be able to wave at each other
>
> **pm agent** — on it. one question first: wave at everyone, or just folks nearby?
>
> **you** — nearby
>
> **dev agent** — done. PR #42, gates green, merged. it's live. go wave at someone.

under the hood that's a pipeline you can watch happen in public:

```
  your idea ─▶ [ pm agent ] ─▶ spec ─▶ [ dev agent ] ─▶ PR ─▶ ✓ green ─▶ live
                   │                        │
               asks you               runs the gates
```

1. you open an issue          → plain language. *"add weather."*
2. an agent drafts the spec    → you nod, or you argue. it listens.
3. an agent writes the code    → tests must pass. no exceptions.
4. it merges itself and ships  → your issue closes. your idea's in the world.

you steer the whole way by **commenting** — on the issue or its PR. answer questions, ask for changes, or just say `/approved`. *(want to think out loud without summoning an agent? start a PR comment with `//`.)*

no fork. no "good first issue" gatekeeping. just an issue and a little patience.

## under the hood

- **the engine** — Go. a single-process, fixed-tick simulation server with spatial interest management: every client only ever sees its own neighborhood, so one world can hold a crowd that keeps growing. talks a compact binary protocol over websockets, because bytes are the bill.
- **the client** — a vanilla browser app with **zero runtime dependencies**. [pixijs](https://pixijs.com) (webgl/webgpu) draws the world; plain DOM draws the HUD.
- **the agents** — Codex-based PM + Dev agents living in GitHub Actions. the full machinery → [`docs/project-map/agents.md`](docs/project-map/agents.md).

the bet: **build the scalable real-time engine first, decide what the world is _for_ second.** purpose — build, craft, survive, socialize — gets layered on later. a lot of it from your issues.

## dig deeper

| you want | read |
|---|---|
| the why / north star | [`docs/vision.md`](docs/vision.md) |
| how the agents actually work | [`docs/project-map/agents.md`](docs/project-map/agents.md) |
| the repo navigation hub | [`docs/project-map/README.md`](docs/project-map/README.md) |
| rules + commands for building here | [`AGENT_RULES.md`](AGENT_RULES.md) |
