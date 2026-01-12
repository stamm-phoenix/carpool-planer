{
  description = "carpool-planer dev environment and build via Nix";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachSystem [
      "x86_64-linux"
      "aarch64-darwin"
      "x86_64-darwin"
    ]
    (
      system: let
        pkgs = import nixpkgs {inherit system;};
        node = pkgs.nodejs_22;
        pnpm = pkgs.pnpm;
        bun = pkgs.bun;
        commonShellPkgs = [node pnpm bun pkgs.git pkgs.jq pkgs.curl];
        lspPkgs = [pkgs.nil pkgs.statix pkgs.alejandra];
      in {
        formatter = pkgs.alejandra;

        devShells.default = pkgs.mkShell {
          packages = commonShellPkgs ++ lspPkgs;
          shellHook = ''
            echo "DevShell ready: node=$(${node}/bin/node -v), pnpm=$(${pnpm}/bin/pnpm --version), bun=$(${bun}/bin/bun --version)"
            echo "Set CAMPFLOW_TOKEN in your env for Campflow API access."
          '';
        };

        devShells.ci = pkgs.mkShell {
          packages = commonShellPkgs;
        };

        packages.default = pkgs.stdenvNoCC.mkDerivation {
          pname = "carpool-planer";
          version = "0.0.1";
          src = ./.;
          nativeBuildInputs = [node pnpm bun];
          buildPhase = ''
            set -euo pipefail

            run_pnpm() {
              pnpm install --frozen-lockfile
              pnpm run build
            }

            run_bun() {
              bun install --frozen-lockfile
              bun run build
            }

            if [ -f pnpm-lock.yaml ]; then
              echo "Using pnpm-lock.yaml"
              run_pnpm
            elif [ -f bun.lockb ]; then
              echo "Using bun.lockb"
              run_bun
            else
              echo "No lockfile (pnpm-lock.yaml or bun.lockb) found. Add one before building." >&2
              exit 1
            fi
          '';
          installPhase = ''
            set -euo pipefail
            mkdir -p $out
            if [ -d dist ]; then
              cp -r dist $out/
            else
              echo "dist/ not found; ensure build outputs to dist" >&2
              exit 1
            fi
          '';
        };

        checks = {
          lint = pkgs.runCommand "lint" {nativeBuildInputs = [node pnpm];} ''
            set -euo pipefail
            if [ -f pnpm-lock.yaml ] && [ -f package.json ] && node -e "const s=require('./package.json').scripts||{}; process.exit(s.lint?0:1)"; then
              pnpm install --frozen-lockfile
              pnpm run lint
            else
              echo "Skipping lint (no pnpm-lock.yaml or no lint script)"
            fi
            mkdir -p $out
            echo "ok" > $out/result
          '';

          test = pkgs.runCommand "test" {nativeBuildInputs = [node pnpm];} ''
            set -euo pipefail
            if [ -f pnpm-lock.yaml ] && [ -f package.json ] && node -e "const s=require('./package.json').scripts||{}; process.exit(s.test?0:1)"; then
              pnpm install --frozen-lockfile
              pnpm test
            else
              echo "Skipping tests (no pnpm-lock.yaml or no test script)"
            fi
            mkdir -p $out
            echo "ok" > $out/result
          '';

          nixfmt = pkgs.runCommand "nixfmt" {nativeBuildInputs = [pkgs.alejandra];} ''
            set -euo pipefail
            alejandra --check ${./flake.nix}
            mkdir -p $out
            echo "ok" > $out/result
          '';
        };
      }
    );
}
