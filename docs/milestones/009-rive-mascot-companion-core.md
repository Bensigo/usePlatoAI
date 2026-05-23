# Milestone 009: Rive Mascot Companion Core

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator launches the desktop app and sees a small-medium animated mascot companion living on the desktop, anchored bottom-right by default, always on top, visually alive, draggable on demand, and verified through the real desktop window instead of the browser dev server.

This milestone corrects the product direction: Plato is a companion-first desktop product, not a panel-first web app inside Tauri.

## Users

- Builder Operator
- Non-technical user

## Vertical Scope

This milestone may touch:

- Avatar package: Rive renderer, state contract, animation commands, source/license docs, assets, startup sound hook, fallback behavior
- Desktop shell: transparent frameless always-on-top companion-sized window, bottom-right positioning, click-through transparent area, character click/double-click behavior
- Desktop windowing: draggable mode, persisted position, display-aware clamping, multi-monitor display identity handling
- Product behavior: automatic startup sound, greet/wave on launch, living idle, single-click smile/wave, hidden test triggers for non-product animation verification
- Tests: avatar package rendering/state tests, desktop window geometry tests, persistence tests, Computer Use desktop verification
- Evidence: desktop screenshot or short video of the real floating companion window

## Product Direction

Milestone 009 uses a commercial-safe 2D vector/cartoon mascot. The mascot may be non-human if it feels alive, expressive, and memorable. It does not need to be final custom Plato art, but it must not feel like a generic static placeholder.

All avatar rendering, animation state, assets, sound hooks, and renderer-specific mapping belong in `packages/avatar`. Desktop app code should consume the avatar package through product states and commands, not by reaching into renderer internals or asset filenames.

## Supported Companion States

- `appearing`
- `idle`
- `greeting`
- `happy`
- `sad`
- `talking`
- `celebrating`
- `error`

The first Rive asset must support visible behavior for:

- startup/appear
- wave or greet
- living idle
- smile or happy reaction
- sad reaction
- talking loop
- dance or celebration

## Acceptance Criteria

- [ ] A commercial-safe temporary mascot asset is sourced, license/source is documented, and the shippable Rive asset lives under `packages/avatar`.
- [ ] `packages/avatar` owns avatar states, commands, renderer mapping, assets, startup sound hook, fallback behavior, and public React/component APIs.
- [ ] Rive is the primary renderer for the companion.
- [ ] The desktop app launches into a transparent, frameless, always-on-top companion-sized window.
- [ ] The normal desktop window shows only the companion by default; no dashboard, panel, top navigation, settings surface, or web-style shell is visible.
- [ ] The companion defaults to bottom-right of the active/main display and is roughly small-medium sized, target about 190px tall.
- [ ] Startup sound plays once on app launch or activation and does not replay because of React hot reload.
- [ ] The companion automatically plays a startup greet/wave sequence and settles into living idle.
- [ ] Single-clicking the visible character triggers smile/wave without opening a panel.
- [ ] Transparent empty pixels do not block normal desktop clicks.
- [ ] Double-clicking the visible character toggles draggable mode.
- [ ] Draggable mode shows a subtle visual cue.
- [ ] The user can drag the companion while draggable mode is active, and the position persists across restart.
- [ ] Draggable mode exits by second double-click or after an idle timeout.
- [ ] The companion stays always-on-top after drag and across normal app focus changes.
- [ ] Multi-monitor handling keeps the companion visible on the active/main display and clamps saved positions when displays change or disconnect.
- [ ] A hidden test-only command path can trigger `greeting`, `happy`, `sad`, `talking`, and `celebrating` without showing product UI controls.
- [ ] Browser-localhost verification does not count as product verification for this milestone.
- [ ] Computer Use verifies the actual desktop app window for default position, always-on-top behavior, startup/greet, click reaction, draggable mode, persisted position, and at least one hidden test animation trigger.
- [ ] Visual evidence includes a desktop screenshot or short video of the floating companion window only.

## Test Plan

- Run package-level avatar state and renderer tests.
- Run desktop unit tests for window geometry, persisted position, display clamping, and test-only command mapping.
- Run the desktop app through Tauri, not only Vite.
- Use Computer Use to verify the real desktop companion window, including interactions that cannot be proven in browser tests.
- Capture visual evidence for startup/greet, idle, click reaction, draggable cue/drag, and at least one hidden animation trigger.

## Likely Issue Slices

- Source and integrate commercial-safe Rive mascot in `packages/avatar`.
- Render the companion through `packages/avatar` in a companion-only desktop window.
- Add startup sound and automatic greet-to-idle sequence.
- Add click reaction and hidden test animation commands.
- Add double-click draggable mode with persisted position.
- Add always-on-top and multi-monitor position correctness.
- Add Computer Use desktop verification and visual evidence checklist.

## Blocked By

- Milestone 008: Capabilities, Skills, And Browser Automation

## Non-Goals

- Real voice capture
- Speech-to-text or text-to-speech
- Agent engine behavior
- Skills or browser automation behavior
- Settings panels or dashboard surfaces
- Final custom Plato art from scratch

## Notes

Milestone 010 owns voice. Milestone 011 owns agent and skills. Milestone 009 must make the companion itself feel real before those layers are added.
