# usePlatoAI

macOS-first desktop AI companion built as a Tauri app inside a pnpm/Turborepo
monorepo.

## Development

Install dependencies:

```bash
pnpm install
```

Run the desktop shell locally:

```bash
pnpm desktop:dev
```

The desktop command starts the Vite-powered React UI through Tauri. A local Rust
toolchain is required for Tauri commands.

Baseline verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Milestone 001 has a manual launch and verification path in
[`docs/milestones/001-desktop-shell-and-first-run.md`](docs/milestones/001-desktop-shell-and-first-run.md#local-launch-and-verification).
