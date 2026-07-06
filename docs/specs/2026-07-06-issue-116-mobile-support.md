# Mobile support

## Goal

Make the browser game usable on mobile touch devices with a tap-first control scheme, while leaving the desktop experience intact.

## Context

The product vision explicitly centers a browser-native shared world with additive improvements layered onto the existing client and engine rather than a separate native app (`docs/vision.md`). The current web client is keyboard-first: movement comes from `WASD`/arrow keys and in-world actions come from `F`, `Space`, and `E`, with orchestration and HUD surfaces documented in the client map (`docs/project-map/client.md`). Issue #116 asks for mobile support, and the follow-up clarification selected a tap-first primary movement model: tapping a destination tile should move the player there automatically.

## Requirements

1. On touch-capable mobile-sized browsers, the in-game control model must switch from keyboard-first to a touch-first mobile UI rather than assuming physical keys are available.
2. In that mobile UI, a single tap on the world must set a movement destination, and the local player must automatically move toward that destination without requiring repeated taps while the route remains valid.
3. The tap destination must be derived from the rendered world position the player touched, not from a fixed directional pad or joystick.
4. While auto-move is in progress, a new world tap must retarget movement to the newly tapped destination.
5. Auto-move must stop when the player reaches the destination, when the destination would leave world bounds, or when a newer movement command replaces it.
6. The mobile touch UI must preserve access to the current in-world actions that desktop players can trigger with `F`, `Space`, and `E` by exposing touchable controls for paint, jump, and ult activation during gameplay.
7. Those mobile action controls must trigger the same gameplay behaviors and server messages as the existing desktop controls; this spec does not create mobile-only abilities or altered role mechanics.
8. The touch-first controls must coexist with the existing HUD and world rendering without covering the entire playfield or making the game unusable on common phone screen sizes.
9. Desktop and non-touch browser behavior must remain available as it works today: keyboard movement, current key bindings, and existing HUD behavior must not regress.
10. This change must stay within the existing browser client/server product shape: no native app packaging, no app-store deployment work, and no alternate mobile-only game mode.

## Out of scope

- Native iOS or Android app wrappers, store submission, or device-specific install flows.
- Replacing desktop keyboard controls with tap-to-move on non-touch browsers.
- Adding gesture features beyond the minimum needed mobile gameplay controls, such as pinch zoom, swipe camera panning, or haptic feedback.
- Reworking role balance, paint rules, ult rules, or other gameplay systems beyond making their existing actions reachable on touch devices.

## Acceptance

1. On a phone-sized touch browser, a reviewer can join the world and move by tapping a destination in the world, with the avatar continuing toward that point automatically.
2. While moving on mobile, tapping a different location redirects the avatar toward the new destination.
3. On mobile, the reviewer can trigger paint, jump, and ult from visible touch controls without a physical keyboard.
4. Those touch actions behave the same way as the existing desktop inputs with respect to world interaction, roster/ult state, and multiplayer visibility.
5. On desktop, existing keyboard controls and HUD behavior continue to work as before.
