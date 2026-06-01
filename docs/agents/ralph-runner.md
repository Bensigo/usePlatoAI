# Ralph Runner

Use `agentrail run` or `agentrail run issue <number>` to run implementation issues through the Ralph loop.

Ralph is AgentRail's internal one-issue executor. Installed projects should call the AgentRail CLI, not the raw workflow scripts, unless a maintainer is debugging AgentRail itself.

## Commands

Run one explicit issue:

```bash
agentrail run issue 7
```

Run the next ready issue:

```bash
agentrail run
```

Run the unattended queue/worktree loop:

```bash
agentrail afk --concurrency 2
```

Use AFK when the operator wants the full loop, including PR review and review-fix issue creation.

## Queue

The default AgentRail run queue is open GitHub issues labeled `afk` and `ready-for-agent`, excluding `afk-in-progress`.

This is intentional. Running every open issue is too loose because some issues may be blocked, vague, or meant for humans.

## Engines

The default runner is configured in `.agentrail/config.json`. To override the agent for one run:

```bash
agentrail run issue 7 --agent codex
```

For a custom command, provide the command that should receive the generated prompt:

```bash
agentrail run issue 7 --command "codex exec -"
```

## Behavior

Before each issue, AgentRail reads `.agentrail/state.json`, writes durable run metadata under `.agentrail/runs/`, invokes the configured runner, and keeps enough state to resume or diagnose interrupted work.

Each agent run is responsible for creating a branch, implementing the issue, verifying, committing, pushing, and opening or updating a pull request.
