# Domain Docs

How engineering skills should consume this repo's domain and architecture documentation.

## Layout

This is a single-context repo.

Read these before product, planning, or implementation work:

- `CONTEXT.md` at the repo root for product language, principles, boundaries, and decisions.
- `docs/architecture/baseline.md` for the initial tooling and architecture baseline.
- `docs/architecture/` for later architecture notes.
- `docs/adr/` if ADRs are added later.

If any optional docs do not exist, proceed silently. Do not create ADRs or extra context docs unless a real decision needs them.

## Use The Glossary

When output names a domain concept, use the terms defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is missing from `CONTEXT.md`, either reconsider whether the concept belongs or flag it for a future `grill-with-docs` pass.

## Architecture Baseline

Use `docs/architecture/baseline.md` as the default technical direction for PRDs, milestones, and issues unless a later accepted decision replaces it.

## Flag Conflicts

If output contradicts `CONTEXT.md`, the architecture baseline, or a future ADR, surface the conflict explicitly instead of silently overriding it.
