# Milestones

Milestones live in `docs/milestones/` and use `NNN-short-slug.md` naming.

Workflow:

1. Create or read a PRD from `docs/prd/`.
2. Run `to-milestones` to create vertical, testable product milestones.
3. Run `to-issues` on one milestone at a time.
4. Implement each issue on its own branch and pull request.

Rules:

- A milestone must produce a demoable or verifiable product outcome.
- A milestone may touch UI, API, domain logic, data, integrations, tests, docs, and config as needed.
- Do not create horizontal milestones such as database-only, backend-only, or frontend-only phases.
- Prefer small milestones that leave the product in a coherent state.
- Each milestone should make Plato more testable as a desktop companion, not merely add isolated infrastructure.
