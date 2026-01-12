# carpool-planer
Automated carpool coordination using the Campflow API. Fetches event dates to streamline transport planning for group trips.

## Development (Nix flake)
- Enter devshell: `nix develop` (direnv: `.envrc` with `use flake`).
- Formatter: `nix fmt` (alejandra).
- Lint/tests via flake checks: `nix flake check` (runs `pnpm run lint` / `pnpm test` if scripts exist).
- Build: `nix build` (prefers `pnpm-lock.yaml`, falls back to `bun.lockb`).
- Env: set `CAMPFLOW_TOKEN` in your shell for Campflow API access (not stored in the repo).

## Development (npm)
- Install deps: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint` (astro check)
- Build: `npm run build`

## Current scope
- Astro + Tailwind 4 UI mit DPSG-Farben; Event-Dropdown, Teilnehmerliste, Planner für Hin/Rück getrennt.
- Prod/Dev: In Prod Campflow (Token `CAMPFLOW_TOKEN`), sonst CSV-Fallback. Modus wird im UI angezeigt.
- Auto-Fahrerzuweisung mit Leiter-Priorität; Plätze aus Teilnehmerangaben, Leftover-Hinweis.
- Export: CSV-Download und Copy-to-Clipboard (PDF später).
- CSV-Sample `Winter-Wochenende_2026.csv` bleibt lokal und wird nicht committed.
- Zukunft: Campflow-Endpoints finalisieren/anpassen, manuelle/Drag&Drop-Zuweisung und PDF.
