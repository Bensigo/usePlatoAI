# PR Review Runner

Use `scripts/review-pr` or `review/pr.sh` to run pull request review in a fresh agent context window.

## Commands

Review a pull request:

```bash
review/pr.sh 15
```

or:

```bash
scripts/review-pr --pr 15
```

## Behavior

The runner:

1. Requires a clean working tree.
2. Reads PR metadata from GitHub.
3. Fetches the PR base and head branches.
4. Checks out the PR head branch.
5. Runs `codex exec review --base <base>` with `review/prompt.md`.

The review agent must not edit files, commit, push, close, or merge anything.

## Purpose

Keep implementation and review in separate context windows:

- Ralph loop runs one implementation issue.
- PR review runner reviews one pull request.
- This chat remains the operator/control room.
