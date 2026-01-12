# carpool-planer
Automated carpool coordination using the Campflow API. Fetches event dates to streamline transport planning for group trips.

## Development (Nix flake)
- Enter devshell: `nix develop` (direnv: add `.envrc` with `use flake`).
- Formatter: `nix fmt` (alejandra).
- Lint/tests via flake checks: `nix flake check` (runs `pnpm run lint` / `pnpm test` if scripts exist).
- Build: `nix build` (prefers `pnpm-lock.yaml`, falls back to `bun.lockb`).
- Env: set `CAMPFLOW_TOKEN` in your shell for Campflow API access (not stored in the repo).
