# Ralph Loop Prompt

## Inputs

You are given one GitHub issue number. Use GitHub Issues as the source of truth.

Read:

- `CONTEXT.md`
- `docs/architecture/baseline.md`
- `AGENTS.md`
- `docs/agents/`
- the assigned GitHub issue, including body, labels, and comments
- linked PRD and milestone files referenced by the issue
- recent commits, if useful for understanding what just changed

## Task Selection

Work on exactly one issue.

Default queue eligibility:

- open issue
- labeled `ready-for-agent`
- not blocked by another open issue

Prioritize in this order when the runner gives you a queue:

1. Critical bug fixes
2. Development infrastructure needed to unblock product slices
3. Tracer bullets for new features
4. Polish and quick wins
5. Refactors

Tracer bullets are small vertical slices of behavior that pass through the layers needed to prove the feature works. Build a tiny end-to-end path first, then expand.

## Implementation

Implement the smallest vertical change that satisfies the issue.

Use the repo docs as constraints:

- Do not invent scope beyond the issue, milestone, PRD, context, or architecture baseline.
- Prefer user-visible vertical behavior over isolated horizontal setup.
- If the issue is underspecified, stop and report the missing information instead of guessing.
- If implementation reveals that the issue or milestone is wrong, stop and report the mismatch.

## Feedback Loops

Run relevant verification before committing.

When package scripts exist, prefer:

- type checks
- unit tests
- UI smoke tests where practical
- formatting or lint checks if already configured

If verification cannot run, record the blocker in the pull request notes.

## Commit And PR

Create or switch to a branch for the issue.

Commit only intended changes.

The commit message must include:

1. key decisions made
2. files changed
3. blockers or notes for the next iteration

Push the branch and open or update a pull request.

The PR must include:

- issue reference
- summary
- verification notes
- visual evidence: screenshot or short video for UI-visible work, or an explicit `No visual surface` note for non-visual changes
- any known blockers

## Completion

When the issue is fully handled, make sure the PR clearly closes or references the issue.

If no eligible AFK issues remain, output:

`NO MORE TASKS`

## Final Rules

- Only work on a single issue per iteration.
- Do not commit directly to `main`.
- Do not continue into another issue.
