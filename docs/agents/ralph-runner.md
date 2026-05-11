# Ralph Runner

Use `scripts/ralph-loop` to list ready implementation issues or run them through the Ralph loop.

This repo keeps a Matt Pocock-style `ralph/` folder:

- `ralph/prompt.md` owns the durable agent instructions.
- `ralph/once.sh` runs one Ralph iteration.
- `ralph/afk.sh` runs repeated one-issue iterations until the limit is reached or no ready work remains.

The `ralph/` scripts delegate to `scripts/ralph-loop`, which handles this repo's GitHub Issues queue.

## Commands

List ready issues:

```bash
scripts/ralph-loop list
```

Run one explicit issue:

```bash
scripts/ralph-loop run --issue 7
```

or:

```bash
ralph/once.sh --issue 7
```

Run the next ready issue:

```bash
scripts/ralph-loop run
```

Run several ready issues sequentially:

```bash
scripts/ralph-loop run --limit 3
```

or:

```bash
ralph/afk.sh 3
```

## Queue

The default queue is open GitHub issues labeled `ready-for-agent`.

This is intentional. Running every open issue is too loose because some issues may be blocked, vague, or meant for humans.

## Engines

The default engine is Codex:

```bash
scripts/ralph-loop run --engine codex --issue 7
```

For Claude, provide the command that should receive the Ralph prompt on stdin:

```bash
RALPH_CLAUDE_CMD="claude --print" scripts/ralph-loop run --engine claude --issue 7
```

## Behavior

Before each issue, the runner:

1. Fetches the base branch.
2. Switches to the base branch.
3. Pulls with `--ff-only`.
4. Requires a clean working tree.
5. Starts one Ralph loop iteration for one issue.

Each agent run is responsible for creating a branch, implementing the issue, verifying, committing, pushing, and opening or updating a pull request.
