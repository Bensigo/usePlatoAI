# Milestone 010: Production Voice Companion Loop

## Source PRD

`docs/prd/001-useplatoai-desktop-companion.md`

## Outcome

The builder/operator can talk to Plato through real production voice paths, not
mocks. Plato can listen through explicit activation, transcribe speech, produce
a response, speak back, stop immediately on command, and reflect the voice state
through the avatar with ephemeral near-avatar text.

This milestone upgrades the existing mocked voice scaffolding into a production
voice companion loop. OpenAI Realtime is intentionally deferred to a later issue
inside this milestone and must not block the first usable personal version.

## Users

- Builder Operator
- Non-technical user

## Product Direction

Voice should make Plato feel like a premium desktop companion, not a generic
assistant or toy demo. The default spoken style is polished, composed, concise,
and selectively warm. Plato may use light human cues, but only when they help
the exchange feel alive without becoming theatrical or repetitive.

Spoken replies are adaptive:

- short by default for commands, status, and routine interaction
- longer only for planning, debugging, explanation, or emotionally nuanced
  conversation
- fuller detail belongs in chat, task, or artifact surfaces rather than in long
  spoken monologues

Thinking acknowledgements are contextual. Plato should stay silent for obvious
short requests, but may use a brief acknowledgement when a complex request would
otherwise feel like a dead pause.

## Voice Provider Direction

The first usable production version supports both paid and free/local voice
paths:

- OpenAI non-realtime STT/TTS as the premium remote path.
- Apple local voices as the first free local TTS path on macOS.
- `whisper.cpp` as the first serious local STT path.

Provider boundaries must stay strict. Speech-to-text, text-to-speech, wake-name
detection, interruption, playback, and avatar state mapping are separate
concerns. The app should be able to add OpenAI Realtime later without replacing
the core voice session model.

OpenAI Realtime belongs in a staged later issue for lower-latency speech-to-
speech. It is not required for the first personal usable voice version.

## Vertical Scope

This milestone may touch:

- Avatar package: speaking/listening state hooks, mouth movement cues, voice
  state mapping, interrupt reactions
- Desktop shell: mic permission prompts, explicit activation, hotkey/click
  interrupt, audio playback, near-avatar ephemeral text
- Voice package: production session state machine, STT/TTS provider adapters,
  provider availability, interruption, fallback states
- Native integration: macOS microphone permission, Apple TTS, local process
  execution for `whisper.cpp` where needed
- Provider/auth: OpenAI voice credentials, local model/path settings, provider
  availability and cost/privacy signals
- Data/storage: persisted voice provider choice, selected voice preset,
  unavailable-voice fallback preference, wake-name enabled state
- Tests: state-machine tests, adapter contract tests, permission/fallback tests,
  avatar state mapping tests, provider availability tests
- Evidence: screenshot or short video of the real desktop app voice states and
  interrupt behavior

## Interaction Requirements

- Voice activation is explicit by default. Clicking Plato, pressing a configured
  control, or using a configured hotkey can start listening.
- Passive wake-name listening is off by default.
- Wake-name settings may exist in this milestone, but active wake detection must
  require explicit user enablement.
- The configured wake name is preserved as product language, even when wake
  detection is disabled.
- The UI shows only ephemeral near-avatar transcript and response text for the
  voice slice.
- Persistent voice history is out of scope. Chat logs, task logs, and approved
  artifacts own durable history.
- Low-risk spoken requests may auto-send after speech ends.
- High-risk requests must route through confirmation before external,
  destructive, spending-like, or computer-changing actions.
- Muted mode keeps spoken output off and uses visible text fallback.
- If voice is unavailable, Plato asks once whether to use text fallback for now
  and remembers the user's preference.

## Interruption Requirements

Hard interrupt is part of the product feel.

The first production interrupt path must support click or hotkey stop. When
triggered, Plato stops playback immediately, cancels the active TTS operation
where possible, moves the avatar out of speaking state, and becomes ready to
listen again.

Voice barge-in is a staged later issue in this milestone. When implemented, it
must include a user-visible kill switch because unreliable barge-in is worse
than no barge-in.

## Voice Presets

Onboarding or voice settings should expose a small curated set of voices instead
of dumping provider-specific voice lists into the main UX.

Each voice preset should define:

- provider voice identifier
- product-facing voice name
- constrained speech style instructions
- response length bias
- allowed light human cues
- avatar expression and speaking-state mapping hints

One preset is the Plato default. Advanced provider voice settings can exist
later, but they should not be the primary setup path.

## Acceptance Criteria

- [ ] The production voice path no longer depends on mock timers or mock
      transcript/response behavior.
- [ ] The user can explicitly start a real listening session from the desktop
      app.
- [ ] The app requests and handles microphone permission clearly.
- [ ] Voice state progresses through listening, thinking, speaking, interrupted,
      error/unavailable, and idle without ambiguous UI.
- [ ] OpenAI non-realtime STT/TTS can be configured and used as a real provider
      path.
- [ ] Apple local TTS can be selected and used without OpenAI voice spend.
- [ ] `whisper.cpp` local STT can be configured and used for local
      transcription.
- [ ] Provider selection exposes clear latency, quality, privacy, and cost
      tradeoffs.
- [ ] Muted mode prevents audio playback and shows ephemeral text fallback.
- [ ] Near-avatar ephemeral text shows current transcript, response, or error
      state without creating persistent voice history.
- [ ] Click or hotkey hard interrupt stops speech immediately and returns Plato
      to a ready/listening-capable state.
- [ ] Voice-unavailable fallback asks once and persists the user's preference.
- [ ] Curated voice presets apply provider voice choice and constrained speech
      style.
- [ ] Wake-name settings exist, but passive wake detection is off by default.
- [ ] OpenAI Realtime is represented as a later staged issue, not a blocker for
      the first usable production voice loop.
- [ ] Voice barge-in is represented as a later staged issue with an explicit
      kill switch.
- [ ] Avatar state and mouth movement respond to real voice session state, not
      mock-only state.
- [ ] Desktop verification uses the real Tauri app, not only the browser dev
      server.
- [ ] Visual evidence shows listening, thinking, speaking, muted/fallback,
      unavailable/error, and hard interrupt behavior.

## Test Plan

- Run package-level voice state-machine tests.
- Run STT, TTS, and wake-name adapter contract tests with fake providers.
- Run OpenAI provider tests against mocked network boundaries by default, with a
  documented manual real-provider verification path.
- Run Apple TTS adapter tests where the macOS runtime allows automated coverage.
- Run `whisper.cpp` provider availability and local-path tests without requiring
  bundled model downloads in CI.
- Run avatar state mapping tests for listening, thinking, speaking, muted,
  unavailable/error, and interrupted states.
- Run desktop tests for explicit activation, mute, fallback preference, and
  interrupt controls where practical.
- Manually verify real mic capture, transcription, playback, fallback, and
  interrupt behavior in the Tauri desktop app.
- Capture visual evidence from the real desktop app.

## Likely Issue Slices

- Replace mock voice behavior with a production voice session state machine.
- Add microphone permission, audio capture, explicit activation, and playback.
- Add OpenAI non-realtime STT/TTS provider path.
- Add Apple local TTS provider path.
- Add `whisper.cpp` local STT provider path.
- Add near-avatar ephemeral transcript and spoken-response text.
- Add click/hotkey hard interrupt.
- Add voice-unavailable fallback preference.
- Add curated voice presets and constrained speech style.
- Add wake-name settings with active wake detection disabled by default.
- Add OpenAI Realtime as an optional later provider path.
- Add voice barge-in with an explicit kill switch.
- Add real desktop verification and visual evidence checklist for production
  voice.

## Blocked By

- Milestone 009: Rive Mascot Companion Core

## Non-Goals

- Requiring OpenAI Realtime for the first usable voice version
- Enabling passive wake-name listening by default
- Building a persistent voice transcript or voice-history surface
- Building a broad voice dashboard
- Bundling large local STT/TTS models without explicit packaging decisions
- Letting companion personality override permissions, confirmation, or safety
- Treating mock provider behavior as production verification

## Notes

Milestone 010 owns production voice. The mocked voice path may remain only as a
test fixture or development fallback, clearly separated from production runtime
behavior.

The first personal usable voice version should support both OpenAI non-realtime
voice and the local/free path. OpenAI Realtime and voice barge-in are staged
later issues because they are valuable but should not block the first production
voice loop.
