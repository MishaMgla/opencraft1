# opencraft1

a multiplayer browser world, built by whoever shows up — by asking.

→ **play:** [opencraft1.com](https://opencraft1.com) — pick a name, you're in the world. no install.

## what it is

two things at once:

- **a game.** a shared, isometric 2D world that many people inhabit at the same time. minimal and symbolic to look at, a serious real-time engine underneath. open a url and you're moving around the same territory as everyone else, seeing each other in real time.
- **an experiment in crowd-coding.** the game is built by AI agents, from issues people file. you describe what the world should do; agents spec it, write it, test it, and ship it. no fork, no setup — just an issue.

## crowd-coding: how to take part

want a feature, a fix, or just have an idea? **open an issue.** that's the whole entry fee.

1. **open an issue** — plain language is fine. *"players should be able to wave at each other."*
2. **a PM agent replies** — it asks a clarifying question, or drafts a spec for what you described.
3. **once the spec is settled**, a Dev agent writes the code, runs the test gates, and opens a pull request.
4. **green tests → it auto-merges and ships.** your issue closes itself; the change goes live in the world.

you steer the whole way by **commenting** on the issue or its PR — answer the agent's questions, ask for changes, or say `/approved`. (want to talk without nudging an agent? start a PR comment with `//`.)

→ [**open an issue**](https://github.com/MishaMgla/opencraft1/issues/new)

## under the hood

- **the engine:** Go — a single-process, fixed-tick simulation server with spatial interest management (each client only ever sees its neighborhood, so one world can hold a growing crowd), speaking a compact binary protocol over websockets.
- **the client:** a vanilla browser app — [pixijs](https://pixijs.com) (webgl/webgpu) isometric renderer + DOM HUD, **zero runtime dependencies**. symbolic graphics: diamond tiles and simple player tokens.
- **the agents:** Codex-based PM + Dev agents running in GitHub Actions. how the pipeline works → [`docs/project-map/agents.md`](docs/project-map/agents.md).

the bet: **build the scalable real-time engine first, decide what the world is _for_ second.** purpose — build, craft, survive, socialize — gets layered on later, much of it from your issues.

## dig deeper

| you want | read |
|---|---|
| the product vision / north star | [`docs/vision.md`](docs/vision.md) |
| how the agent pipeline works | [`docs/project-map/agents.md`](docs/project-map/agents.md) |
| the repo navigation hub | [`docs/project-map/README.md`](docs/project-map/README.md) |
| rules + commands for working here | [`AGENT_RULES.md`](AGENT_RULES.md) |
