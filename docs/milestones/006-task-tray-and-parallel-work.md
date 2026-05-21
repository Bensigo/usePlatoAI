# Milestone 006: Task Tray And Parallel Work

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can start multiple local tasks, see them in the task tray, pause/resume/cancel them, approve a human-in-the-loop prompt, and retain task summaries after completion.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: task tray, task details, approval prompts, notification tiers
- Domain logic: local task model, task status transitions, ambiguity policy, repairability
- Data/storage: SQLite task state, task summaries, audit/history
- Integrations/jobs: mock long-running task runner and approval wait states
- Tests: task state machine, task tray UI, summary retention, approval gating
- Docs/config: task lifecycle

## Acceptance Criteria

- [ ] The user can create or trigger at least two active tasks.
- [ ] The task tray shows task status, progress, failures, approvals, and completion.
- [ ] The user can pause, resume, cancel, and inspect tasks.
- [ ] A task can enter `waiting_for_approval` and continue after user approval.
- [ ] Completed tasks retain a summary and approved artifacts instead of permanent full logs by default.
- [ ] Normal task updates stay quiet by default, while approval-needed prompts are clearly surfaced.
- [ ] Long-running task activity does not block normal companion interaction.

## Test Plan

- Run task state machine tests.
- Run task tray UI tests where practical.
- Manually verify two tasks can exist at once and one approval prompt can be resolved.
- Verify task summary retention after completion.

## Likely Issue Slices

- Add local task model and task state transitions
- Add task tray UI and task detail panel
- Add approval prompt flow near the avatar
- Add notification tier behavior for task events
- Add task summary retention and audit/history records

## Blocked By

- Milestone 002: Local Data And Trust Foundation
- Milestone 003: Voice And Live2D Presence Loop
- Milestone 005: Experience Direction And Companion Redesign

## Notes

Use mock task runners first if real agent engines are not ready. The user-visible task control behavior is the milestone.
