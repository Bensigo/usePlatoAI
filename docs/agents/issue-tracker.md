# Issue Tracker

Implementation issues for this repo live in GitHub Issues. Pull requests also live in GitHub.

PRDs do not live in GitHub Issues by default. PRDs are local markdown files under `docs/prd/`.

## Repository

- GitHub repo: `Bensigo/usePlatoAI`
- Default branch: `main`
- Use the `gh` CLI for issue and pull request operations.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside the clone.

## Publishing Work

When a skill says "publish to the issue tracker", create a GitHub issue unless the artifact is explicitly a PRD or milestone.

When creating PRDs, write local markdown under `docs/prd/`.

When creating milestones, write local markdown under `docs/milestones/`.

When implementing an issue, create a branch and pull request. Do not commit directly to `main`.
