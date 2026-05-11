# Milestone 003: Voice And Live2D Presence Loop

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can interact with Plato through a basic voice loop while the Live2D avatar reflects listening, thinking, speaking, idle, and waiting-for-approval states.

## Users

- Builder Operator

## Vertical Scope

This milestone may touch:

- UI: Live2D avatar surface, text fallback, voice controls, mute/listen status
- Domain logic: renderer-independent avatar states, voice session state, notification tiers
- Integrations/jobs: STT adapter, TTS adapter, wake-word adapter placeholder or local-first path
- Data/storage: persisted voice provider settings and selected companion wake name
- Tests: voice adapter boundary tests, avatar state mapping tests, UI smoke tests
- Docs/config: voice provider configuration and Live2D asset expectations

## Acceptance Criteria

- [ ] Plato renders through a Live2D-first avatar surface or a clearly isolated Live2D-compatible placeholder when final assets are unavailable.
- [ ] Avatar state changes are driven by product states, not hard-coded renderer behavior.
- [ ] The user can start a voice interaction through an explicit activation path.
- [ ] STT and TTS are accessed through separate provider adapter interfaces.
- [ ] The user can mute voice output and use text fallback.
- [ ] The user can interrupt or stop speech output.
- [ ] Voice and avatar states visibly progress through listening, thinking, speaking, and idle.

## Test Plan

- Run avatar state mapping tests.
- Run voice adapter interface tests with mock providers.
- Manually verify one voice or mocked voice interaction updates avatar state and text fallback.
- Verify mute/interrupt controls work.

## Likely Issue Slices

- Add renderer-independent avatar state model
- Add Live2D avatar surface and state mapping
- Add STT/TTS/wake-word adapter interfaces
- Add basic voice session controls and text fallback
- Add mock voice provider for local verification

## Blocked By

- Milestone 001: Desktop Shell And First Run
- Milestone 002: Local Data And Trust Foundation

## Notes

This milestone proves the companion interaction loop. It does not need final character art or every provider.
