# PR Review Runner

Use `agentrail prompt review <number>` to generate a pull request review prompt. AgentRail-managed review scripts are internals for AFK/review automation and should only be called directly when debugging AgentRail itself.

## Commands

Generate a review prompt:

```bash
agentrail prompt review 15
```

Write the prompt to a file for automation:

```bash
agentrail prompt review 15 > .afk-workflow/pr-15-review-prompt.md
```

## Behavior

The review flow:

1. Reads PR metadata from GitHub.
2. Fetches the PR base and head branches.
3. Checks out the PR head branch.
4. Runs the configured review agent with the generated review prompt.
5. Writes review output for AFK follow-up issue creation when used through AgentRail automation.

The review agent must not edit files, commit, push, close, or merge anything.

## Purpose

Keep implementation and review in separate context windows:

- `agentrail run issue` runs one implementation issue.
- AgentRail review automation reviews one pull request.
- AFK workflow consumes the review's machine-readable fix issue block.
- This chat remains the operator/control room.
