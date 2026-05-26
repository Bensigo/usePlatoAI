# Issue 316 Production Desktop Companion Verification

These captures replace placeholder/Rive evidence with native desktop evidence from the production VRoid VRM + Three.js avatar path selected in #317 and implemented in #311. Issue #316 still says Avaturn/GLB in places; #317 explicitly moved the production path to VRoid VRM.

## Commands

- Native launch: `pnpm desktop:dev`
- Hidden wave command: `VITE_PLATO_AVATAR_TEST_COMMAND=wave pnpm desktop:dev`
- Hidden smile command: `VITE_PLATO_AVATAR_TEST_COMMAND=smile pnpm desktop:dev`
- Hidden sad command: `VITE_PLATO_AVATAR_TEST_COMMAND=sad pnpm desktop:dev`
- Hidden talking command: `VITE_PLATO_AVATAR_TEST_COMMAND=talking pnpm desktop:dev`
- Hidden laugh command: `VITE_PLATO_AVATAR_TEST_COMMAND=laugh pnpm desktop:dev`
- Hidden celebration command: `VITE_PLATO_AVATAR_TEST_COMMAND=celebration pnpm desktop:dev`
- Multi-display check: `system_profiler SPDisplaysDataType`
- Native Space/Desktop switch check: `pnpm desktop:dev`, then switch macOS Spaces with Mission Control/Control+Right and confirm the companion remains visible.

## Evidence

| Evidence | File |
| --- | --- |
| Default native desktop launch, bottom-right placement, transparent WebGL framing, always-on-top over ChatGPT | `native-default-bottom-right.png` |
| Click reaction with smile plus real arm/hand wave | `native-click-reaction.png` |
| Draggable mode cue | `native-draggable-mode.png` |
| Moved companion window after draggable repositioning | `native-dragged-position.png` |
| Relaunch showing persisted moved position | `native-persisted-position-relaunch.png` |
| Hidden `wave` command | `hidden-wave.png` |
| Hidden `smile` command | `hidden-smile.png` |
| Hidden `sad` command | `hidden-sad.png` |
| Hidden `talking` command | `hidden-talking.png` |
| Hidden `talking` command mouth-motion sequence | `hidden-talking-frame-1.png`, `hidden-talking-frame-2.png` |
| Hidden `laugh` command | `hidden-laugh.png` |
| Hidden `celebration` command | `hidden-celebration.png` |
| Multi-display runner proof | `multi-display-system-profiler.txt` |
| Companion visible before switching macOS Spaces | `native-spaces-before-switch.png` |
| Companion visible after switching to another Space/Desktop | `native-spaces-after-control-right.png`, `native-spaces-desktop-2.png`, `native-spaces-desktop-2-waited.png` |
| Companion visible again after returning to the first Space/Desktop | `native-spaces-desktop-1-after-switch.png` |
| Mission Control Space strip showing multiple desktops during verification | `native-mission-control-spaces-strip.png` |
| Companion visible on each connected display after window-level reinforcement | `native-spaces-display1-after-window-level.png`, `native-spaces-display2-after-window-level.png` |

## Acceptance Criteria Coverage

| Acceptance criterion | Coverage |
| --- | --- |
| Real Tauri desktop companion window, not localhost/browser rendering | All captures are desktop screenshots taken while running `pnpm desktop:dev` or the hidden Tauri command path. |
| Production avatar defaults bottom-right at small-medium companion size | `native-default-bottom-right.png` shows the production VRM avatar in the native companion window at the bottom-right of the active display. |
| Transparent/no-background WebGL framing | Native captures show the avatar composited over another native app with no boxed canvas, card, Rive artboard, or visible renderer background. |
| Calibrated mouse-following eyes using real VRM controls | Covered by the merged #312 evidence and retained production runtime; this issue reuses the same native production path rather than placeholder overlays. |
| Smile and laugh are visibly different | `hidden-smile.png`, `hidden-laugh.png`, and `native-click-reaction.png` show different mouth/face and gesture combinations. |
| Real hand/arm wave | `hidden-wave.png` and `native-click-reaction.png` show the raised arm/hand gesture. |
| Speaking mouth motion during agent output uses real mouth morph control changes | `hidden-talking-frame-1.png` and `hidden-talking-frame-2.png` capture the native talking loop at different moments; #314 covers the production controller path. |
| Click reaction, draggable mode, drag persistence after restart, always-on-top over another native app | `native-click-reaction.png`, `native-draggable-mode.png`, `native-dragged-position.png`, and `native-persisted-position-relaunch.png`; all captures show the companion above ChatGPT. |
| Hidden command path covers greeting/wave, smile/happy, sad/error, talking, laugh, and celebration | `hidden-wave.png`, `hidden-smile.png`, `hidden-sad.png`, `hidden-talking.png`, `hidden-laugh.png`, and `hidden-celebration.png`. |
| Multi-display behavior verified on a multi-display runner | `multi-display-system-profiler.txt` records the built-in display plus a connected BenQ external display during verification. |
| Companion remains visible when switching macOS Spaces/desktops | `native-spaces-before-switch.png`, `native-spaces-after-control-right.png`, `native-spaces-desktop-2.png`, `native-spaces-desktop-2-waited.png`, and `native-spaces-desktop-1-after-switch.png` capture the companion before, during, and after Space/Desktop changes. |
| Companion remains always-on-top after Space/Desktop or display changes | `native-spaces-display1-after-window-level.png` and `native-spaces-display2-after-window-level.png` capture the companion after reinforcing the window level and all-Spaces behavior. |
