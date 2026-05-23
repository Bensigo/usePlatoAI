# Issue 273 Native Visual Evidence

Evidence captured on macOS with two online displays:

- Built-in Liquid Retina XDR Display, 3024 x 1964 Retina, main display.
- BenQ GW2480 external display, 1920 x 1080.

Files:

- `native-restart-external-finder-focused.png` - captured after restarting `pnpm --filter @useplatoai/desktop tauri dev`; Plato relaunches visible on the external display.
- `native-external-finder-focused.png` - captured after focusing Finder; Plato remains visible on the external display after focus changes.
- `native-overlapping-finder-focused.png` - captured with Finder focused and a normal Finder window positioned under Plato on the external display; Plato's approval bubble and avatar remain visible above the overlapping native window.

Relevant checks:

- `system_profiler SPDisplaysDataType` confirmed both displays were online.
- `screencapture -D 2` captured the external display evidence.
- Finder overlap was arranged with native window bounds `{1180, -620, 1900, 40}` while the `usePlatoAI` window reported position `1385,-327` and size `260,280` through System Events.
- Geometry behavior beyond the attached hardware is covered by the existing Rust placement tests for display bounds, clamping, and missing-display fallback.
