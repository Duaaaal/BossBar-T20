# Release commit summary — 2.0.0-beta.4

```text
Version 2.0.0-beta.4 - attack library, validated sheets and encounter polish

- Add a persistent, tagged attack library with independent boss and phase arsenals.
- Support multi-strike attacks and on-hit conditions with interactive resistance rolls.
- Preserve pending resistances in checkpoints and prevent duplicate damage resolution.
- Separate weapon formulas from player adjustments that require master approval.
- Standardize damage types and range selectors while preserving legacy sheet values.
- Restore shared portrait rendering and persist per-track playlist loops.
- Unify control typography, focus states, buttons, fields and modal spacing.
- Redesign the attack library and integrate arsenals into the scene-editor layout.
- Fix clipped dialogs, orphaned labels, stale tooltips and narrow-window overflow.
- Improve party HUD density, portrait spacing and turn-counter clearance.
- Show newest fight-history entries first without changing their original numbering.
- Add persisted media-fit modes and aspect-ratio guidance for phases and cutscenes.
- Open the attack library in an independent window with a restricted preload API.
- Offer encounter saving before exit, with overwrite confirmation and failure recovery.
- Let the master assume disconnected characters and explicitly return their control.
- Stage invalid PDF imports, highlight repairable fields and revalidate before applying.
- Preserve accepted sheets during failed imports and support safe calculation repairs.
- Validate numeric, dice, damage-type, range and legacy critical fields against the bundled PDF template.
- Add desktop/web viewport, overlap and screenshot checks, including ten-client load.
```

Validated locally: lint, TypeScript, 192 unit tests, 54 web tests across Chromium/Chrome/Edge, five Electron tests and packaging. Eighteen web cases retain their existing browser-scope skips. Firefox was independently retried and still cannot create a blank page in this environment; its full-screen baselines require review in a working runner. The previously reported audio stutter remains unresolved. See `final-touches-and-pdf-validation.md` for the import and continuity audit scope.

Release version: `2.0.0-beta.4`. This summary consolidates changes since `2.0.0-beta.3` without listing intermediate redesigns. Remote publication is a separate step; this release preparation does not request a push.
