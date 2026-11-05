# Release readiness validation

Validation date: November 6, 2026

## Automated checks

| Check | Result |
| --- | --- |
| `npm.cmd test` | Passed: 94 tests, 0 failures |
| `npm.cmd run build` | Passed: generated the static demo build in `dist/` |
| Profile configuration | Generic capability-based endpoint fixtures pass validation and routing checks |

Coverage includes API endpoint validation, coordinator delegation, task planning and dependencies, mission recovery, document handling, prompt extraction, image generation routing, narration checks, scene validation, motion, rendering cadence, and browser request protections.

## Repository hygiene

- Personal Hermes profile rosters, profile prompts, reference files, and profile-specific setup examples have been removed from the current source tree.
- Live setup uses user-created Hermes profiles with generic capability IDs in the private `.env` file.
- `.env`, other `.env.*` files except `.env.example`, `data/`, `backups/`, `work/`, `node_modules/`, `dist/`, and local logs are ignored by Git.
- The demo GIFs show only simulated room characters and contain no live profile configuration or Hermes results.
- The custom source-available license is separate from the third-party licenses listed in `THIRD_PARTY_NOTICES.md`.

## Scope and limits

Automated tests use local fixtures and mock Hermes endpoints. This validation does not submit a live mission to a Hermes profile or generate images through Google Flow. Those workflows depend on each user's models, profile configuration, plugins, tools, gateway, browser, and external service access.

The static `dist/` output is a demo build and does not contain the live Hermes bridge. Use `npm start` for live operation.
