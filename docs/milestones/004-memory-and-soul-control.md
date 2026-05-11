# Milestone 004: Memory And Soul Control

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can customize Plato's soul, store and inspect local memory summaries/preferences, edit or delete memory, disable memory, and see a remembered preference influence a later interaction.

## Users

- Builder Operator
- Non-technical user

## Vertical Scope

This milestone may touch:

- UI: soul editor, memory browser, memory controls, correction flows
- Domain logic: soul loading, memory policy, sensitive-data exclusion, repairability
- Data/storage: local `soul.md`, SQLite memory records, mem0 integration boundary
- Integrations/jobs: mem0 memory extraction/retrieval layer
- Tests: memory CRUD, disable behavior, sensitive-data exclusion, soul-policy boundary
- Docs/config: soul format and memory behavior docs

## Acceptance Criteria

- [ ] Plato loads soul/personality guidance from a local editable markdown file.
- [ ] The desktop app provides a non-technical soul editor.
- [ ] Users can view, edit, delete, and disable memory.
- [ ] Memory stores summaries and preferences, not permanent raw transcripts by default.
- [ ] Sensitive data is excluded from normal memory unless explicitly approved by the user.
- [ ] A user correction can be saved and later reflected in a response or setting.
- [ ] `soul.md` cannot override permissions, execution authority, provider configuration, or memory deletion rules.

## Test Plan

- Run memory service tests.
- Run soul loading and validation tests.
- Run tests proving disabled memory prevents new memory writes.
- Manually verify a saved preference is visible, editable, deletable, and used later.

## Likely Issue Slices

- Add local soul file format and loader
- Add desktop soul editor
- Add memory summary/preference storage and mem0 boundary
- Add memory browser with edit/delete/disable controls
- Add sensitive-data exclusion and correction memory behavior

## Blocked By

- Milestone 002: Local Data And Trust Foundation
- Milestone 003: Voice And Live2D Presence Loop

## Notes

Memory should remain local-first. mem0 is the intelligence/retrieval layer, not the only source of durable user data.
