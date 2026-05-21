# Milestone 008: Capabilities, Skills, And Browser Automation

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can enable capabilities, manage default and custom skills, and run a visible browser automation or skill-backed task with approval gates.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: capability registry UI, skill enable/disable controls, browser automation status
- Domain logic: capability permissions, skill invocation rules, browser action policy
- Data/storage: capability registry, skill settings, browser automation audit/history
- Integrations/jobs: browser automation adapter, default skills registry, custom skill loader
- Tests: capability enablement, skill disablement, browser approval gates
- Docs/config: capability authoring, browser safety rules

## Acceptance Criteria

- [ ] The user can view enabled and available capabilities.
- [ ] The user can enable discovered capabilities before use.
- [ ] The user can disable a default skill.
- [ ] The user can add or register a custom skill in the local capability registry.
- [ ] Browser automation is visible, pausable, and tracked in the task tray.
- [ ] Browser submissions, purchases, destructive actions, and sensitive logged-in contexts require approval.

## Test Plan

- Run capability registry tests.
- Run skill enable/disable tests.
- Run browser automation policy tests with mocked high-impact actions.
- Manually verify browser automation status appears in the task tray and can be paused.

## Likely Issue Slices

- Add capability registry UI and persistence
- Add default skill enable/disable behavior
- Add custom skill registration path
- Add visible browser automation task flow with approval gates

## Blocked By

- Milestone 006: Task Tray And Parallel Work
- Milestone 007: Provider And Agent Engine Harness

## Notes

Ralph loop is repo workflow, not a product capability in this milestone.
