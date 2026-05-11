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

## Likely Issue Slices

- Scaffold pnpm/Turborepo and Tauri React desktop app
- Add floating presence placeholder and menu bar control surface
- Add first-run setup flow and settings persistence
- Add local development, verification, and app launch docs

## Blocked By

None.

## Notes

Use a placeholder avatar surface here. Live2D integration belongs in a later milestone.
