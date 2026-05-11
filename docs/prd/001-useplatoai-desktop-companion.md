# PRD: usePlatoAI Desktop Companion

## Problem Statement

Builder/operators need an AI companion that can stay present on the desktop, understand project and personal work context, help execute software/product and day-to-day productivity tasks, and remain emotionally engaging without becoming a generic chatbot window or unsafe autonomous executor.

Existing AI tools tend to split into two weak shapes:

- chatbots that can talk but do not feel present, remember well, or act naturally on the desktop
- agents that can execute tasks but feel detached, opaque, serial, and easy to lose trust in

usePlatoAI should combine both: Plato feels alive and stays with the user, while also getting useful work done through controlled agentic execution.

## Solution

Build a macOS-first, local-first, open-source desktop companion named Plato.

Plato appears as a floating Live2D anime-style avatar, runs from a Tauri desktop shell, supports voice-first interaction, remembers user preferences and task context locally, manages multiple active tasks, and executes work through provider-backed agent engines and enabled capabilities.

The product trust promise is: private by default, powerful by permission.

Plato should:

- feel like a warm, direct friend/operator
- have strong taste without ego
- use configurable `soul.md` personality guidance
- support user-editable memory
- separate memory, secrets, permissions, tasks, logs, and capability configuration
- use permissioned computer actions
- support Codex SDK and Claude Agent SDK behind an Agent Engine abstraction
- support MCPs, default skills, custom user skills, and disabled default skills
- use GitHub, PRDs, vertical milestones, issues, and pull requests for project work
- eventually support a Ralph loop command for issue execution

## User Stories

1. As a builder/operator, I want Plato to live visibly on my macOS desktop, so that I feel accompanied while working.
2. As a builder/operator, I want Plato to avoid blocking other apps, so that the companion is present without becoming annoying.
3. As a builder/operator, I want a menu bar control surface, so that I can access settings, memory, permissions, providers, tasks, and soul editing.
4. As a builder/operator, I want Plato to use a Live2D anime-style character, so that the companion has expressive visual presence.
5. As a builder/operator, I want Plato to show states like idle, listening, thinking, speaking, focused, task running, and waiting for approval, so that I understand what it is doing.
6. As a builder/operator, I want to rename Plato and configure the wake name, so that the companion feels personal to me.
7. As a builder/operator, I want voice-first interaction, so that I can speak naturally instead of typing everything.
8. As a builder/operator, I want voice interaction to be interruptible, so that I can stop or redirect Plato quickly.
9. As a builder/operator, I want text fallback for voice interactions, so that I can review or use Plato quietly.
10. As a builder/operator, I want wake-word activation using the configured name, so that I can call the companion naturally.
11. As a builder/operator, I want local-first wake-word detection where possible, so that passive listening is privacy-conscious.
12. As a builder/operator, I want to choose STT, TTS, and wake-word providers independently, so that I can balance quality, privacy, latency, and cost.
13. As a builder/operator, I want to use cloud or local/open-source voice models, so that I am not locked into one vendor.
14. As a builder/operator, I want memory to store summaries and preferences locally, so that Plato can maintain continuity without storing raw transcripts forever.
15. As a builder/operator, I want to view, edit, delete, and disable memory, so that I stay in control of what Plato remembers.
16. As a builder/operator, I want sensitive data separated from memory, so that API keys, tokens, passwords, and private data are protected.
17. As a builder/operator, I want secrets stored in OS-backed secure storage, so that credentials are not kept in plain files.
18. As a builder/operator, I want Plato to use `soul.md` for personality and expression, so that I can customize how the companion behaves socially.
19. As a non-technical user, I want to edit the companion soul through the desktop app, so that I do not need to edit markdown manually.
20. As a builder/operator, I want `soul.md` to avoid controlling permissions or safety, so that personality cannot override policy.
21. As a builder/operator, I want Plato to ask before high-impact actions unless I configure broader execution authority, so that I can trust its autonomy.
22. As a builder/operator, I want Plato to think, remember, react, draft, and suggest without constant confirmation, so that low-risk collaboration stays fluid.
23. As a builder/operator, I want execution authority settings, so that I can decide whether Plato asks before changing files, sending messages, deleting data, spending money, or acting externally.
24. As a builder/operator, I want human-in-the-loop prompts near the avatar, so that approvals feel part of the companion interaction.
25. As a builder/operator, I want on-demand screen understanding, so that Plato can inspect screen context when I ask.
26. As a builder/operator, I want continuous screen awareness only as explicit opt-in, so that screen observation is never silent.
27. As a builder/operator, I want visible screen-awareness status and pause controls, so that I know when Plato can observe my screen.
28. As a builder/operator, I want a task tray, so that I can see active tasks, approvals, failures, and progress.
29. As a builder/operator, I want to pause, resume, cancel, and approve tasks, so that I can manage parallel work.
30. As a builder/operator, I want Plato to handle conversation-level multitasking, so that one long task does not block normal interaction.
31. As a builder/operator, I want agent-level parallel execution for complex tasks, so that Plato can split work across subagents or execution lanes.
32. As a builder/operator, I want completed tasks stored as summaries and approved artifacts, so that I keep useful history without permanent full logs by default.
33. As a builder/operator, I want local task state to be the source of truth, so that Plato is not dependent on an external task app.
34. As a builder/operator, I want GitHub, Notion, calendar, or other tools to be adapters later, so that external tools do not define Plato's core task model.
35. As a builder/operator, I want Plato to support coding/project work from idea to PR, so that it can help me build software.
36. As a builder/operator, I want Plato to run the flow from context to PRD to milestones to issues to PRs, so that software work is structured and reviewable.
37. As a builder/operator, I want each implementation issue delivered through its own branch and PR, so that changes stay reviewable.
38. As a builder/operator, I want PRs to include verification notes, so that I can see what was checked.
39. As a builder/operator, I want vertical milestones, so that every milestone produces a testable companion behavior instead of isolated infrastructure.
40. As a builder/operator, I want Ralph loop support for implementation issues, so that agents can run fresh-context issue execution loops once the repo has strong issues and tests.
41. As a builder/operator, I want Codex SDK support, so that OpenAI-backed agent execution can be used where available.
42. As a builder/operator, I want Claude Agent SDK support, so that Claude-backed agent execution can be used where available.
43. As a builder/operator, I want model provider selection to automatically choose a compatible Agent Engine, so that setup is simple.
44. As a power user, I want Model Provider and Agent Engine kept separate internally, so that the product can support future engines.
45. As a builder/operator, I want explicit provider auth setup, so that API keys, local SDK auth, subscription-backed auth, and local models are not confused.
46. As a builder/operator, I want provider cost awareness, so that I understand token or API spend risk before expensive tasks.
47. As a builder/operator, I want local/open-source model options, so that I can reduce cost and improve privacy where practical.
48. As a builder/operator, I want capabilities to be explicitly enabled, so that Plato cannot silently use discovered tools.
49. As a builder/operator, I want a capability registry, so that skills, MCPs, tools, permissions, and providers are tracked.
50. As a builder/operator, I want default skills to ship with the app, so that Plato is useful immediately.
51. As a builder/operator, I want to add custom skills, so that Plato can adapt to my workflows.
52. As a builder/operator, I want to disable default skills, so that I stay in control of behavior.
53. As a builder/operator, I want browser automation as a core capability, so that Plato can research, inspect, summarize, fill forms, and assist with web workflows.
54. As a builder/operator, I want browser automation to be visible and pausable, so that I can supervise sensitive web actions.
55. As a builder/operator, I want submissions, purchases, destructive browser actions, and sensitive logged-in contexts approval-gated, so that Plato does not act dangerously.
56. As a builder/operator, I want Plato to support file and app actions, so that it can help with day-to-day local productivity.
57. As a builder/operator, I want Plato to draft communication before sending, so that I can approve messages before they leave my machine.
58. As a builder/operator, I want focus-aware behavior, so that Plato does not interrupt me constantly.
59. As a builder/operator, I want quiet and snooze modes, so that I can reduce companion activity during focused work.
60. As a builder/operator, I want notifications tiered by urgency, so that normal updates stay quiet and approval prompts are clear.
61. As a builder/operator, I want Plato to admit mistakes, explain what happened, repair when possible, and remember corrections, so that I can trust improvement over time.
62. As a builder/operator, I want ambiguous high-impact actions to trigger one sharp clarifying question, so that Plato does not guess before changing external state.
63. As a builder/operator, I want low-risk thinking or drafting to proceed with stated assumptions, so that collaboration does not stall.
64. As a builder/operator, I want Plato to challenge weak plans, so that it has taste and improves outcomes.
65. As a builder/operator, I want emotional state to affect expression and interaction style, so that Plato feels alive.
66. As a builder/operator, I want emotional state not to affect truthfulness, permissions, or task correctness, so that expression does not compromise reliability.
67. As a builder/operator, I want long-term emotional evolution based on editable memory and preferences, so that Plato adapts without random personality drift.
68. As a builder/operator, I want launch-at-login as the default onboarding option, so that Plato can become a persistent companion.
69. As a builder/operator, I want manual-only launch as an option, so that persistence remains a choice.
70. As a builder/operator, I want onboarding to collect only core setup choices, so that I can start safely without a huge wizard.
71. As a builder/operator, I want the product to be open source, so that it is inspectable and community-extensible.
72. As a builder/operator, I want local-first behavior, so that memory, settings, tasks, soul, and secrets remain on my system unless I opt into sync later.
73. As a builder/operator, I want optional encrypted cloud sync later, so that multi-device continuity can exist without becoming the default.
74. As a builder/operator, I want internet-backed provider features to degrade clearly when unavailable, so that local ownership is not confused with offline intelligence.
75. As a builder/operator, I want Plato's first product impression to be presence plus useful action, so that it feels alive and gets work done.

## Implementation Decisions

- The repo will use the existing project source-of-truth docs: `CONTEXT.md`, `docs/architecture/baseline.md`, and `docs/agents/`.
- PRDs are local markdown files under `docs/prd/`.
- Milestones are local markdown files under `docs/milestones/`.
- GitHub is used for implementation issues and pull requests.
- The product targets macOS first.
- The desktop shell is Tauri.
- The desktop UI uses React, Vite, TypeScript, Tailwind, and shadcn/ui for controls.
- Native integration uses Rust/Tauri commands.
- The monorepo uses pnpm workspaces and Turborepo.
- SQLite is the durable local source of truth.
- mem0 is the memory intelligence and retrieval layer.
- macOS Keychain or OS-backed secret storage protects credentials and sensitive values.
- Local editable markdown backs soul/persona customization.
- The avatar runtime is Live2D-first.
- Product avatar states stay renderer-independent so future renderers can be added.
- Voice uses separate STT, TTS, and wake-word provider adapters.
- Voice providers can be cloud or local/open-source.
- Wake-word detection should be local-first where possible.
- A local task model is the source of truth for active, paused, completed, failed, and approval-waiting tasks.
- A task tray exposes task visibility and control.
- Completed tasks retain summaries and user-approved artifacts instead of permanent full logs by default.
- Capabilities are tracked through a capability registry.
- Skills, MCPs, tools, providers, and adapters are all capabilities.
- Capabilities can be discovered, but use requires explicit user enablement.
- Default skills ship with the app, user skills can be added, and default skills can be disabled.
- Agent execution uses an Agent Engine abstraction.
- Codex SDK and Claude Agent SDK are first-class engine targets.
- Provider selection defaults the compatible Agent Engine while internals keep Model Provider and Agent Engine separate.
- Provider auth distinguishes API keys, local SDK auth, subscription-backed local auth, and local model endpoints.
- Browser automation is core, visible, permissioned, pausable, and approval-gated for high-impact web actions.
- Screen understanding is on-demand by default.
- Continuous screen awareness is an explicit opt-in advanced mode with visible status and pause controls.
- Execution authority is configurable.
- The companion can think, remember, speak, react, draft, and suggest without confirmation.
- External or computer-changing actions follow execution authority and approval rules.
- The product uses an event-driven internal runtime for voice, avatar, memory, tasks, approvals, capabilities, and agent execution.
- Zustand manages reactive frontend/session state.
- Durable state belongs in SQLite-backed services.
- The Ralph loop is the implementation issue execution workflow, but the runnable command is deferred until the monorepo and engine scripts exist.

Major modules to build over time:

- Desktop shell and native integration module
- Floating presence and menu bar control module
- Live2D avatar state module
- Voice pipeline module
- Provider/auth module
- Local data and secret storage module
- Memory module
- Soul/persona module
- Task runtime and task tray module
- Execution authority and policy module
- Capability registry and skills module
- Agent engine module
- Browser automation module
- Screen understanding module
- Notification and focus-awareness module
- Ralph loop command module

## Testing Decisions

- Tests should verify external behavior and user-visible outcomes rather than implementation details.
- TypeScript packages should use Vitest.
- Desktop/UI flows should use Playwright where practical.
- Tauri/native commands should use Rust tests where useful.
- Every PR should include verification notes.
- Docs-only PRs should still describe the validation performed.
- The PRD should be broken into vertical milestones before implementation issues are created.
- Each vertical milestone should define a demoable or verifiable product outcome.
- For memory behavior, tests should cover storage, retrieval, editing, deletion, disabling, and sensitive-data exclusion.
- For execution authority, tests should cover approval requirements for file changes, external actions, browser submissions, destructive actions, and spending-like flows.
- For task handling, tests should cover multiple active tasks, task status transitions, pause/resume/cancel, approvals, failure states, and task summaries.
- For agent engines, tests should cover provider-to-engine selection, engine-independent task concepts, and auth-state handling.
- For capability registry behavior, tests should cover discovery, enablement, disablement, permission checks, and skill invocation rules.
- For voice, tests should cover STT/TTS/wake adapter boundaries rather than one vendor implementation.
- For avatar behavior, tests should cover product state transitions and renderer-independent mappings.

## Out of Scope

- Building the application implementation in this PRD.
- Creating vertical milestones.
- Creating GitHub implementation issues.
- Adding the runnable Ralph loop command.
- Implementing the monorepo scaffold.
- Implementing Live2D assets or final character art.
- Implementing cloud sync.
- Building a marketplace for skills or plugins.
- Supporting Windows or Linux before macOS-first behavior is proven.
- Enterprise/team administration features.
- Continuous screen awareness as a default behavior.
- Fully autonomous AFK execution before human-in-the-loop workflows, milestones, tests, and permissions are strong.

## Further Notes

- This PRD intentionally captures the broad product vision. `to-milestones` should turn it into smaller vertical, testable product increments before issues are created.
- The first milestones should avoid horizontal slices like database-only, backend-only, or frontend-only work.
- The product quality bar is that Plato must feel alive and get useful work done.
- The companion must not become a chatbot window with an avatar sticker, a surveillance tool, a silent autonomous executor, a toy that cannot do real work, a generic assistant with no personality, a cloud-sync dependency, a manipulative emotional dependency system, or a token-wasting task bot.
