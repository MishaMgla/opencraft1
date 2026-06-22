# Save username

## Goal

Let a player keep using the same username across page reloads without retyping it, while still being able to edit that username from the in-game HUD.

## Context

The current MVP flow is anonymous and browser-first: a player picks a display name and joins the shared world with no account system (`docs/vision.md`, `docs/prd/mvp.md`). The client already uses lightweight DOM overlays for name-entry and the top-left HUD above the Pixi world (`docs/project-map/client.md`). Issue #68 asks to remove the need to re-enter the username on every refresh, while keeping the username editable from the top-left in-game surface rather than introducing a larger identity or account feature.

## Requirements

1. The client must persist the last saved username in browser-local storage so the same browser on the same device can reuse it after a full page reload.
2. If a saved username exists when the page loads, the client must treat that saved username as the active join name for the session so the player does not need to retype it after refreshing.
3. If no saved username exists yet, the current first-time join flow must remain in place so a new player can choose a username before entering the world.
4. This username persistence must stay anonymous and local-only: it must not introduce accounts, passwords, email collection, cross-device sync, or any server-side profile record beyond the display name already used for the session.
5. During gameplay, the top-left HUD username text must be an obvious control that opens a profile modal when clicked.
6. The profile modal must show the current username and provide an edit field plus a save action for changing it.
7. Saving a new username from the profile modal must update the browser-local saved username immediately so future reloads use the new value instead of the old one.
8. Saving a new username from the profile modal must also update the active in-session username presentation immediately, including the top-left HUD label and any other on-screen local-player name label that reflects the current session name.
9. The profile-edit flow must not force the player to leave the world, reload the page, or re-open the initial join form just to change the username.
10. Reloading the page after a username has been saved must bring the player back using that saved username unless they have since changed it through the profile modal.
11. This issue must not change role selection, movement, painting, roster behavior, or other gameplay systems except where the displayed username string needs to reflect the saved or edited value.

## Out of scope

- Building account registration, login, or cloud-synced profiles.
- Persisting any identity fields besides the username.
- Redesigning the rest of the HUD beyond the minimum click target and profile modal needed for username editing.
- Changing unrelated join-flow behavior for roles or other gameplay settings.

## Acceptance

1. A first-time visitor with no saved username still goes through the existing username-entry flow.
2. After entering a username once, refreshing the page in the same browser session or a later visit on the same browser/device joins with that saved username without requiring the player to type it again.
3. During gameplay, clicking the top-left username opens a profile modal that shows the current username and allows it to be edited.
4. Saving a new username from that modal updates the visible local username in-game immediately and becomes the username used on the next page reload.
5. No account, login, password, or cross-device identity system is added as part of this work.
