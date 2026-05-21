# Milestone 007: Provider And Agent Engine Harness

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can configure a model provider, see the compatible Agent Engine selected automatically, run a simple engine-backed task, and see the result tracked through the local task tray with verification and cost-awareness signals.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: provider settings, auth status, engine selection, cost warnings, task launch
- Domain logic: Model Provider vs Agent Engine separation, provider-to-engine mapping, provider auth state
- Data/storage: provider metadata, secret references, task records, audit/history
- Integrations/jobs: Codex SDK adapter, Claude Agent SDK adapter, local/no-engine fallback
- Tests: provider selection, engine mapping, auth state, task integration
- Docs/config: provider setup and engine behavior

## Acceptance Criteria

- [ ] Provider setup distinguishes API keys, local SDK auth, subscription-backed local auth, and local model endpoints.
- [ ] OpenAI provider defaults to Codex SDK where available.
- [ ] Anthropic/Claude provider defaults to Claude Agent SDK where available.
- [ ] Local provider does not pretend agent-engine support exists until implemented.
- [ ] The app can run a simple engine-backed task or mocked engine task through the task tray.
- [ ] Provider credentials are stored through the secret-store abstraction.
- [ ] The UI surfaces provider availability and cost-awareness warnings where relevant.
- [ ] Agent-engine task concepts remain independent of the selected engine.

## Test Plan

- Run provider-to-engine mapping tests.
- Run auth-state and secret-reference tests.
- Run task integration tests with mocked engines.
- Manually verify provider selection updates engine availability and can start a task.

## Likely Issue Slices

- Add Model Provider and Agent Engine domain interfaces
- Add provider auth status and secret references
- Add Codex SDK adapter boundary
- Add Claude Agent SDK adapter boundary
- Add provider settings UI with cost-awareness signals
- Run one mocked or real engine-backed task through the task tray

## Blocked By

- Milestone 002: Local Data And Trust Foundation
- Milestone 006: Task Tray And Parallel Work

## Notes

The goal is harness integration, not full autonomous coding. Keep tasks small and observable.
