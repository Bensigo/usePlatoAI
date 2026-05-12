# Architecture Baseline

This document records the initial tooling and architecture baseline for usePlatoAI. It is not an implementation plan; PRDs, milestones, and issues should use this as the default technical direction unless a later decision replaces it.

## Product Frame

- usePlatoAI is a macOS-first desktop companion for builder/operators.
- The product is local-first, open source, and private by default.
- Plato should combine emotional presence with useful software, research, and productivity execution.
- Implementation work should be delivered through GitHub issues, branches, and pull requests.

## Monorepo

- Use `pnpm` workspaces.
- Use Turborepo for task orchestration and package-level workflows.
- Keep application code, shared packages, and product docs in one repository.

Initial repo shape:

```txt
apps/
  desktop/

packages/
  agent-engine/
  capabilities/
  memory/
  voice/
  avatar/
  shared/

docs/
  agents/
  architecture/
  prd/
  milestones/
```

## Desktop App

- Use Tauri for the macOS desktop shell.
- Use Rust/Tauri commands for native integration, permissions, secure storage, and OS-level behavior.
- Use React, Vite, and TypeScript for the desktop UI.
- Use Tailwind and shadcn/ui for settings, task tray, dialogs, forms, and control surfaces.
- Keep the avatar rendering surface custom.

## Local Data

- Use SQLite as the durable local source of truth.
- Use mem0 as the memory intelligence and retrieval layer.
- Use macOS Keychain or OS-backed secret storage for credentials and secrets.
- Use local files for editable `soul.md` and user-approved artifacts.

SQLite should own durable records for:

- settings
- task state
- task summaries
- audit/history
- capability registry
- provider configuration metadata
- memory records/index metadata
- user preferences
- local artifact references

mem0 should support:

- memory extraction
- memory retrieval
- semantic recall
- preference/personality memory behavior
- vector-backed memory search where useful

## Agent Engines

- Use an Agent Engine abstraction instead of hard-wiring the product to one runtime.
- Support Codex SDK and Claude Agent SDK as first-class engine targets.
- User-facing provider selection should choose the compatible default engine automatically.
- Internally, keep Model Provider and Agent Engine separate.

Default mapping:

```txt
OpenAI provider -> Codex SDK
Anthropic/Claude provider -> Claude Agent SDK
Local provider -> local/custom engine or no agent engine until supported
```

Agent-engine-independent concepts:

- tasks
- memory
- permissions
- soul/personality
- capability registry
- approvals
- audit/history

## Capabilities And Skills

- Use a local Capability Registry for skills, MCPs, tools, permissions, and provider adapters.
- Discoverable capabilities require explicit user enablement before use.
- Default skills should ship with the app.
- Users can add custom skills.
- Users can disable default skills.
- Full marketplace-style distribution is future work, not part of the baseline.

## Voice

- Use separate provider adapters for speech-to-text, text-to-speech, and wake-word detection.
- Support both cloud providers and local/open-source voice models.
- Allow STT and TTS to use different providers.
- Treat wake-word detection as its own local-first adapter where possible.
- Surface latency, quality, privacy, and cost tradeoffs in provider settings.

Voice adapter categories:

```txt
STT:
  - OpenAI
  - Deepgram
  - local Whisper
  - Apple Speech
  - future providers

TTS:
  - OpenAI
  - ElevenLabs
  - Piper
  - Kokoro
  - Coqui
  - Apple system voices
  - future providers

Wake word:
  - local-first detector
  - future providers
```

## Avatar

- Use Live2D as the primary avatar runtime.
- Keep product avatar state renderer-independent.
- Map product states to Live2D motions, expressions, eye movement, mouth movement, and idle behavior.
- Leave room for simpler sprite renderers, custom avatars, or future 3D renderers as adapters.

Initial product states:

```txt
idle
listening
thinking
speaking
focused
happy
confused
waiting_for_approval
task_running
sleeping
```

## App State And Runtime

- Use Zustand for reactive frontend/session state.
- Keep durable state in SQLite-backed services.
- Use an event-driven internal architecture for voice, avatar, memory, tasks, approvals, and agent execution.

Example event domains:

```txt
voice.started
voice.transcribed
companion.responding
avatar.state_changed
task.created
task.progressed
task.waiting_for_approval
task.completed
memory.updated
capability.invoked
```

## Browser Automation

- Browser automation is a core capability.
- It must be visible, permissioned, and pausable.
- Submissions, purchases, destructive actions, and sensitive logged-in contexts require approval.
- Browser automation state should be visible through the task tray.

## Testing

- Use Vitest for TypeScript packages.
- Use Playwright for desktop/UI flows where practical.
- Use Rust tests for Tauri/native commands where useful.
- Every pull request must include verification notes.
- Every implementation pull request must include visual evidence: screenshot or short video for UI-visible work, or an explicit `No visual surface` note for non-visual changes.
- Docs-only PRs should still describe the validation performed.

## Docs And Workflow

- Project context lives in `CONTEXT.md`.
- Agent workflow docs live in `docs/agents/`.
- PRDs live in `docs/prd/`.
- Milestones live in `docs/milestones/`.
- Architecture docs live in `docs/architecture/`.
- The delivery flow is project context -> setup-sigo-skills -> PRD -> vertical milestones -> GitHub issues -> branch/PR per issue.
