# Jump functionality

## Goal

Let players trigger a cosmetic jump with `Space` that is visible to nearby players without changing the existing paint mechanic or gameplay position.

## Context

The current client binds `Space` to shared paint behavior, including one-shot paint on press and hold-to-paint across newly entered tiles, while the server owns the shared multiplayer state that other players observe (`docs/project-map/client.md`, `docs/project-map/server.md`). The product vision allows additive shared-world interaction and presentation polish on top of the existing movement/presence engine (`docs/vision.md`, `docs/prd/mvp.md`). In issue #75, the author clarified two scope-shaping choices: the jump is cosmetic rather than gameplay-affecting, and it must be visible to other players while still using `Space` itself.

## Requirements

1. While connected in the world, pressing `Space` must trigger a jump presentation for the local player.
2. The jump must be cosmetic only: it must not change the player's authoritative world position, movement speed, collision/bounds behavior, paint target, role state, ult state, or any other gameplay rule.
3. The existing `Space` paint behavior must remain available on that same key; adding jump must not move paint to another key or remove hold-to-paint behavior.
4. A single `Space` press must be able to produce both outcomes in the same input flow: the current paint behavior and a jump presentation.
5. The jump presentation must be replicated so other connected players in view can see that player jump, not only the local player who pressed the key.
6. The jump must read as a short, one-shot action rather than a toggled persistent state.
7. Holding `Space` for existing paint behavior must not cause the player avatar to repeatedly re-trigger jump every frame; repeated jumps require distinct new `Space` presses.
8. Jump visibility must apply consistently to the local player and remote observers in the same running session, including players who are already connected when the jump happens.
9. The feature must not require a player to stop moving before jumping; if `Space` is pressed while movement input is active, movement continues under the existing movement rules and the jump remains cosmetic.
10. The change must not add vertical gameplay, platforming, gravity, fall damage, height-based occlusion, or any world-state effect beyond the temporary visible jump presentation.

## Out of scope

- Rebinding paint away from `Space` or adding a configurable keybinding system.
- Any jump that changes world coordinates, adds traversal advantages, or introduces platforms/elevation gameplay.
- Stamina, cooldowns, scoring, combat effects, or other new gameplay systems tied to jumping.
- Special-case jump interactions with painted tiles, ults, roster state, persistence, or join-time replay.

## Acceptance

1. With one player connected, pressing `Space` still performs the current paint behavior and also shows that player's avatar doing a short jump.
2. Holding `Space` continues the existing hold-to-paint behavior across newly entered tiles, but does not make the avatar continuously hop while the key remains held.
3. With two players connected and visible to each other, when player A presses `Space`, player B sees player A perform the same short jump.
4. During or after that jump, player A's actual world position and movement path remain governed by the existing movement system rather than being displaced by the jump.
5. A reviewer can verify that the shipped result adds a multiplayer-visible cosmetic jump on `Space` without removing or reassigning the existing `Space` paint mechanic.
