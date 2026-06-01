# AFK Workflow

Use `agentrail afk` when the operator wants AgentRail to keep moving through GitHub issues with isolated workers and automated PR review.

## Command

Run the default workflow:

```bash
agentrail afk
```

This starts up to two workers per wave:

```bash
agentrail afk --concurrency 2
```

Dry-run the queue selection:

```bash
agentrail afk --dry-run
```

## Behavior

The workflow:

1. Picks open issues labeled `afk` plus `review-fix` or `ready-for-agent` that do not already have an open PR.
2. Claims each issue with `afk-in-progress`.
3. Creates one isolated git worktree per worker.
4. Runs `agentrail run issue <number>` in that worktree.
5. Finds the open PR created for the issue.
6. Runs the AgentRail-managed PR review flow in a fresh review context.
7. Converts review findings into `review-fix` issues when the review output includes machine-readable issue drafts.
8. Removes queue labels from the source issue and marks it `pr-reviewed`.
9. Repeats until no queued issues remain or `--max-waves` is reached.

## Parallelism

The default concurrency is `2`.

Do not run parallel Ralph workers in the same checkout. The workflow uses git worktrees because Ralph switches branches and writes files.

Keep concurrency low until the repo has enough independent issues and CI capacity. For milestone 001, use `2`.

## Review Fixes

PR review output must end with:

```text
BEGIN_REVIEW_FIX_ISSUES_JSON
{"fix_issues":[]}
END_REVIEW_FIX_ISSUES_JSON
```

Each object in `fix_issues` becomes a new GitHub issue labeled `review-fix`, `ready-for-agent`, and `afk`, so the next workflow wave can pick it up.

Do not put `afk` on issues that require product judgment, credentials, spending money, external messages, destructive file changes, or any other human approval.
