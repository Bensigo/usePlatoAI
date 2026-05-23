# Issue 273 Native Visual Evidence

Evidence captured on macOS with two online displays:

- Built-in Liquid Retina XDR Display, 3024 x 1964 Retina, main display.
- BenQ GW2480 external display, 1920 x 1080.

Files:

- `native-restart-external-finder-focused.png` - captured after restarting `pnpm --filter @useplatoai/desktop tauri dev`; Plato relaunches visible on the external display.
- `native-external-finder-focused.png` - captured after focusing Finder; Plato remains visible on the external display after focus changes.

Relevant checks:

- `system_profiler SPDisplaysDataType` confirmed both displays were online.
- `screencapture -D 2` captured the external display evidence.
- Geometry behavior beyond the attached hardware is covered by the existing Rust placement tests for display bounds, clamping, and missing-display fallback.
