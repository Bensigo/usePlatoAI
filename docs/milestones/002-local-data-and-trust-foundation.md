# Milestone 002: Local Data And Trust Foundation

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can see that Plato keeps local settings, secrets, memory records, task records, permissions, and audit/history separated, with credentials protected by an OS-backed secret store.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: settings panels for local data, memory status, execution authority, and provider credentials
- Domain logic: local data boundary, execution authority policy, provider auth metadata
- Data/storage: SQLite schema, Keychain/secret-store adapter, audit/history records
- Tests: storage, secret adapter, policy, and settings tests
- Docs/config: data boundary documentation and local dev secret handling

## Acceptance Criteria

- [ ] SQLite stores durable settings, task metadata, memory metadata, capability metadata, audit/history metadata, and provider metadata in separated areas.
- [ ] API keys or credentials are stored through an OS-backed secret store abstraction, not plain app settings.
- [ ] `.env` is documented as developer configuration only, not primary user secret storage.
- [ ] Execution authority settings are persisted and readable by policy code.
- [ ] The app can display current local data categories and memory status to the user.
- [ ] A basic audit/history entry is recorded for a settings or permission change.

## Test Plan

- Run storage unit tests.
- Run secret-store adapter tests with a mocked or local-safe backend where needed.
- Manually verify a credential can be saved, detected, and removed without appearing in plain settings.
- Verify execution authority changes persist across restart.

## Likely Issue Slices

- Add SQLite-backed local data service and schema boundaries
- Add secret-store abstraction for provider credentials
- Add execution authority settings and policy read model
- Add local data/privacy settings UI
- Add audit/history record for settings and permission changes

## Blocked By

- Milestone 001: Desktop Shell And First Run

## Notes

This milestone should not implement full memory intelligence yet. It creates the trustworthy local storage boundary that memory will use.
