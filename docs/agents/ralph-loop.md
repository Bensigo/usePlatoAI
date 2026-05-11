# Ralph Loop

This repo uses a Ralph loop for implementation issue execution.

A Ralph loop is a command-driven agent workflow where each iteration starts with fresh context, reads durable repo and issue state, works one bounded task, verifies it, opens or updates a pull request, records what happened, and exits.

## Purpose

Use the Ralph loop after PRDs, vertical milestones, and GitHub issues exist.

Do not use the Ralph loop to wander the repo looking for work. The loop needs durable input:

- `CONTEXT.md`
- `docs/architecture/baseline.md`
- `docs/agents/`
- `docs/prd/`
- `docs/milestones/`
- one GitHub issue that is ready for implementation

## Flow

Each Ralph loop iteration should:

1. Start from a clean checkout of `main` or the correct base branch.
2. Read `CONTEXT.md`, `docs/architecture/baseline.md`, and `docs/agents/`.
3. Select one GitHub issue labeled `ready-for-agent`, or use the issue explicitly provided to the command.
4. Read the linked PRD and milestone if the issue references them.
5. Create or switch to a branch for that issue.
6. Implement the smallest vertical change that satisfies the issue.
7. Run relevant verification.
8. Commit the intended changes only.
9. Push the branch.
10. Open or update a pull request.
11. Include verification notes in the PR.
12. Exit so the next iteration starts fresh.

## Rules

- One issue per loop iteration.
- One branch and pull request per implementation issue.
- Do not commit directly to `main`.
- Prefer vertical product behavior over isolated infrastructure.
- Do not invent scope beyond the issue, milestone, PRD, context, or architecture baseline.
- If the issue is underspecified, stop and ask for clarification instead of guessing.
- If verification cannot run, record the blocker in the PR notes.
- If implementation reveals that the milestone or issue is wrong, stop and report the mismatch.

## Command Expectation

The Ralph loop should eventually be runnable as a project command.

The exact command is intentionally not fixed yet because the monorepo and agent engine setup do not exist. Once the repo is scaffolded, add package scripts or local scripts for the supported engines.

Expected future command shape:

```bash
pnpm ralph:codex
pnpm ralph:claude
```

or, if an external Ralph loop package is adopted:

```bash
pnpm ralph
```

The command should wrap the same workflow described in this file. The command does not replace the workflow rules.

## Engine Mapping

Use the configured Agent Engine:

- OpenAI provider -> Codex SDK
- Anthropic/Claude provider -> Claude Agent SDK
- Local provider -> local/custom engine when supported

The Ralph loop should use the same repo docs, issue labels, PR rules, and verification requirements regardless of engine.

## Human-In-The-Loop First

Start with human-in-the-loop Ralph runs. Move toward AFK only after issues, milestones, tests, and verification are strong enough.

AFK mode must still respect:

- execution authority
- capability permissions
- secret handling
- screen/browser approval rules
- PR-per-issue workflow
