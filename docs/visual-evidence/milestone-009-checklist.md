# Milestone 009 Visual Evidence Checklist

Use this checklist for Milestone 009 implementation PRs and for the milestone completion PR. The goal is repeatable evidence from the real macOS desktop companion window, not from the Vite localhost page.

Browser-localhost screenshots do not count for this milestone. A screenshot of `http://127.0.0.1:*` or a normal browser tab only proves the React surface; it does not prove Tauri windowing, bottom-right placement, transparent frameless behavior, always-on-top layering, desktop dragging, or persisted native position.

## Required Desktop Run

- [ ] Launch the native desktop shell with `pnpm desktop:dev` or the hidden-state helper below.
- [ ] Verify first-run setup is complete, or complete it before judging companion behavior.
- [ ] Confirm the visible product surface is the floating companion window, not a dashboard, panel, browser tab, or web-style shell.
- [ ] Confirm the window starts bottom-right on the active/main display.
- [ ] Confirm the companion is always on top by focusing another normal app or window and checking Plato remains visible above it.
- [ ] Confirm startup greet/wave plays and settles into living idle.
- [ ] Single-click the visible character and confirm the smile/wave reaction.
- [ ] Double-click the visible character and confirm draggable mode shows its visual cue.
- [ ] Drag the companion while draggable mode is active.
- [ ] Quit and relaunch, then confirm the dragged position persists and remains clamped onscreen.
- [ ] Trigger at least one hidden test animation state through the documented helper or command path.

## Hidden Test Command Path

The desktop app accepts hidden avatar test commands through `VITE_PLATO_AVATAR_TEST_COMMAND` during Tauri launch. This path is for verification only and does not expose product UI controls.

Supported commands:

- `greeting`
- `wave`
- `happy`
- `smile`
- `laugh`
- `sad`
- `error`
- `thinking`
- `talking`
- `speaking`
- `dance`
- `celebration`

Launch a state-specific desktop run from the repo root:

```bash
scripts/milestone-009-avatar-state wave
```

Equivalent raw command:

```bash
VITE_PLATO_AVATAR_TEST_COMMAND=wave pnpm desktop:dev
```

The command must open the native `usePlatoAI` Tauri window. Do not use the browser page that Vite also serves as milestone evidence.

## Required Captures

Capture desktop screenshots or a short desktop video for the relevant PR scope:

- [ ] Startup/greet: native desktop window visible during or immediately after launch.
- [ ] Idle: floating companion settled after startup.
- [ ] Click reaction: single-click smile/wave state.
- [ ] Drag cue: draggable mode visual cue after double-click.
- [ ] Persisted position: relaunch after drag showing the saved location.
- [ ] Talking: hidden `talking` command run in the native desktop window.
- [ ] Sad: hidden `sad` command run in the native desktop window.
- [ ] Dance/celebration: hidden `dance` or `celebration` command run in the native desktop window.

## Computer Use Verification Notes

Use Computer Use against the actual desktop, not browser automation against localhost:

- Inspect the macOS desktop with the Tauri app running.
- Interact with the visible companion window using desktop clicks and drag gestures.
- Capture evidence with the desktop window in context.
- Record the command used, the hidden state tested, and the screenshot or video path in the PR body.

## PR Body Text

Use this under the PR's visual evidence section when the change is verification-only:

```md
## Visual evidence

Milestone 009 desktop evidence checklist added at `docs/visual-evidence/milestone-009-checklist.md`.

Desktop Computer Use evidence:
- Native launch command: `pnpm desktop:dev`
- Hidden state command: `scripts/milestone-009-avatar-state dance`
- Captures: `<paths or uploaded screenshots/videos>`

Browser-localhost screenshots are not accepted for Milestone 009 product behavior.
```
