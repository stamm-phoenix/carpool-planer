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
- Demo UI scaffolded (Astro + Tailwind 4) for event selection, CSV demo, and planning (Hin/Rück getrennt).
- Drivers prioritized: Leiter ("🐦‍🔥 Leitende / Ehemalige / Externe") first.
- CSV sample `Winter-Wochenende_2026.csv` is local only (do not commit).
- Future: Fetch events from Campflow API (dropdown), replace CSV with Campflow participants, apply DPSG CI colors/fonts.
