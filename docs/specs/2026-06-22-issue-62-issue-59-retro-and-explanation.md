# Issue #59 retro and player-facing explanation

## Goal

Explain what issue #59 added and how those additions change gameplay, in the welcome screen and repository docs.

## Context

Issue #59 already shipped role selection, a global player roster, role-bound non-combat ults, `E` ult activation, and hold-`Space` painting (`docs/specs/2026-06-22-issue-59-player-roster-and-ults.md`, `docs/project-map/client.md`, `docs/project-map/server.md`). The current product promise is low-friction browser entry, with the player choosing a name and entering the world quickly (`docs/vision.md`, `docs/prd/mvp.md`). Issue #62 asks for a retro-style explanation of what changed in issue #59, how it affects gameplay, and for that explanation to appear in the welcome screen and project docs. The author clarified that the welcome screen should explain only the new issue-59 mechanics, not a full gameplay guide.

## Requirements

1. The username-entry welcome screen must include a short, visible explanation block describing only the mechanics introduced by issue #59.
2. That welcome-screen explanation must cover all of these gameplay changes, in player-facing language:
   1. each player chooses one role before entering the world;
   2. the available roles are `Pulse`, `Cross`, and `Trail`;
   3. normal painting charges the selected role's ult;
   4. pressing `E` activates a ready ult;
   5. holding `Space` continues painting while the player moves across new tiles;
   6. the player roster shows connected players together with their roles and ult progress.
3. The welcome-screen explanation must state the gameplay effect of each role clearly enough that a first-time player can tell how `Pulse`, `Cross`, and `Trail` differ before entering the world.
4. The welcome-screen explanation must stay concise: it is a short mechanic explainer on the existing entry overlay, not a modal, tutorial sequence, or long-form manual.
5. The README must gain a short section that explains what issue #59 added and how those changes affect gameplay, matching the mechanics listed above.
6. The project docs must be updated with welcome-screen guidance so future agents can see that the entry overlay now explains the issue-59 mechanics; this update must live in the canonical existing docs surface for the client or project-map, not only in the spec.
7. The wording across the welcome screen, README, and project docs must describe the same mechanics and controls; the surfaces may differ in length, but they must not contradict each other.
8. This work must not change the actual issue-59 mechanics, controls, balancing, charge thresholds, or roster behavior; it only documents and explains the shipped behavior.

## Out of scope

- Adding a full beginner guide for every control or every existing feature in the game.
- Changing role behavior, ult numbers, charge rules, or paint logic.
- Adding a new tutorial flow, pop-up sequence, or separate help screen.
- Explaining features unrelated to issue #59 beyond any minimal context needed for the issue-59 copy to read clearly.

## Acceptance

1. On the welcome screen, before entering the world, a player can read a short explanation of the issue-59 mechanics that includes roles, roster, ult charging, `E` ult activation, and hold-`Space` painting.
2. The welcome-screen copy tells the player how `Pulse`, `Cross`, and `Trail` differ in gameplay terms before the player joins.
3. The README contains a short issue-59 explanation section covering the same mechanic set and gameplay impact.
4. The project-map or other canonical project docs mention that the welcome screen now includes issue-59 mechanic guidance for players.
5. A reviewer comparing the welcome screen, README, and updated docs can confirm the descriptions are materially consistent and do not promise mechanics that the game does not have.
