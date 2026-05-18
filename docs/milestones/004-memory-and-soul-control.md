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

- [x] Plato loads soul/personality guidance from a local editable markdown file.
- [x] The desktop app provides a non-technical soul editor.
- [x] Users can view, edit, delete, and disable memory.
- [x] Memory stores summaries and preferences, not permanent raw transcripts by default.
- [x] Sensitive data is excluded from normal memory unless explicitly approved by the user.
- [x] A user correction can be saved and later reflected in a response or setting.
- [x] `soul.md` cannot override permissions, execution authority, provider configuration, or memory deletion rules.

## Closeout Evidence

Milestone 004 is complete on merged `main` as of the issue #135 closeout pass. No incomplete acceptance criteria were found, so no follow-up implementation issue was created.

Merged PR evidence:

- [PR #81](https://github.com/Bensigo/usePlatoAI/pull/81) loads local `soul.md` guidance with a protected policy boundary.
- [PR #87](https://github.com/Bensigo/usePlatoAI/pull/87) wires local soul guidance into the companion behavior prompt path.
- [PR #99](https://github.com/Bensigo/usePlatoAI/pull/99) adds the non-technical soul editor and save path.
- [PR #84](https://github.com/Bensigo/usePlatoAI/pull/84) adds SQLite-backed memory summaries/preferences and the TypeScript memory boundary.
- [PR #98](https://github.com/Bensigo/usePlatoAI/pull/98) adds memory browser controls for viewing, editing, deleting, and disabling memory.
- [PR #92](https://github.com/Bensigo/usePlatoAI/pull/92) and [PR #97](https://github.com/Bensigo/usePlatoAI/pull/97) harden normal memory writes against raw transcript payloads.
- [PR #132](https://github.com/Bensigo/usePlatoAI/pull/132) consolidates sensitive memory exclusion, trusted approval evidence, and correction-memory prompt behavior.
- [PR #134](https://github.com/Bensigo/usePlatoAI/pull/134) closes the sensitive-memory approval self-minting gap.

Verification evidence from the closeout audit:

```bash
pnpm --filter @useplatoai/desktop test -- tests/memory.test.ts tests/soulGuidance.test.ts tests/app-shell.test.tsx
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml soul
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml memory
```

Additional issue #135 verification confirmed the relevant code and tests are present on `main` in:

- `apps/desktop/src-tauri/src/soul.rs`
- `apps/desktop/src/soulGuidance.ts`
- `apps/desktop/src/memory.ts`
- `apps/desktop/src/voiceInteraction.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/tests/memory.test.ts`
- `apps/desktop/tests/soulGuidance.test.ts`
- `apps/desktop/tests/app-shell.test.tsx`

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
