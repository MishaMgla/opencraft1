# Remove issue #59 retro block from README

## Goal

Remove the issue-#59 retro explainer block from `README.md` while leaving the rest of the README intact.

## Context

The README is a public-facing overview of opencraft1 and currently includes a dedicated ASCII-styled "ISSUE #59 RETRO" section explaining the mechanics added in issue #59. The project-map changelog records that issue #62 added this README explanation block as a follow-up documentation surface (`docs/project-map/README.md`). Issue #65 asks specifically to remove that retro explanation block from `README.md`, with no request to change gameplay, controls, or the rest of the README presentation.

## Requirements

1. `README.md` must no longer include the ASCII banner block headed `I S S U E   # 5 9   R E T R O`.
2. Removing that block must also remove the issue-#59 explanatory copy directly attached to it, including the role, ult, hold-`Space`, and roster description that appears under that heading.
3. The surrounding README sections before and after the removed block must remain in place, preserving the existing top banner, project introduction, "HOW TO" section, and "UNDER THE HOOD" section.
4. The removal must not add a replacement explainer, redirect, or new README section unless needed only to keep spacing or formatting clean after deletion.
5. This work must not change gameplay behavior, in-game copy, issue-#59 mechanics, or any non-README documentation surface.

## Out of scope

- Rewriting the rest of the README.
- Changing the welcome overlay or any in-game explanatory text.
- Modifying role, ult, painting, or roster mechanics.
- Removing other README sections besides the issue-#59 retro block.

## Acceptance

1. A reviewer opening `README.md` can confirm the `I S S U E   # 5 9   R E T R O` section is gone.
2. The README still contains the surrounding sections and remains readable after the removal.
3. No files other than the spec and the eventual README implementation are required by this issue.
