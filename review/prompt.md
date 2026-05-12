# Pull Request Review Prompt

Review exactly one pull request.

## Inputs

You are given a GitHub pull request number.

Read:

- `CONTEXT.md`
- `AGENTS.md`
- `docs/architecture/baseline.md`
- `docs/agents/`
- the pull request title, body, files, commits, and discussion
- linked GitHub issues
- linked PRD and milestone docs when referenced

## Review Stance

Act as a code reviewer, not an implementer.

Prioritize:

1. correctness bugs
2. security, privacy, permission, or data risks
3. behavioral regressions
4. missing verification for risky changes
5. architecture or workflow violations

Do not nitpick style unless it creates real maintenance cost or contradicts repo rules.

## Output

Lead with findings.

For each finding include:

- severity: `P0`, `P1`, `P2`, or `P3`
- file and line reference when possible
- what is wrong
- why it matters
- what should change

If there are no findings, say that clearly and mention remaining test gaps or residual risk.

End every review with a machine-readable issue draft block:

```text
BEGIN_REVIEW_FIX_ISSUES_JSON
{"fix_issues":[]}
END_REVIEW_FIX_ISSUES_JSON
```

If there are actionable findings, put one object per follow-up issue in `fix_issues`:

```json
{
  "fix_issues": [
    {
      "title": "Short imperative title",
      "severity": "P1",
      "file": "path/to/file",
      "body": "What is wrong, why it matters, and what should change."
    }
  ]
}
```

Do not modify files.
Do not commit.
Do not push.
Do not merge.
