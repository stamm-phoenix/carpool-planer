# AGENTS.md

Repository guide for agentic coding tasks. Scope: entire repo.

## Quick commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint/typecheck: `npm run lint` (`astro check`)
- Tests: `npm run test` (currently a stub)

## Environment
- Node >=20.
- `CAMPFLOW_TOKEN` is required for the production Campflow proxy and must never be committed or logged.
- Azure Static Web Apps authentication remains Microsoft Entra ID via `staticwebapp.config.json`.

## Project structure
- `src/pages/index.astro`: planning UI, participant view and Campflow controls.
- `src/layouts/BaseLayout.astro`: document shell and fonts.
- `src/styles/global.css`: DPSG palette and app layout.
- `src/lib/types.ts`: shared Campflow/planner types.
- `src/lib/planner.ts`: car selection, locked-child rule, manual moves and CSV export.
- `api/campflow/`: Azure Function proxy to Campflow.

## Planner semantics
- `Hinfahrt` and `Rückfahrt` are child capacities, not seats including the adult driver.
- A non-leader participant with capacity > 0 identifies a parent car. Never invent or display the parent's name.
- Display parent cars as `Eltern von <Kind>` or equivalent wording that names only the child.
- If a parent car is selected, that child is a locked passenger and must never be manually moved out of the car.
- Leaders with capacity > 0 may be actual drivers; they do not consume one of the configured child places.
- Prefer as few cars as possible, with larger capacities first. Family/group affinity is a secondary assignment heuristic.
- Disabling a car removes only that car offer; its anchor participant remains part of transport demand.
- Clear manual move state when the selected car set changes.

## UI/UX
- Keep UI text in German.
- Avoid generic card grids and card-in-card layouts. Prefer spacing, typography, alignment and dividers for grouping.
- Use a raised/elevated surface only for a real interaction layer such as a dialog.
- Use DPSG stage colors only when they encode a real group.
- Keep visible form labels, keyboard focus, mobile layouts and `prefers-reduced-motion` support.

## Campflow/API
- Frontend calls `/api/campflow`; the token stays server-side.
- Events: `/events`.
- Participants: `/lists/{listId}/persons` with cursor pagination.
- Columns: `/lists/{listId}/columns`, with numeric-field inference fallback.
- Normalize custom column values to non-negative integers.

## Git/hygiene
- Do not commit `.env`, tokens, local `.envrc` variants or `Winter-Wochenende_2026.csv`.
- Avoid committing generated `.astro/` cache.
- Prefer npm scripts for checks in the working tree.
- The current test script is a stub; do not claim real automated test coverage.
