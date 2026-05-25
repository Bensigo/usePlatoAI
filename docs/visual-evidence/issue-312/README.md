# Issue 312 Visual Evidence

Native desktop run:

```bash
pnpm --filter @useplatoai/desktop dev
cd apps/desktop/src-tauri && cargo run --no-default-features --color always --
```

Desktop cursor positions were set with macOS `CGWarpMouseCursorPosition`, then captured with `screencapture`.

Captured states:

| Capture | Cursor position |
| --- | --- |
| `native-eye-left.png` | `x=990, y=546` |
| `native-eye-right.png` | `x=1500, y=546` |
| `native-eye-up.png` | `x=1243, y=200` |
| `native-eye-down.png` | `x=1243, y=900` |
| `native-eye-diagonal.png` | `x=1500, y=200` |

The `*-head.png` files are tight crops of the same native screenshots for easier eye inspection.
