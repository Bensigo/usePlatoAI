# Milestone 001: Desktop Shell And First Run

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can launch the macOS app, see Plato as a floating desktop presence, access the menu bar control surface, complete a short first-run setup, and verify that the chosen settings persist.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: Tauri desktop app, floating presence placeholder, menu bar control surface, first-run setup
- Domain logic: onboarding choices, launch behavior, companion name/wake name
- Data/storage: local settings persistence
- Tests: UI smoke tests, settings persistence tests
- Docs/config: monorepo scaffold, development commands, setup notes

## Acceptance Criteria

- [ ] The app can be launched locally on macOS through the documented development command.
- [ ] Plato appears as a draggable or dismissible floating presence without blocking the whole desktop.
- [ ] The menu bar control surface exposes entries for settings, tasks, memory, permissions, providers, and soul editing, even if some panels are placeholders.
- [ ] First-run setup captures companion name, wake name, launch behavior, memory mode, execution authority mode, and provider placeholder choice.
- [ ] First-run settings persist across app restart.
- [ ] The app clearly distinguishes launch-at-login from manual-only mode.

## Test Plan

- Run TypeScript checks and relevant unit tests.
- Run the app locally and complete first-run setup manually.
- Verify settings persist after restart.
- Add a UI smoke test where practical.

## Local Launch And Verification

Use this path to verify milestone 001 without relying on conversation context.
This milestone proves the launchable macOS desktop shell, floating presence
placeholder, menu bar control surface, first-run setup, and persisted settings.
It does not complete Live2D, voice, memory intelligence, provider execution, or
agent execution.

### Prerequisites

- macOS.
- Node.js with `pnpm` available. The repo declares `pnpm@9.15.0`.
- Rust and the Tauri macOS prerequisites installed locally.

### Setup

Install workspace dependencies from the repo root:

```bash
pnpm install
```

If you need to repeat first-run setup from a blank state, remove the local
settings file before launching:

```bash
rm -f "$HOME/Library/Application Support/com.useplatoai.desktop/companion-settings.v1.json"
```

### Development Launch

Launch the macOS desktop shell from the repo root:

```bash
pnpm desktop:dev
```

This runs `pnpm --filter @useplatoai/desktop tauri dev`. Tauri starts the
Vite-powered React UI at `http://127.0.0.1:1420` and opens the native
`usePlatoAI` desktop window.

### Manual Verification

1. Launch the app with `pnpm desktop:dev`.
2. Confirm the first-run setup screen appears when no saved settings exist.
3. Fill in companion name, wake name, launch behavior, memory mode, execution
   authority, and provider placeholder.
4. Save setup.
5. Confirm the floating Plato presence appears as an always-on-top desktop
   window with the saved companion name and wake name.
6. Drag the floating presence by its handle and confirm it can be moved.
7. Hide the presence with the `x` control, then restore it with `Show Plato
   presence`.
8. Open the macOS menu bar/tray control surface labeled `Plato`.
9. Confirm menu entries exist for Settings, Tasks, Memory, Permissions,
   Providers, and Soul editing.
10. Select each menu entry and confirm the app window focuses and shows the
    matching panel. Placeholder panels are expected for features outside this
    milestone.
11. Quit the app.
12. Launch again with `pnpm desktop:dev`.
13. Confirm first-run setup is skipped and the saved settings still appear in
    the presence and Settings panel.
14. Optionally inspect the persisted local settings file:

```bash
cat "$HOME/Library/Application Support/com.useplatoai.desktop/companion-settings.v1.json"
```

### Automated Checks

Run the available repo checks from the repo root:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For this milestone, the desktop Vitest suite covers the floating presence,
restore path, menu bar control surface entries, first-run onboarding choices,
and settings-store persistence. A full native UI smoke test is still manual in
milestone 001.

## Likely Issue Slices

- Scaffold pnpm/Turborepo and Tauri React desktop app
- Add floating presence placeholder and menu bar control surface
- Add first-run setup flow and settings persistence
- Add local development, verification, and app launch docs

## Blocked By

None.

## Notes

Use a placeholder avatar surface here. Live2D integration belongs in a later milestone.
