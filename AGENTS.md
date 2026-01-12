# AGENTS.md

Repository guide for agentic coding tasks. Scope: entire repo.

## Quick commands
- Install (npm): `npm install`
- Install (pnpm): `pnpm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint/typecheck: `npm run lint` (astro check)
- Tests: `npm run test` (currently stub, exits 0)
- Single test: not available (no real test suite yet)
- Format Nix: `nix fmt`
- Flake checks: `nix flake check` (runs lint/test if scripts exist)
- Nix build: `nix build`

## Environments
- Default package manager in repo: npm (package-lock.json). pnpm/bun supported via flake.
- Node: >=20 (Node 22 available via flake).
- Devshell: `nix develop` (direnv with `.envrc` -> `use flake`).
- CAMPFLOW_TOKEN: required in production mode for API fetch; do not commit.
- CSV sample `Winter-Wochenende_2026.csv` stays local/untracked; do not add to git.
- Prod/Dev behavior: Dev uses CSV; Prod fetches Campflow events/participants with token, else falls back to CSV.

## Project structure (key)
- `src/pages/index.astro`: main page, event selection, planner UI.
- `src/layouts/BaseLayout.astro`: layout, fonts, imports global.css.
- `src/styles/global.css`: Tailwind import + DPSG palette/background.
- `src/lib/types.ts`: shared types (Participant, CampflowEvent).
- `src/lib/csvLoader.ts`: CSV parsing for sample data.
- `src/lib/campflow.ts`: Campflow API client (placeholder endpoints).
- `src/lib/planner.ts`: auto car assignment, priority, CSV export formatter.
- `flake.nix`: devshells, build, checks. `flake.lock` pinned.
- `.envrc`: local (ignored) with `use flake` (do not commit generated variants).

## Build/lint/test details
- Lint: `npm run lint` → `astro check` (installs @astrojs/check + typescript). No additional ESLint configured.
- Tests: `npm run test` is a stub. No test runner; single-test execution unsupported.
- Build: `npm run build` → Astro static build.
- Nix checks: `nix flake check` triggers lint/test if scripts exist and pnpm-lock present; with npm it may skip (uses pnpm install in derivation). Prefer running npm scripts directly in working tree.
- Flake package build: uses `pnpm-lock.yaml` first, then `bun.lockb`; fails if none.

## Styling & formatting
- Tailwind via `@tailwindcss/vite`; global styles in `src/styles/global.css` with DPSG colors and gradients.
- Typography: BaseLayout sets system/Inter fallback via inline @font-face; keep body font-family consistent.
- Astro components: keep script frontmatter minimal; prefer server-side data fetch in frontmatter, render via JSX-like template.
- Imports order: standard libs first, then local modules; keep type imports explicit (`import type`); group blank line between groups.
- Types: use explicit types for props and data; avoid `any`; use interfaces in `src/lib/types.ts` when reusable.
- Naming: PascalCase for components, camelCase for functions/vars, SCREAMING_SNAKE for env names. Participant fields follow CSV keys (Vorname, Nachname, Gruppen, Hinfahrt, Rückfahrt).
- Error handling: Surface user-friendly fallback; Campflow fetches should catch and fallback to CSV. Do not throw unhandled errors in page frontmatter.
- Planner logic: respects `groupPriorityOrder` (Leiter zuerst), sorts by group priority then seats desc; seats include driver; passenger capacity = seats-1.
- Exports: `planToCsv` used for download/copy; keep CSV header `Richtung,Fahrer,Plätze,Mitfahrende`.

## UI/UX guidance
- Preserve DPSG palette variables from `global.css` and dark background.
- Keep accessibility: label inputs, use semantic headings; ensure contrast on buttons.
- Event dropdown: future Campflow data; keep demo sample as fallback.
- Buttons: CSV Export triggers Blob download; Copy uses clipboard API (best-effort).
- PDF export is stub; don’t implement unless requested.

## Data sources & env
- Campflow endpoints currently placeholder: `${CAMPFLOW_BASE}/v1/events` and `/v1/events/{id}/participants`. Confirm and adjust when specs arrive.
- Token passes as `Authorization: Bearer <token>`; do not log token.
- CSV sample parsing assumes header: Vorname,Nachname,Gruppen,Hinfahrt,Rückfahrt with quotes.

## Git/hygiene
- Do NOT commit `Winter-Wochenende_2026.csv` or `.envrc` variants.
- Keep `flake.lock` in sync when changing `flake.nix`.
- Avoid generating `.astro/` cache in commits; remove before commit.
- Respect existing scripts and package manager choice; if switching to pnpm, add lock and update instructions.

## Adding tests (future)
- If tests are added, document single-test invocation in this file and scripts; prefer npm test -- <pattern> or vitest --run <pattern> if introduced.
- Until then, mark test-related changes as stub-only and avoid fake pass conditions in CI.

## Adding lint/format (future)
- If ESLint/Prettier added, update commands here; keep Astro check as part of lint.
- Nix formatting handled by `nix fmt` (alejandra); do not add other Nix formatters.

## Deployment/CI hints
- Github Actions/CI not yet defined; Nix outputs ready for CI (`devShells.ci`, `checks`).
- Production mode requires `CAMPFLOW_TOKEN`; ensure secrets configured when wiring CI/CD.

## Cursor / Copilot rules
- None present (.cursor/ or .github/copilot-instructions.md not found). If added, mirror here in future updates.

## Conventions recap
- Prefer npm scripts for dev; flake for reproducibility.
- Keep prod/dev mode toggle intact; prod fetch with token, otherwise CSV fallback.
- Maintain group priority order from `planner.ts`.
- Keep UI texts in German as currently present.
- Document new commands in this file when added.
