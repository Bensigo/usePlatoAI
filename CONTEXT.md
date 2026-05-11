# usePlatoAI

usePlatoAI is a macOS-first desktop AI companion with persistent avatar presence, voice interaction, memory, parallel task handling, and controlled computer actions. The product should feel like an ambient companion with emotional continuity, not a chatbot window, corporate assistant, or gimmick.

## Product Direction

- Build toward a living desktop companion: visible, voice-native, emotionally expressive, memory-aware, and useful.
- Design first for a builder/operator who wants an emotionally present desktop companion that can execute serious software/product work and everyday productivity tasks.
- Follow the trust promise: private by default, powerful by permission.
- Build a companion with strong taste and judgment, not ego or blind compliance.
- Use a warm, direct friend/operator communication style by default.
- Handle mistakes by admitting, explaining, repairing, and remembering user corrections.
- Resolve ambiguous high-impact actions with one sharp clarifying question; proceed on low-risk thinking or drafting with stated assumptions.
- Provider setup must explicitly distinguish API keys, local SDK authentication, subscription-based authentication, and local model configuration.
- Start with a product-owned default companion identity, while allowing users to customize the companion's soul/persona over time.
- Store companion soul/persona locally in editable markdown, with a desktop app editor for non-technical users.
- Use a floating avatar as the main desktop presence, backed by a macOS menu bar app for controls.
- Use on-demand screen understanding by default, with continuous screen awareness only as an explicit opt-in advanced mode.
- Provide a lightweight task tray so users can see and control active parallel work.
- Keep the local task model as the canonical source of truth for companion tasks.
- Store completed tasks as summaries and user-approved artifacts, not full logs forever by default.
- Support broad computer actions over time, including app/window, file, browser, communication, coding/project, and system actions.
- Support an extensible capability ecosystem through MCP connections, skills, and plugin-like adapters.
- Discoverable capabilities require explicit user enablement before use.
- Build the product as a desktop companion harness around Codex-style and Claude-style agent SDK capabilities rather than a from-scratch agent runtime.
- Focus on macOS first before expanding to other desktop platforms.
- Use Tauri as the desktop shell unless a hard blocker proves it wrong.
- Support pluggable AI providers over time, including API-key providers and local models.
- Treat subscription-backed providers as possible future integrations only when an official supported auth/API path exists.
- Use local storage for user preferences, memory, settings, and provider credentials unless a specific feature needs cloud sync.
- Store memory as summaries and preferences by default, not permanent raw transcripts.
- Let users view, edit, delete, and disable memory.
- Protect sensitive data with OS-backed secret storage where possible and encryption for local persisted data.
- Design for parallel task handling so long-running tasks do not block normal interaction.
- Let users configure how much execution authority the companion has.
- Create a PR for every implementation step; no direct work should land on `main`.
- Every implementation issue should use its own branch and pull request with verification notes.
- Milestones should be vertical, user-testable companion behaviors rather than technical layers.
- Emotional state should affect expression and interaction style, not truthfulness, permissions, or task correctness.
- Support both short-term mood and long-term emotional evolution, with long-term adaptation based on user-editable memory and preferences rather than random drift.
- Voice should be first-class, interruptible, and supported by text fallback.
- Wake-word activation should use the companion name, such as "Hey Plato", with the name configurable by the user.
- Ask about launch behavior during onboarding; default to launch-at-login while allowing manual-only mode.
- Onboarding should be a short guided setup for companion name, provider/auth, voice, memory, permissions, and launch behavior, with advanced settings available later.
- Start as single-user local-first, with optional encrypted cloud sync only as a later feature.
- Position the product as a developer/operator companion with consumer-like emotional UX, not an enterprise assistant.
- Use Plato as the default companion name, while allowing users to rename it during onboarding.
- The core wow moment is that Plato feels alive and actually gets useful work done.
- Respect user focus with quiet/snooze modes, non-intrusive updates, and low-interruption presence.
- Notifications should be tiered by urgency, with normal updates quiet by default and approval prompts clearly surfaced.
- Local data categories should be separated so config, secrets, memory, tasks, soul, capabilities, permissions, and logs do not blur together.
- Browser automation is a core capability, but it must be visible, permissioned, and approval-gated for high-impact actions.
- Coding/project work should support the full loop from idea to PR and review fixes.
- Default skills should ship with the app, while users can add custom skills and disable default skills.
- Plato expects internet access for provider-backed intelligence and connected capabilities, while local memory, tasks, settings, soul, and other local data remain within the user's system.
- The product is open source.
- Provider and task UX should help users control cost through warnings, local model options, and estimates where possible.
- GitHub is the default issue tracker and pull request home for this repo.
- Project agent docs live in `docs/agents/`, PRDs live in `docs/prd/`, and milestones live in `docs/milestones/`.
- Use the workflow: project context -> grill -> setup-sigo-skills -> PRD -> milestones -> issues -> branch/PR per issue.

## Language

**Desktop Companion**:
An always-available AI presence that lives on the user's desktop and can interact through voice, avatar behavior, memory, and actions.
_Avoid_: Chatbot, corporate assistant, agent window

**Avatar**:
The visible desktop representation of the Desktop Companion.
_Avoid_: Bot icon, mascot-only UI

**Expressive Character**:
The default 2D anime-style character form of the Avatar, with visual states that reflect what the companion is doing or feeling.
_Avoid_: Static profile image

**Companion Identity**:
The product-owned default character, personality, and relationship baseline for the Desktop Companion.
_Avoid_: Personality with no product baseline

**Plato**:
The default companion name and wake name for the product-owned companion identity.
_Avoid_: Hard-coded name that users cannot change

**Relationship Style**:
The companion's intended social posture toward the user.
_Avoid_: Pure utility assistant or manipulative simulated intimacy

**Communication Style**:
The default way the companion speaks and writes to the user.
_Avoid_: Corporate assistant voice or constant anime affect

**Builder Operator**:
The first target user: someone who builds software or runs complex work and wants both companion presence and serious agentic execution.
_Avoid_: Generic consumer as the first product center

**Productivity Task**:
A day-to-day computer task such as creating files, organizing the laptop, sending email, researching, or managing routine work.
_Avoid_: Unbounded computer control with no user intent

**Trust Promise**:
The product commitment that sensitive context stays controlled by the user and powerful actions require explicit permission or configured authority.
_Avoid_: Silent surveillance or silent execution

**Taste**:
The companion's ability to make opinionated, context-aware judgments about quality, clarity, usefulness, and whether a requested path is weak.
_Avoid_: Blind compliance

**Repairability**:
The ability for users to inspect, correct, undo where possible, and teach the companion after mistakes.
_Avoid_: Opaque failure

**Ambiguity Policy**:
The rule for deciding whether to ask a clarifying question or proceed with assumptions.
_Avoid_: Guessing before high-impact actions

**Emotional State**:
The companion's current expressive state used to shape voice, avatar reactions, and interaction tone.
_Avoid_: Sentiment score

**Emotional Evolution**:
The companion's long-term adaptation in tone, familiarity, and expressive habits based on user-editable memory and preferences.
_Avoid_: Random personality drift

**Memory**:
Persisted information about conversations, preferences, and user context that can influence future interactions.
_Avoid_: Chat history only

**Sensitive Data**:
Secrets or private information that would harm the user if exposed, including API keys, passwords, payment data, private messages, and confidential personal details.
_Avoid_: Normal memory

**Computer Action**:
A user-authorized operation the companion performs on the local computer.
_Avoid_: Unbounded automation

**Capability**:
A tool, skill, MCP server, provider, or adapter that extends what the companion can do.
_Avoid_: Hard-coded action set

**Capability Registry**:
The local catalog of enabled capabilities, their permissions, configuration, and availability.
_Avoid_: Untracked tool access

**Skill**:
A packaged capability or behavior instruction that Plato can invoke for a specific kind of work.
_Avoid_: Hard-coded behavior that users cannot inspect or disable

**Browser Automation**:
The capability for Plato to navigate, inspect, research, summarize, fill forms, and act in browsers or web pages.
_Avoid_: Invisible logged-in web action

**Agent Harness**:
The orchestration layer that connects the companion experience to agent execution, skills, MCPs, tools, permissions, and task state.
_Avoid_: Rebuilding the entire agent runtime from scratch

**Agent Engine**:
A selectable execution backend that runs coding, tool, file, browser, or workflow tasks through a supported SDK/runtime.
_Avoid_: Hard-wiring the product to one agent provider

**Execution Authority**:
The configured permission level that controls whether the companion can perform external or computer-changing actions automatically or must ask first.
_Avoid_: One fixed autonomy mode

**Parallel Task Handling**:
The ability for the companion to keep track of more than one active user task without blocking the whole interaction on a single long-running task.
_Avoid_: One-chat-at-a-time task queue

**Agent-Level Parallel Execution**:
The ability to break complex work into subtasks that can run through separate workers, agents, tools, or execution lanes.
_Avoid_: Single serial agent loop for complex workflows

**Activation**:
The explicit user gesture that starts a live voice interaction with the companion.
_Avoid_: Treating wake word as the only valid activation path

**Wake Name**:
The user-configured name used in wake-word activation, such as "Plato" in "Hey Plato".
_Avoid_: Hard-coded assistant name

**Voice Interaction**:
The speech input and speech output loop for communicating with the companion.
_Avoid_: Chat-only interaction

**Launch Behavior**:
Whether the companion starts automatically at login or only when manually opened.
_Avoid_: Hidden startup behavior

**Onboarding**:
The first-run setup flow that establishes the user's companion name, provider/auth, voice, memory, permissions, and launch behavior.
_Avoid_: Overloaded setup wizard

**Local-First Mode**:
The default product mode where memory, settings, task state, soul, and secrets live on the user's machine unless the user opts into sync.
_Avoid_: Cloud account required

**Product Positioning**:
The market and usage frame for usePlatoAI.
_Avoid_: Generic consumer toy or enterprise assistant

**Open Source Product**:
The product distribution model where the source code is public and community-extensible.
_Avoid_: Closed proprietary baseline

**Wow Moment**:
The first strong product impression that makes the companion feel both alive and useful.
_Avoid_: Avatar charm without real capability

**Focus Awareness**:
The companion's ability to reduce interruptions when the user is busy, focused, or in quiet mode.
_Avoid_: Constant attention-seeking

**Notification Tier**:
The urgency level that determines how Plato surfaces updates, approvals, failures, and interruptions.
_Avoid_: Treating every update as equally interruptive

**Floating Presence**:
The companion's always-visible desktop layer that stays available while avoiding obstruction of the user's work.
_Avoid_: Blocking overlay

**Menu Bar Control Surface**:
The macOS menu bar entry used for settings, memory, permissions, providers, soul editing, and task controls.
_Avoid_: Making the avatar carry every control

**Human-in-the-Loop Prompt**:
A lightweight prompt that asks the user to approve, reject, or modify an action before execution continues.
_Avoid_: Silent external action

**Screen Understanding**:
The companion's ability to inspect the current screen or selected app/window when the user asks for visual context.
_Avoid_: Silent screen watching

**Continuous Screen Awareness**:
An advanced mode where the companion can observe screen context over time after explicit opt-in.
_Avoid_: Background surveillance

**Task Tray**:
The lightweight user-facing panel that shows active tasks, statuses, approvals, failures, and controls.
_Avoid_: Hidden background task execution

**Local Task Model**:
The app-owned representation of active, paused, completed, failed, and approval-waiting tasks.
_Avoid_: External task app as source of truth

**Task Summary**:
A concise retained record of a completed task's goal, outcome, decisions, artifacts, and user approval state.
_Avoid_: Permanent full execution log by default

**Desktop Shell**:
The native application container that owns windowing, always-on-top behavior, permissions, and local integration.
_Avoid_: Browser app

**Model Provider**:
The configured AI backend used for reasoning, speech, or generation.
_Avoid_: Hard-coded AI service

**Soul**:
The companion's durable personality source, stored as product-authored guidance such as `soul.md`.
_Avoid_: Random prompt vibes

**Soul Editor**:
The desktop app experience for editing the companion's Soul without requiring the user to edit markdown manually.
_Avoid_: Technical-only customization

**Provider Adapter**:
A replaceable integration layer for a model, speech, automation, or memory backend.
_Avoid_: Provider-specific product architecture

**Secret Store**:
The protected storage layer used for credentials and other sensitive values.
_Avoid_: Plain `.env` as user-secret storage

**Local Data Boundary**:
The separation between local config, secrets, memory, tasks, soul, capability registry, permissions, and audit/history.
_Avoid_: One mixed local data bucket

**Provider Auth**:
The authentication method used by a Model Provider or Agent Engine, such as API key, local SDK login, subscription-backed local auth, or local model endpoint.
_Avoid_: Treating all provider access as the same

**Cost Awareness**:
The product behavior that helps users understand and control provider/API/task costs.
_Avoid_: Invisible token or provider spend

**Internet Dependency**:
The boundary between features that need network/provider access and local features that remain available or stored on the user's system.
_Avoid_: Cloud-first data dependency

**Policy**:
The non-personality rules that govern permissions, safety, storage, tool access, and execution authority.
_Avoid_: Putting security decisions in `soul.md`

**Implementation Step**:
A bounded piece of implementation work that should happen on its own branch and be reviewed through a pull request.
_Avoid_: Direct-to-main change

**Pull Request Step**:
An implementation issue delivered through its own branch, pull request, and verification notes.
_Avoid_: Local-only completion

**Vertical Milestone**:
A product milestone that delivers a user-testable companion behavior across the necessary UI, agent, memory, permission, provider, and verification layers.
_Avoid_: Horizontal milestones such as database first, backend first, or frontend first

## Relationships

- A **Desktop Companion** is represented by one active **Avatar**.
- The default **Avatar** form is a 2D anime-style **Expressive Character**.
- The first **Companion Identity** is product-owned, with user-customizable soul/persona support planned as part of the product direction.
- The default **Companion Identity** is named **Plato**, and users can rename it.
- The intended **Relationship Style** is friend plus assistant: emotionally present and useful without pretending to be human.
- The default **Communication Style** is warm, direct, concise friend/operator.
- The first target user is the **Builder Operator**.
- The core job is helping the **Builder Operator** execute software/product work and **Productivity Task** work while staying emotionally present.
- The **Trust Promise** is private by default, powerful by permission.
- **Emotional State** shapes avatar expression, voice tone, and interaction style; it must not change truthfulness, permissions, policy, or task correctness.
- **Emotional Evolution** should come from inspectable, editable memory and preferences, not unpredictable mood drift.
- The companion should have strong **Taste** without ego: challenge weak plans, ask when underspecified, avoid low-quality task execution, and still respect safe user preferences.
- **Repairability** means the companion should admit mistakes, explain what happened, offer repair paths, remember corrections when appropriate, and expose undo or inspection where possible.
- The **Ambiguity Policy** is to ask one sharp clarifying question if an action could affect files, messages, money, settings, or external systems; for low-risk drafting or thinking, proceed with stated assumptions.
- The first target platform is macOS.
- The preferred **Desktop Shell** is Tauri.
- The companion uses **Floating Presence** as its main desktop presence.
- The companion uses a **Menu Bar Control Surface** for settings, memory, permissions, providers, soul editing, and tasks.
- The **Floating Presence** should avoid blocking other apps and should remain draggable or dismissible.
- An **Avatar** expresses the current **Emotional State**.
- **Soul** shapes the companion's durable personality across sessions.
- **Soul** controls personality, expression, and user-customized persona, not permissions or safety.
- **Soul** should be locally editable as markdown and editable through a **Soul Editor** in the desktop app.
- **Policy** controls permissions, tool access, memory deletion rules, provider configuration, and external action authority.
- **Memory** informs future **Emotional State**, responses, and task behavior, and should be summary-based by default.
- Users must be able to view, edit, delete, and disable **Memory**.
- **Sensitive Data** should not be treated as normal **Memory**.
- The macOS **Secret Store** should use OS-backed storage where possible, such as Keychain, with encryption for local persisted data that cannot live there.
- **Local Data Boundary** keeps config, secrets, memory, tasks, soul, capability registry, permissions, and audit/history separate.
- A **Computer Action** must be bounded by user intent and local permission.
- **Computer Action** should eventually cover app/window actions, file actions, browser actions, communication actions, coding/project actions, and system actions.
- **Browser Automation** is core, but must be enabled, visible, pausable, and approval-gated for submissions, purchases, destructive actions, or sensitive logged-in contexts.
- A **Capability** can come from built-in tools, local skills, MCP connections, or plugin-like adapters.
- A **Skill** can ship by default or be added by the user.
- Users can disable default **Skills**.
- A **Capability Registry** tracks enabled capabilities, configuration, and permissions.
- The companion may discover available **Capabilities**, but it must not use them until the user explicitly enables them.
- The **Agent Harness** should build on Codex-style and Claude-style SDK/runtime capabilities where possible instead of duplicating them.
- **Agent Engine** should be selected from available supported engines such as Codex SDK or Claude Agent SDK based on user configuration, provider availability, model choice, and authentication state.
- Model/provider choice should influence the selected **Agent Engine**, but product concepts such as tasks, memory, permissions, soul, and capability registry should remain engine-independent.
- The user-facing provider setting should default the compatible **Agent Engine** automatically, while internals keep **Model Provider** and **Agent Engine** separate.
- **Provider Auth** should be explicit in the UI: API keys, local SDK auth, subscription-backed local auth, and local model endpoints must not be presented as interchangeable.
- The companion can think, remember, speak, react, draft, and suggest without confirmation.
- **Execution Authority** determines whether the companion must ask before making changes, sending messages, deleting files, spending money, or doing anything external.
- A **Human-in-the-Loop Prompt** should appear near the avatar when user handoff, confirmation, or correction is needed.
- **Screen Understanding** is on-demand by default.
- **Continuous Screen Awareness** requires explicit permission, visible status, and pause controls.
- **Parallel Task Handling** keeps multiple task threads available while voice interaction remains responsive.
- **Agent-Level Parallel Execution** supports complex workflows that need subagents or separate execution lanes.
- The product should support both conversation-level multitasking and **Agent-Level Parallel Execution** over time.
- The **Task Tray** lets users see, pause, resume, cancel, and approve parallel tasks.
- The **Local Task Model** is the source of truth for companion tasks; external task tools should be adapters or sync targets.
- Completed tasks should retain a **Task Summary** and user-approved artifacts, not full logs forever by default.
- Coding/project work should cover idea capture, grilling/context, PRD creation, vertical milestones, issues, branches, implementation, tests/checks, PR creation, and review/CI fixes.
- **Activation** can include push-to-talk, hotkey, click/hold, or wake word.
- Wake-word activation should use the configurable **Wake Name**.
- **Voice Interaction** should be voice-first, interruptible, support text fallback, and expose user-controlled mute/listen states.
- **Launch Behavior** is chosen during onboarding, with launch-at-login as the default and manual-only mode available.
- **Onboarding** should collect only the core choices needed to start safely, leaving advanced settings for later.
- **Local-First Mode** is the default; encrypted cloud sync can be added later as an opt-in feature.
- **Product Positioning** is developer/operator companion first, with consumer-like emotional UX and no enterprise focus initially.
- usePlatoAI is an **Open Source Product**.
- **Internet Dependency** applies to provider-backed intelligence and connected capabilities, not to local ownership of memory, tasks, settings, soul, or secrets.
- **Cost Awareness** should surface provider cost risk, local model options, and per-task estimates where possible.
- The **Wow Moment** is presence plus useful action: Plato feels alive and gets work done.
- **Focus Awareness** means Plato can stay visible while batching updates, waiting in the task tray, snoozing itself, or reducing voice/visual interruption.
- **Notification Tier** should distinguish ambient updates, normal updates, approval-needed prompts, and urgent interruptions.
- **Model Provider** support should be pluggable through **Provider Adapter** boundaries.
- Every **Implementation Step** should produce a pull request.
- A **Pull Request Step** is not done until the branch, pull request, and verification notes exist.
- A **Vertical Milestone** must produce a testable companion behavior, not a standalone technical layer.
- GitHub is the default issue tracker and pull request home.
- Agent workflow docs should use `docs/agents/`; PRDs should use `docs/prd/`; milestones should use `docs/milestones/`.

## Example dialogue

> **Dev:** "Should the first version be cross-platform?"
> **Domain expert:** "No. The MVP is macOS-first so desktop overlay, microphone, audio, memory, and local actions can become usable before we generalize."

> **Dev:** "Should we plan one fixed AI backend?"
> **Domain expert:** "No. The product should support multiple providers over time, including API-key services and local models, without tying the whole architecture to one vendor."

## Flagged ambiguities

- "Avatar" may mean visual presence only, while "Desktop Companion" means the full product behavior: voice, memory, emotional continuity, and actions.
- "Use my subscription" is not equivalent to "use my API key"; OpenAI ChatGPT/Codex subscription billing and OpenAI API billing are separate according to OpenAI help docs.
- "MVP" decisions should not replace the full project vision; PRD and milestones should derive scoped steps from the broader product context.
- "Autonomous" must be separated from "ambient"; ambient behavior is allowed freely, while external action depends on **Execution Authority**.
- `.env` is acceptable for developer/local configuration but should not be the primary user-secret store in the desktop app.
- `soul.md` must not become a security or permissions file; it should shape how the companion expresses itself, not what it is allowed to do.
- The product must not become a chatbot window with an avatar sticker, a surveillance tool, a silent autonomous executor, a toy that cannot do real work, a generic assistant with no personality, a cloud-sync dependency, a manipulative emotional dependency system, or a token-wasting task bot.
