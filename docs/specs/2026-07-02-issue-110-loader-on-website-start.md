# Loader on website start

## Goal

Prevent returning users from seeing a brief flash of the welcome/name-entry screen on page load by showing a startup loader until auto-join resolves.

## Context

The client already persists a browser-local username and auto-joins returning users on reload, skipping the first-time name-entry flow when a saved username exists ([docs/specs/2026-06-23-issue-68-save-username.md](2026-06-23-issue-68-save-username.md)). The web client uses DOM overlay surfaces for entry and HUD state above the Pixi world, with startup orchestration in `main.ts` and the saved-username flow documented in the client map ([docs/project-map/client.md](../project-map/client.md)). Issue #110 asks for a UX polish fix: existing users should not see the welcome form flash before the client redirects them into the game.

## Requirements

1. On page load, if a saved username exists for the current browser, the client must not visibly render the welcome/name-entry screen before attempting the returning-user join flow.
2. For that saved-username path, the client must present a loading state instead of the welcome/name-entry UI while startup checks and the auto-join attempt are in progress.
3. When the auto-join succeeds, the client must transition from the loading state directly into the in-game view without ever showing the welcome/name-entry screen during that startup pass.
4. If no saved username exists, the current first-time welcome/name-entry flow must remain available and must not be replaced by the returning-user loader.
5. If the returning-user auto-join cannot complete, the client must leave the user in a recoverable state rather than an indefinite loader, with the normal welcome/name-entry flow available so they can still enter the game.
6. This change must preserve the existing local-only username persistence model, current role-selection/default-role behavior, and existing gameplay/networking behavior after the player enters the world.

## Out of scope

- Adding account auth, server-side session restoration, or cross-device identity.
- Redesigning the welcome flow beyond the minimum startup-state change needed to remove the flash for returning users.
- Changing gameplay controls, roster behavior, persistence semantics, or profile-edit behavior outside the startup transition.

## Acceptance

1. A reviewer with no saved username still lands on the existing welcome/name-entry experience.
2. A reviewer with a saved username can reload the site and sees a loading state instead of a brief flash of the welcome/name-entry screen.
3. On a successful returning-user startup, the page moves from loader to in-game view with no visible welcome-screen flash.
4. If the returning-user startup path fails, the page does not stay stuck on a loader and the user can still use the normal welcome/name-entry flow to proceed.
5. Username persistence and in-game behavior remain otherwise unchanged compared with the current saved-username flow.
