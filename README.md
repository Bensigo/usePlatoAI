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
