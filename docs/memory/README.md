# Project Memory

Project memory captures reusable context that should survive across agent runs without becoming hidden agent state.

Use this folder for operational lessons, durable preferences, recurring failure patterns, and source-linked decisions that are useful to future agents. Keep canonical product truth in `CONTEXT.md`, and keep hard-to-reverse architectural decisions in ADRs.

## Rules

- Every memory entry must include `source:` pointing to an issue, PR, ADR, file, or other reviewable artifact.
- Memory is advisory. Agents must verify it against the current code and docs before acting.
- Do not store secrets, credentials, customer data, private personal data, or temporary chat-only guesses.
- Prefer short, specific entries over broad advice.
- Remove or mark entries stale when they stop matching the project.
- Agent-created memory changes should be proposed as normal diffs for human review.
- End every code session with a memory retrospective. Add a source-linked memory entry when the session produced a reusable lesson, failure pattern, decision, or project preference; otherwise state that no durable memory was added.

## Entry Format

```markdown
## <Specific title>

- kind: decision | lesson | failure-pattern | project-preference
- source: <issue, PR, ADR, file path, or doc link>
- confidence: verified | inferred | stale
- created_at: YYYY-MM-DD
- expires_at: optional YYYY-MM-DD or blank

<One or two paragraphs explaining what future agents need to know and when it applies.>
```

## Recall

Before non-trivial planning, implementation, or review, run:

```bash
scripts/memory recall "<task, issue, PR, feature, or keyword>"
```

If the output is relevant, cite it in the PRD, issue, PR body, or review. If it conflicts with code or current docs, prefer the current source of truth and update the stale memory entry.

## Session Retrospective

After implementation, review, debugging, or workflow changes, ask:

- Did this session reveal a repeated failure pattern or operational trap?
- Did the user clarify a durable product preference or quality bar?
- Did we make a source-linked decision future agents should reuse?
- Would a short memory entry prevent another agent from repeating this work?

If yes, add the entry under the most specific memory file as a normal diff. If no, leave memory unchanged and say `No reusable project memory added` in the final response or PR body.
