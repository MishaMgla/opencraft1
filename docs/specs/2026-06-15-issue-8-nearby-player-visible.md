# Nearby player visible

> **Status:** implemented — historical record of work already merged to `main`. Kept for design rationale; **not** active instructions.

## Goal

Make every connected player visible to every other connected player anywhere within the current map bounds.

## Context

The MVP presence loop is built around seeing other players move in a shared isometric world, while the current server area-of-interest sends only a player's grid cell plus neighboring cells (`docs/project-map/server.md`, `docs/prd/mvp.md`). The client already renders whatever remote players the server includes in snapshots and removes players when the server emits leave events (`docs/project-map/client.md`).

## Requirements

1. For the current fixed 4096 x 4096 world, the server must include all connected players in each client's visibility set, regardless of grid cell distance.
2. A player must remain visible to another player while both are connected and both positions are within the current world bounds.
3. A player must disappear from another player's client only when the disappearing player disconnects or otherwise leaves the world session.
4. The implementation must keep the existing binary wire message shapes compatible with the current client and tests.
5. The implementation must not change player movement speed, spawn behavior, world bounds, tile rendering, camera behavior, or deployment configuration.

## Out of scope

- Increasing or redesigning the map size.
- Adding zoom controls, minimaps, name search, chat, parties, or friend lists.
- Replacing grid interest management with a new spatial data structure for future larger maps.
- Changing the wire protocol format or adding new client-visible message types.

## Acceptance

1. With two browser clients connected near opposite edges or corners of the current map, each client can see the other player's token and name.
2. Moving either player anywhere inside the current map does not cause the other player to disappear.
3. Closing one client removes that player from the remaining client's view.
4. Existing Go, web unit, and browser smoke checks still pass without wire-format fixture changes.
