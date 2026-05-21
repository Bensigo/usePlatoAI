# Milestone 005: Experience Direction And Companion Redesign

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can use the post-Milestone-004 desktop app through a coherent, high-quality product experience where Plato feels intentionally designed, memorable, and alive instead of placeholder-built.

This milestone sets the visual and interaction direction for the product before task tray, agent engine, and capability surfaces expand the UI.

## Users

- Builder Operator
- Non-technical user

## Vertical Scope

This milestone may touch:

- UI: all visible desktop surfaces that exist by the end of Milestone 004, including shell, onboarding/first-run remnants, menu/control surfaces, settings/config, provider/trust status, voice controls, memory, soul, and avatar presence
- Brand/system: visual identity direction, typography, color, spacing, elevation, motion, component states, empty/loading/error states, and interaction rules
- Avatar: original Plato philosopher mascot, bottom-anchored desktop presence, stateful expressions, lightweight animation, and renderer-swappable boundaries
- Audio: startup "coming online" sound, click-to-enable audio path, mute/active status, and non-annoying sound rules
- Domain logic: renderer-independent companion state mapping for visible states and audio activation state
- Tests: state mapping tests, UI smoke tests, accessibility checks where practical
- Docs/config: product experience direction, design tokens, avatar state contract, and visual evidence requirements

## Product Direction

Plato should feel like an original desktop companion inspired by the usefulness and presence of classic assistants like Clippy, not a copy of their visual design.

The character direction is a weird and memorable philosopher mascot with friendly edges: expressive, small enough to live on the desktop, clearly clickable, and visibly responsive to what the app is doing.

The design goal is strong direction, not final polish. The app should stop looking like a prototype with controls placed on screen and start looking like a product with a clear identity and repeatable UI rules.

## Acceptance Criteria

- [ ] All existing visible surfaces from Milestones 001-004 have a coherent visual treatment and no longer look like unstyled placeholders.
- [ ] The app defines reusable design tokens for color, type, spacing, radius, elevation, borders, motion timing, and state colors.
- [ ] Plato renders as an original philosopher mascot anchored near the bottom of the desktop surface.
- [ ] Plato supports visible states for `appearing`, `idle`, `listening`, `thinking`, `speaking`, `waitingApproval`, `muted`, and `error`.
- [ ] Avatar state is driven through a renderer-independent boundary so Live2D or another renderer can replace the first implementation later.
- [ ] First launch or app activation can play a short "coming online" sound without blocking startup.
- [ ] Clicking Plato requests or enables audio through an explicit user-controlled path.
- [ ] The app exposes a clear top Plato navigation/control surface for the existing settings, config, memory, soul, provider/trust, and voice surfaces.
- [ ] Empty, loading, disabled, error, and offline states are designed for every visible surface touched by this milestone.
- [ ] The experience works at the intended desktop window sizes without text overlap, clipped controls, or awkward density.
- [ ] Visual evidence includes screenshots or short video for the main shell, Plato states, top navigation, memory/soul surfaces, config/settings, and audio activation flow.

## Test Plan

- Run TypeScript checks and relevant unit tests.
- Run avatar/companion state mapping tests.
- Run UI smoke tests for the shell, top navigation, memory/soul surfaces, settings/config, and audio activation path where practical.
- Manually verify startup audio behavior, click-to-enable audio, mute/active states, and all required Plato visual states.
- Capture visual evidence for each major surface and state.

## Likely Issue Slices

- Define product experience direction and design tokens
- Redesign desktop shell and top Plato navigation/control surface
- Add original Plato philosopher mascot with first-pass animation states
- Add startup sound and click-to-enable audio path
- Redesign memory, soul, settings/config, provider/trust, and voice-visible surfaces
- Add visual evidence and UI smoke coverage for the redesigned surfaces

## Blocked By

- Milestone 004: Memory And Soul Control

## Notes

Do not require final Live2D assets in this milestone. Use static or lightweight animated assets first, but keep the renderer boundary clean enough that Live2D can replace it later.

Do not design future Milestone 006+ surfaces that do not exist yet. The quality bar applies to the visible product surface available after Milestone 004.
