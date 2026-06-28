# Space key

## Goal

Split jump and paint onto different keys, and add an in-game help control that explains the current bindings.

## Context

The current web client input surface already mixes movement, cosmetic jump, shared paint, role perks, and lightweight HUD chrome inside the browser game shell (`docs/project-map/client.md`). Recent work established `Space` as the jump trigger and also added player-facing control/mechanic hints in HUD and entry surfaces (`docs/specs/2026-06-23-issue-75-jump-functionality.md`, `docs/specs/2026-06-22-issue-62-issue-59-retro-and-explanation.md`). In issue #101, the author asked to stop overloading `Space` for both jump and cell-color change, keep the existing `E` perk, and expose the controls through a HUD help affordance. The follow-up clarifications fix the intended layout to `Space` = jump, `F` = paint/change cell color, `E` = perk, and specify a small `?` help button rather than always-visible help text.

## Requirements

1. During gameplay, `Space` must be reserved for jump only; pressing `Space` must no longer trigger paint or change the current cell color.
2. During gameplay, paint/change-cell-color must move to `F`.
3. The current `E` perk control must remain on `E`; this issue does not rebind or redesign perk activation.
4. Moving paint from `Space` to `F` must preserve the current paint behavior otherwise: the same targeting rules, shared-world effect, and any existing hold-to-paint behavior must continue to work, only on `F` instead of `Space`.
5. The gameplay HUD must include a visible `?` help control while the player is in the world.
6. Activating that `?` control must open a tooltip, popover, or small help panel that lists the live control bindings for at least these actions: `Space` = jump, `F` = paint/change cell color, `E` = perk.
7. The help UI must be part of the existing in-game HUD layer, not the join overlay and not a separate full-screen tutorial flow.
8. The help copy and the canonical project documentation for client controls must be updated together so they describe the same shipped bindings and do not drift from the actual mechanics.
9. This change must not add a configurable keybinding system, change movement keys, alter jump/paint/perk mechanics beyond the specified rebinding, or introduce new gameplay actions.

## Out of scope

- Custom key remapping or a general settings menu for controls.
- Changing what jump, paint, or perk do mechanically beyond splitting jump and paint onto different keys.
- Replacing the existing join overlay with a controls tutorial or adding a multi-step onboarding flow.
- Adding new actions, new perk types, or new HUD systems unrelated to the controls help affordance.

## Acceptance

1. With one player connected, pressing `Space` causes jump behavior only and does not paint or recolor a tile.
2. With one player connected, pressing `F` performs the same paint/change-cell-color action the game previously exposed on `Space`.
3. If the current build supports hold-to-paint across newly entered tiles, that behavior still works on `F` and no longer works on `Space`.
4. Pressing `E` still activates the existing perk behavior exactly as before.
5. During gameplay, the HUD shows a `?` help control; activating it reveals help text that includes `Space` jump, `F` paint/change cell color, and `E` perk.
6. A reviewer comparing the shipped HUD help text with the updated canonical client-control docs can confirm they describe the same bindings and match the implemented game controls.
