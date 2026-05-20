# Milestone 005 Visual Evidence Checklist

Use this checklist for Milestone 005 implementation PRs and for the milestone completion PR. The goal is repeatable evidence that the redesigned companion experience still renders coherently across the visible surfaces and required Plato states.

## Automated Smoke Coverage

- [x] Main shell renders with the bottom Plato presence and voice output controls.
- [x] Top Plato navigation renders every control entry with an active state.
- [x] Voice surface renders session state, local voice controls, text fallback, and audio availability.
- [x] Settings surface renders saved companion, launch, memory, authority, and provider settings.
- [x] Config surface renders first-run configuration choices and state treatment.
- [x] Memory surface renders browser status, empty state, edit/delete affordances where records exist, and memory enablement state.
- [x] Soul surface renders the local soul markdown editor and save path.
- [x] Provider/trust surface renders local data, credential, authority, and audit/history sections.
- [x] Plato avatar states render through the non-raster Live2D-compatible surface for `appearing`, `idle`, `listening`, `thinking`, `speaking`, `waitingApproval`, `muted`, and `error`.
- [x] Audio activation UI renders `inactive`, `active`, `muted`, `unavailable`, and `error` states.
- [x] Voice thinking and speaking states render through the app shell for repeatable visual capture.

Automated command:

```bash
pnpm --filter @useplatoai/desktop test -- milestone-005-redesign-smoke
```

## Required Visual Evidence

Capture representative screenshots or a short video for each completed Milestone 005 implementation PR that changes UI-visible behavior:

- [ ] Main shell with bottom-anchored Plato presence.
- [ ] Top Plato navigation/control surface with at least one active entry.
- [ ] Plato states: `appearing`, `idle`, `listening`, `thinking`, `speaking`, `waitingApproval`, `muted`, and `error`.
- [ ] Memory surface.
- [ ] Soul surface.
- [ ] Settings/config surface.
- [ ] Provider/trust surface.
- [ ] Voice surface with audio activation controls.
- [ ] Audio activation flow: activation, muted, unavailable, and error states.

## Manual Audio Verification

Browser and desktop runtimes can differ on Web Audio permission behavior. When a PR touches audio activation, record these manual checks in the PR body:

- [ ] Clicking Plato or the voice start control attempts the coming-online sound only after an explicit user action.
- [ ] Muted mode keeps spoken output off while text fallback stays visible.
- [ ] Missing Web Audio reports `Audio unavailable` without crashing.
- [ ] Playback failure reports `Audio error` and maps the avatar to the error state when the rest of the app is idle.

## PR Body Text

Use this under the PR's visual evidence section when the change is verification-only:

```md
## Visual evidence

No new UI surface. Milestone 005 evidence checklist added at `docs/visual-evidence/milestone-005-checklist.md`.

Completed checklist output:
- Main shell, top navigation, support surfaces, Plato states, and audio activation states are covered by `pnpm --filter @useplatoai/desktop test -- milestone-005-redesign-smoke`.
- Manual audio verification steps are documented in the checklist for runtime Web Audio behavior.
```
