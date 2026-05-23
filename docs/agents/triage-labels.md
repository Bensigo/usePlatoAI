# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub issue tracker.

| Label in skills | Label in GitHub | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions a role, use the corresponding GitHub label from this table.

Additional workflow state labels:

| Label | Meaning |
| --- | --- |
| `afk` | Issue is approved for unattended AFK execution |
| `afk-in-progress` | Issue is currently claimed by an AFK worker |
| `review-fix` | Follow-up issue created from PR review feedback |
| `pr-reviewed` | Implementation issue has completed automated PR review |

Use labels as state, not decoration. Remove stale state labels when an issue leaves that state.

## Blocked Issues

Do not apply `ready-for-agent` while an issue has open blockers in its `## Blocked by` section.

Blocked issues may carry `afk` before they are ready when the unattended safety judgment has already been made. After a blocking PR merges and all blockers are closed, `scripts/promote-unblocked-issues --pr <number>` adds `ready-for-agent` without adding or removing `afk`.
