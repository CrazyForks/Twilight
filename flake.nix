{
  description = "Twilight development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              go_1_23
              nodejs_22
              pnpm
              pkg-config
              openssl
            ];

            shellHook = ''
              echo "Twilight dev shell: Go $(go version), Node $(node --version), pnpm $(pnpm --version)"
              echo "Backend check: go test ./..."
              echo "Frontend deps: cd webui && pnpm install --frozen-lockfile"
            '';
          };
        });
    };
}
