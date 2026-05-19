import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  App,
  AudioActivationStatus,
  CenteredChatPanel,
  ConfigPanel,
  ControlSurfacePanel,
  DismissedPresence,
  FirstRunOnboarding,
  MemoryBrowserPanel,
  PresenceListeningBubble,
  SoulEditorPanel,
  VoiceInteractionPanel,
  currentTaskPresenceStateForAction,
  isActiveCorrectionPromptTransition,
  isActionableCurrentTaskState,
  renderedPresenceStateFor,
  shouldShowCenteredChatPanelOpener,
} from "../src/App";
import {
  audioActivationSnapshotForState,
  audioActivationStateFrom,
  audioActivationStateLabel,
  canStartVoiceInteractionWithAudio,
  createAudioActivationSnapshot,
  markAudioActivationResult,
  playComingOnlineSound,
  setAudioActivationMuted,
} from "../src/audioActivation";
import {
  Live2DAvatarSurface,
  avatarPresenceStateFrom,
  avatarPresenceStates,
  getLive2DAvatarSurfaceHook,
  isAvatarPresenceState,
  type AvatarPresenceState,
} from "../src/avatarSurface";
import { controlSurfaceEntries } from "../src/controlSurface";
import {
  createMemoryStore,
  createSensitiveMemoryApprovalRecord,
  rememberApprovedSensitiveMemory,
  rememberExtractedMemory,
  retrieveUserCorrections,
  saveUserCorrectionMemory,
} from "../src/memory";
import {
  createMemoryPresenceStateSource,
  normalizePresenceState,
  presenceStateSnapshot,
} from "../src/presenceState";
import {
  type CompanionSettings,
  createMemorySettingsStore,
  defaultCompanionSettings,
  defaultExecutionAuthorityPolicy,
  decisionForActionImpact,
} from "../src/settings";
import {
  createVoiceOutputSession,
  mockVoiceResponse,
  setVoiceOutputMuted,
  startMockSpeech,
  stopMockSpeech,
} from "../src/voiceOutput";
import {
  createMemorySoulGuidanceStore,
  fallbackSoulGuidance,
  type SoulGuidanceStore,
} from "../src/soulGuidance";
import {
  companionPresenceForVoiceState,
  companionPromptForInputWithCorrections,
  companionPromptForInput,
  defaultVoiceInteractionSnapshot,
  nextMockVoiceSnapshot,
  presenceLabelForState,
  textFallbackResponseSnapshot,
  textFallbackThinkingSnapshot,
  voiceSessionStateFrom,
} from "../src/voiceInteraction";
import {
  componentStateRules,
  experienceTokenCss,
  experienceTokens,
} from "../src/experienceTokens";

const completedSettings: CompanionSettings = {
  ...defaultCompanionSettings,
  onboardingComplete: true,
};

describe("desktop app shell", () => {
  it("renders a companion-only default desktop presence with collapsed controls", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("Wake name: Plato");
    expect(markup).toContain("Idle presence");
    expect(markup).toContain("data-live2d-motion-group=\"idle\"");
    expect(markup).toContain("data-live2d-expression=\"neutral\"");
    expect(markup).toContain("Activate audio with Plato");
    expect(markup).toContain("Open Plato controls");
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
    expect(markup).not.toContain("Top Plato control surface");
    expect(markup).not.toContain("Voice output controls");
    expect(markup).not.toContain("Audio waits for activation");
    expect(markup).not.toContain("No passive listening.");
    expect(markup).not.toContain("Voice ready");
    expect(markup).not.toContain("Mute");
    expect(markup).not.toContain("Stop speech");
    expect(markup).not.toContain("Plato is hidden");
  });

  it("renders the expanded Plato controls when the compact opener is active", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(markup).toContain('aria-label="Top Plato control surface"');
    expect(markup).toContain("Collapse Plato controls");
    expect(markup).toContain("Voice output controls");
    expect(markup).toContain("Audio waits for activation");
    expect(markup).toContain("No passive listening.");
    expect(markup).toContain("Voice ready");
    expect(markup).toContain("Mute");
    expect(markup).toContain("Stop speech");
  });

  it("injects reusable experience tokens into the visible shell", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("data-plato-experience-tokens=\"true\"");
    expect(markup).toContain("--plato-color-companion: #0f766e");
    expect(markup).toContain(experienceTokens.stateColor.listening);
  });

  it("keeps component state rules explicit for future surfaces", () => {
    expect(Object.keys(componentStateRules).sort()).toEqual([
      "active",
      "disabled",
      "empty",
      "error",
      "hover",
      "loading",
      "offline",
    ]);
    expect(componentStateRules.error).toContain("repair-oriented");
  });

  it("consumes experience tokens from shell CSS rather than leaving them unused", () => {
    const css = readFileSync(
      resolve(__dirname, "../src/styles.css"),
      "utf8",
    );

    expect(experienceTokenCss).toContain("--plato-motion-waiting-approval");
    expect(css).toContain("var(--plato-color-companion)");
    expect(css).toContain("var(--plato-state-listening)");
    expect(css).toContain("var(--plato-elevation-avatar)");
  });

  it("maps renderer-independent presence states to Live2D surface hooks", () => {
    expect(avatarPresenceStates).toEqual([
      "appearing",
      "idle",
      "listening",
      "thinking",
      "speaking",
      "waitingApproval",
      "muted",
      "error",
    ]);

    const expectedMappings: Array<{
      state: AvatarPresenceState;
      statusText: string;
      motionGroup: string;
      expression: string;
    }> = [
      {
        state: "appearing",
        statusText: "Coming online",
        motionGroup: "appear",
        expression: "bright",
      },
      {
        state: "idle",
        statusText: "Idle presence",
        motionGroup: "idle",
        expression: "neutral",
      },
      {
        state: "listening",
        statusText: "Listening now",
        motionGroup: "tap_body",
        expression: "attentive",
      },
      {
        state: "thinking",
        statusText: "Thinking through it",
        motionGroup: "thinking",
        expression: "focused",
      },
      {
        state: "speaking",
        statusText: "Speaking",
        motionGroup: "speak",
        expression: "talking",
      },
      {
        state: "waitingApproval",
        statusText: "Waiting for approval",
        motionGroup: "approval",
        expression: "concerned",
      },
      {
        state: "muted",
        statusText: "Muted",
        motionGroup: "quiet",
        expression: "soft",
      },
      {
        state: "error",
        statusText: "Needs repair",
        motionGroup: "error",
        expression: "strained",
      },
    ];

    for (const mapping of expectedMappings) {
      const hook = getLive2DAvatarSurfaceHook(mapping.state);
      const markup = renderToStaticMarkup(
        <Live2DAvatarSurface presenceState={mapping.state} />,
      );

      expect(hook.statusText).toBe(mapping.statusText);
      expect(hook.assetSrc).toBe(`/avatar/plato/${mapping.state}.png`);
      expect(hook.motionGroup).toBe(mapping.motionGroup);
      expect(hook.expression).toBe(mapping.expression);
      expect(markup).toContain(`data-presence-state="${mapping.state}"`);
      expect(markup).toContain(`src="/avatar/plato/${mapping.state}.png"`);
      expect(markup).toContain(
        `data-live2d-motion-group="${mapping.motionGroup}"`,
      );
      expect(markup).toContain(
        `data-live2d-expression="${mapping.expression}"`,
      );
      expect(markup).toContain(
        `data-avatar-asset="/avatar/plato/${mapping.state}.png"`,
      );
      expect(markup).toContain("plato-avatar-asset");
      expect(markup).toContain(mapping.statusText);
      expect(markup).not.toContain("live2d-avatar-head");
      expect(markup).not.toContain("live2d-avatar-body");
    }
  });

  it("renders the visible avatar with generated state assets instead of CSS face/body parts", () => {
    const markup = renderToStaticMarkup(
      <Live2DAvatarSurface presenceState="listening" />,
    );

    expect(markup).toContain("plato-avatar-asset");
    expect(markup).toContain("/avatar/plato/listening.png");
    expect(markup).toContain('data-avatar-asset="/avatar/plato/listening.png"');
    expect(markup).not.toContain("live2d-avatar-hair");
    expect(markup).not.toContain("live2d-avatar-head");
    expect(markup).not.toContain("live2d-avatar-eye");
    expect(markup).not.toContain("live2d-avatar-mouth");
    expect(markup).not.toContain("live2d-avatar-body");
  });

  it("renders the floating presence from an injected presence state", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waitingApproval"
      />,
    );

    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain('data-presence-state="waitingApproval"');
    expect(markup).toContain('data-live2d-motion-group="approval"');
    expect(markup).toContain('data-live2d-expression="concerned"');
  });

  it("recognizes valid URL presence states for visual smoke checks", () => {
    expect(isAvatarPresenceState("appearing")).toBe(true);
    expect(isAvatarPresenceState("speaking")).toBe(true);
    expect(isAvatarPresenceState("waitingApproval")).toBe(true);
    expect(isAvatarPresenceState("muted")).toBe(true);
    expect(isAvatarPresenceState("error")).toBe(true);
    expect(isAvatarPresenceState("unknown")).toBe(false);
    expect(isAvatarPresenceState(null)).toBe(false);
    expect(avatarPresenceStateFrom("waiting_for_approval")).toBe(
      "waitingApproval",
    );
    expect(avatarPresenceStateFrom("unknown")).toBeUndefined();
  });

  it("renders Plato with a direct clickable audio affordance", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("Activate audio with Plato");
    expect(markup).toContain("avatar-action");
  });

  it("renders presence state through the shared source boundary", () => {
    const presenceStateSource = createMemoryPresenceStateSource("listening");
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        presenceStateSource={presenceStateSource}
      />,
    );

    expect(markup).toContain("Listening");
    expect(markup).toContain('data-presence-state="listening"');
    expect(markup).toContain('data-live2d-motion-group="tap_body"');
    expect(markup).toContain('data-live2d-expression="attentive"');
  });

  it("does not let passive mute hide active product presence states", () => {
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "waiting_for_approval",
      }),
    ).toBe("waiting_for_approval");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "task_running",
      }),
    ).toBe("task_running");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("muted");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "speaking",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "waiting_for_approval",
      }),
    ).toBe("speaking");
  });

  it("maps explicit audio activation errors into avatar error presence", () => {
    expect(
      renderedPresenceStateFor({
        audioActivationState: "error",
        voiceOutputPresenceState: "idle",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("error");
  });

  it("falls back to idle presence for invalid state input", () => {
    expect(normalizePresenceState("renderer-owned-state")).toBe("idle");
    expect(presenceStateSnapshot("renderer-owned-state")).toEqual({
      state: "idle",
      label: "Idle presence",
      rendererHint: "resting",
    });
  });

  it("maps milestone presence states to renderer-independent labels", () => {
    expect(presenceStateSnapshot("idle").label).toBe("Idle presence");
    expect(presenceStateSnapshot("listening").label).toBe("Listening");
    expect(presenceStateSnapshot("thinking").label).toBe("Thinking");
    expect(presenceStateSnapshot("speaking").label).toBe("Speaking");
    expect(presenceStateSnapshot("waiting_for_approval").label).toBe(
      "Waiting for approval",
    );
    expect(presenceStateSnapshot("task_running").label).toBe("Task running");
    expect(presenceStateSnapshot("task_paused").label).toBe("Task paused");
  });

  it("renders a restore path for the dismissed presence state", () => {
    const markup = renderToStaticMarkup(
      <DismissedPresence onRestore={() => undefined} />,
    );

    expect(markup).toContain("Plato presence hidden");
    expect(markup).toContain("Plato is hidden");
    expect(markup).toContain("Show Plato presence");
  });

  it("renders the expanded top Plato control entries", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(controlSurfaceEntries.map((entry) => entry.id)).toEqual([
      "voice",
      "settings",
      "config",
      "memory",
      "soul",
      "trust",
    ]);

    for (const entry of controlSurfaceEntries) {
      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.state);
    }

    expect(markup).toContain("Top Plato control surface");
    expect(markup).toContain("Bottom Plato presence area");
    expect(markup).toContain(controlSurfaceEntries[0].description);
    expect(markup).toContain("Start listening");
    expect(markup).not.toContain("Tasks");
  });

  it("renders explicit voice controls and text fallback without credentials", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(markup).toContain("Voice surface states");
    expect(markup).toContain("Local voice");
    expect(markup).toContain("configured");
    expect(markup).toContain("Cloud voice");
    expect(markup).toContain("missing");
    expect(markup).toContain("unavailable until enabled");
    expect(markup).toContain("Start listening");
    expect(markup).toContain("Mute voice output");
    expect(markup).toContain("Muted");
    expect(markup).toContain("Active");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Error");
    expect(markup).toContain("Text fallback");
    expect(markup).toContain("Ready for voice or text.");
    expect(markup).not.toContain("OpenAI credential");
  });

  it("renders audio activation states as explicit UI states", () => {
    const activeSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      { ok: true },
    );
    const unavailableSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      {
        ok: false,
        state: "unavailable",
        message: "This runtime does not expose Web Audio.",
      },
    );
    const errorSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      {
        ok: false,
        state: "error",
        message: "Audio activation failed before playback.",
      },
    );

    expect(
      renderToStaticMarkup(
        <AudioActivationStatus
          audioActivation={setAudioActivationMuted(activeSnapshot, true)}
        />,
      ),
    ).toContain('data-audio-activation-state="muted"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={activeSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="active"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={unavailableSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="unavailable"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={errorSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="error"');
    expect(audioActivationStateLabel("inactive")).toBe("Inactive");
    expect(audioActivationStateFrom("active")).toBe("active");
    expect(audioActivationStateFrom("offline")).toBeUndefined();
    expect(audioActivationSnapshotForState("error").state).toBe("error");
    expect(canStartVoiceInteractionWithAudio(activeSnapshot)).toBe(true);
    expect(canStartVoiceInteractionWithAudio(unavailableSnapshot)).toBe(false);
    expect(canStartVoiceInteractionWithAudio(errorSnapshot)).toBe(false);
  });

  it("routes the visible voice start control through audio activation", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(source).toContain("function activateVoiceListening()");
    expect(source).toContain("onStartVoiceInteraction={activateVoiceListening}");
    expect(source).toContain("canStartVoiceInteractionWithAudio(nextSnapshot)");
    expect(source).not.toContain("onStartVoiceInteraction={startVoiceInteraction}");
    expect(source).not.toContain("startupSoundAttempted");
  });

  it("can render initial audio state for visual smoke captures", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="unavailable"
        initialControlsExpanded
      />,
    );

    expect(markup).toContain('data-audio-activation-state="unavailable"');
    expect(markup).toContain("Audio unavailable");
  });

  it("reports unavailable startup audio without throwing when Web Audio is missing", async () => {
    await expect(
      playComingOnlineSound({ AudioContextConstructor: undefined }),
    ).resolves.toEqual({
      ok: false,
      state: "unavailable",
      message: "This runtime does not expose Web Audio.",
    });
  });

  it("can open a specific top control for visual smoke captures", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialActiveEntry="config"
        initialControlsExpanded
      />,
    );

    expect(markup).toContain("Local config");
    expect(markup).toContain("Local configuration status");
    expect(markup).toContain('data-control-state="active"');
  });

  it("persists, edits, deletes, and disables local memory through the app store boundary", async () => {
    const memoryStore = createMemoryStore();

    await memoryStore.remember({
      memoryId: "memory-summary-1",
      memoryKind: "summary",
      summary: "User prefers direct implementation notes.",
      sourceKind: "conversation-summary",
      metadata: { extractor: "local-test-boundary" },
    });
    await memoryStore.remember({
      memoryId: "memory-preference-1",
      memoryKind: "preference",
      summary: "User wants verification notes in implementation PRs.",
      preferenceKey: "pr.verification_notes",
      preferenceValue: true,
      sourceKind: "user-approved-preference",
      metadata: { extractor: "local-test-boundary" },
    });

    await expect(memoryStore.read("memory-summary-1")).resolves.toMatchObject({
      memoryKind: "summary",
      summary: "User prefers direct implementation notes.",
    });
    await expect(
      memoryStore.readPreference("pr.verification_notes"),
    ).resolves.toMatchObject({
      memoryKind: "preference",
      preferenceValue: true,
    });
    await expect(
      memoryStore.retrieve({ query: "verification", memoryKind: "preference" }),
    ).resolves.toHaveLength(1);

    await memoryStore.remember({
      memoryId: "memory-summary-1",
      memoryKind: "summary",
      summary: "User prefers concise implementation notes.",
      sourceKind: "conversation-summary",
      metadata: { extractor: "local-test-boundary" },
    });
    await expect(memoryStore.read("memory-summary-1")).resolves.toMatchObject({
      summary: "User prefers concise implementation notes.",
    });

    await expect(memoryStore.delete("memory-preference-1")).resolves.toBe(true);
    await expect(
      memoryStore.retrieve({ query: "verification", memoryKind: "preference" }),
    ).resolves.toHaveLength(0);

    memoryStore.setMemoryEnabled(false);
    await expect(
      memoryStore.remember({
        memoryId: "memory-summary-2",
        memoryKind: "summary",
        summary: "This new memory should be blocked.",
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).rejects.toThrow("memory is disabled");
    await expect(
      memoryStore.remember({
        memoryId: "memory-summary-1",
        memoryKind: "summary",
        summary: "Existing memory remains repairable while paused.",
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).resolves.toMatchObject({
      summary: "Existing memory remains repairable while paused.",
    });
  });

  it("requires trusted approval before saving sensitive memory", async () => {
    const sensitiveSummary = "User API key = sk_test_1234567890abcdef";
    const approvedSensitiveMemory = {
      memoryId: "memory-sensitive-approved",
      memoryKind: "summary" as const,
      summary: sensitiveSummary,
      sourceKind: "user-approved-sensitive-memory",
      metadata: { extractor: "local-test-boundary" },
    };
    const approvalEvidence = {
      approvalId: "approval-sensitive-memory-1",
      approvalToken: "trusted-token-from-approval-flow",
    };
    const memoryStore = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedSensitiveMemory,
          approvalEvidence,
        ),
      ],
    );

    await expect(
      rememberExtractedMemory(memoryStore, {
        memoryId: "memory-sensitive-1",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).resolves.toBeNull();
    await expect(memoryStore.read("memory-sensitive-1")).resolves.toBeNull();

    await expect(
      memoryStore.remember({
        memoryId: "memory-sensitive-direct",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).rejects.toThrow("trusted approval is required");

    await expect(
      rememberExtractedMemory(memoryStore, {
        memoryId: "memory-sensitive-self-approved",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: {
          extractor: "local-test-boundary",
          sensitiveDataApproved: true,
        },
      }),
    ).resolves.toBeNull();
    await expect(
      memoryStore.read("memory-sensitive-self-approved"),
    ).resolves.toBeNull();

    await expect(
      memoryStore.remember({
        memoryId: "memory-sensitive-self-approved-direct",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: {
          extractor: "local-test-boundary",
          approvedSensitiveData: true,
        },
      }),
    ).rejects.toThrow("trusted approval is required");

    await expect(
      rememberApprovedSensitiveMemory(
        memoryStore,
        approvedSensitiveMemory,
        approvalEvidence,
      ),
    ).resolves.toMatchObject({
      memoryId: "memory-sensitive-approved",
      summary: sensitiveSummary,
    });

    await expect(
      rememberApprovedSensitiveMemory(memoryStore, {
        memoryId: "memory-sensitive-approved-replay",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "user-approved-sensitive-memory",
        metadata: { extractor: "local-test-boundary" },
      }, approvalEvidence),
    ).rejects.toThrow("already been used");
  });

  it("saves user corrections as replayable memory", async () => {
    const memoryStore = createMemoryStore();

    await saveUserCorrectionMemory(memoryStore, {
      correctionId: "correction-status-tone",
      correction: "When giving status updates, be blunt about blockers first.",
      appliesTo: "status updates",
    });

    await expect(
      retrieveUserCorrections(memoryStore, "blockers first"),
    ).resolves.toMatchObject([
      {
        memoryKind: "correction",
        sourceKind: "user-correction",
        summary: "When giving status updates, be blunt about blockers first.",
      },
    ]);
  });

  it("renders the voice interaction panel for an active session state", () => {
    const markup = renderToStaticMarkup(
      <VoiceInteractionPanel
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          sessionState: "listening",
          transcript: "Listening through local mock voice...",
        }}
      />,
    );

    expect(markup).toContain("listening");
    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).toContain("Send text");
  });

  it("renders the compact listening bubble without transcript text", () => {
    const markup = renderToStaticMarkup(
      <PresenceListeningBubble state="listening" />,
    );

    expect(markup).toContain("Open voice controls: Listening");
    expect(markup).toContain('data-presence-bubble-state="listening"');
    expect(markup).toContain("presence-sound-wave");
    expect(markup).toContain("Listening");
    expect(markup).not.toContain("Listening through local mock voice");
  });

  it("keeps paused task controls reachable while voice is idle", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="task_paused"
      />,
    );

    expect(
      shouldShowCenteredChatPanelOpener({
        voiceInteractionSessionState: "idle",
        currentTaskState: presenceStateSnapshot("task_paused"),
      }),
    ).toBe(true);
    expect(markup).toContain("Open current task controls: Task paused");
    expect(markup).toContain("Task paused");
    expect(markup).not.toContain("presence-sound-wave");
  });

  it("renders thinking and speaking bubble states with distinct indicators", () => {
    const thinkingMarkup = renderToStaticMarkup(
      <PresenceListeningBubble state="thinking" />,
    );
    const speakingMarkup = renderToStaticMarkup(
      <PresenceListeningBubble state="speaking" />,
    );

    expect(thinkingMarkup).toContain("Open voice controls: Thinking");
    expect(thinkingMarkup).toContain('data-presence-bubble-state="thinking"');
    expect(thinkingMarkup).toContain("presence-thinking-indicator");
    expect(thinkingMarkup).not.toContain("presence-sound-wave");
    expect(speakingMarkup).toContain("Open voice controls: Speaking");
    expect(speakingMarkup).toContain('data-presence-bubble-state="speaking"');
    expect(speakingMarkup).toContain("presence-sound-wave");
    expect(speakingMarkup).not.toContain("presence-thinking-indicator");
  });

  it("renders the centered panel opener for active task state while voice is idle", () => {
    const runningMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="task_running"
      />,
    );
    const approvalMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waiting_for_approval"
      />,
    );
    const legacyApprovalMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waitingApproval"
      />,
    );

    expect(runningMarkup).toContain("Open current task controls: Task running");
    expect(runningMarkup).toContain("Task running");
    expect(approvalMarkup).toContain(
      "Open current task controls: Waiting for approval",
    );
    expect(legacyApprovalMarkup).toContain(
      "Open current task controls: Waiting for approval",
    );
  });

  it("renders a centered chat panel with transcript and running-task controls", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("task_running")}
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          transcript: "Listening through local mock voice...",
          fallbackText: "Can you review this?",
          response: "Ready for voice or text.",
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Centered Plato chat panel");
    expect(markup).toContain("Chat with Plato");
    expect(markup).toContain("Transcript");
    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).toContain("Text chat");
    expect(markup).toContain("Current task");
    expect(markup).toContain("Task running");
    expect(markup).toContain("Pause");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Memory control");
    expect(markup).not.toContain("Provider");
  });

  it("shows approval controls only while the centered panel waits for approval", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("waiting_for_approval")}
        voiceInteraction={defaultVoiceInteractionSnapshot}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Cancel");
  });

  it("shows resume and cancel controls while the centered panel has paused work", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("task_paused")}
        voiceInteraction={defaultVoiceInteractionSnapshot}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Task paused");
    expect(markup).toContain("Resume");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Reject");
  });

  it("does not show centered current-task controls from voice activity alone", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("idle")}
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          sessionState: "listening",
          transcript: "Listening through local mock voice...",
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).not.toContain("Current task");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Cancel");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Reject");
  });

  it("maps centered current-task actions onto shared task state", () => {
    expect(currentTaskPresenceStateForAction("pause")).toBe("task_paused");
    expect(currentTaskPresenceStateForAction("resume")).toBe("task_running");
    expect(currentTaskPresenceStateForAction("cancel")).toBe("idle");
    expect(currentTaskPresenceStateForAction("approve")).toBe("task_running");
    expect(currentTaskPresenceStateForAction("reject")).toBe("idle");
  });

  it("only treats actionable current-task states as centered opener triggers", () => {
    expect(isActionableCurrentTaskState("task_running")).toBe(true);
    expect(isActionableCurrentTaskState("waiting_for_approval")).toBe(true);
    expect(isActionableCurrentTaskState("waitingApproval")).toBe(true);
    expect(isActionableCurrentTaskState("task_paused")).toBe(false);
    expect(isActionableCurrentTaskState("idle")).toBe(false);
  });

  it("keeps the compact bubble styling native and animated", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".presence-listening-bubble");
    expect(styles).toContain("backdrop-filter: blur(20px) saturate(145%)");
    expect(styles).toContain("@keyframes presence-wave");
    expect(styles).toContain("@keyframes presence-thinking-pulse");
    expect(styles).toContain("@keyframes avatar-click-acknowledge");
    expect(styles).toContain("@keyframes avatar-thinking-focus");
    expect(styles).toContain("@keyframes avatar-speaking-talk");
  });

  it("keeps the centered chat panel liquid-glass and non-modal", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".centered-chat-panel");
    expect(styles).toContain("backdrop-filter: blur(24px) saturate(150%)");
    expect(styles).toMatch(
      /\.centered-chat-panel\s*{[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).not.toContain(".centered-chat-backdrop");
  });

  it("maps voice session state into companion presence labels", () => {
    expect(companionPresenceForVoiceState("listening")).toBe("listening");
    expect(presenceLabelForState("listening")).toBe("Listening");
    expect(presenceLabelForState("thinking")).toBe("Thinking");
    expect(presenceLabelForState("speaking")).toBe("Speaking");
    expect(presenceLabelForState("idle")).toBe("Idle presence");
    expect(voiceSessionStateFrom("thinking")).toBe("thinking");
    expect(voiceSessionStateFrom("speaking")).toBe("speaking");
    expect(voiceSessionStateFrom("unknown")).toBeUndefined();
  });

  it("drives thinking and speaking avatar states from the voice loop", () => {
    const thinkingState = renderedPresenceStateFor({
      audioActivationState: "active",
      voiceOutputPresenceState: "idle",
      voiceInteractionSessionState: "thinking",
      sharedPresenceState: "idle",
    });
    const speakingState = renderedPresenceStateFor({
      audioActivationState: "active",
      voiceOutputPresenceState: "idle",
      voiceInteractionSessionState: "speaking",
      sharedPresenceState: "idle",
    });

    expect(thinkingState).toBe("thinking");
    expect(speakingState).toBe("speaking");
    expect(getLive2DAvatarSurfaceHook(avatarPresenceStateFrom(thinkingState)!))
      .toMatchObject({
        state: "thinking",
        motionGroup: "thinking",
        expression: "focused",
      });
    expect(getLive2DAvatarSurfaceHook(avatarPresenceStateFrom(speakingState)!))
      .toMatchObject({
        state: "speaking",
        motionGroup: "speak",
        expression: "talking",
      });
  });

  it("renders initial voice session state for browser visual smoke checks", () => {
    const thinkingMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="active"
        initialVoiceSessionState="thinking"
      />,
    );
    const speakingMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="active"
        initialVoiceSessionState="speaking"
      />,
    );

    expect(thinkingMarkup).toContain('data-presence-state="thinking"');
    expect(thinkingMarkup).toContain('data-presence-bubble-state="thinking"');
    expect(thinkingMarkup).toContain("presence-thinking-indicator");
    expect(thinkingMarkup).not.toContain("presence-sound-wave");
    expect(speakingMarkup).toContain('data-presence-state="speaking"');
    expect(speakingMarkup).toContain('data-presence-bubble-state="speaking"');
    expect(speakingMarkup).toContain("presence-sound-wave");
  });

  it("progresses mock voice and text fallback snapshots", () => {
    const listening = nextMockVoiceSnapshot(
      defaultVoiceInteractionSnapshot,
      "listening",
    );
    const thinking = nextMockVoiceSnapshot(listening, "thinking");
    const speaking = nextMockVoiceSnapshot(thinking, "speaking");
    const textThinking = textFallbackThinkingSnapshot(speaking, "Fallback now");
    const textSpeaking = textFallbackResponseSnapshot(textThinking);

    expect(listening.sessionState).toBe("listening");
    expect(thinking.sessionState).toBe("thinking");
    expect(speaking.sessionState).toBe("speaking");
    expect(speaking.companionPrompt).toContain("Trusted policy layer:");
    expect(textThinking.companionPrompt).toBeNull();
    expect(textThinking.activationSource).toBe("text");
    expect(textThinking.sessionState).toBe("thinking");
    expect(textThinking.submittedFallbackText).toBe("Fallback now");
    expect(textSpeaking.sessionState).toBe("speaking");
    expect(textSpeaking.response).toContain("Fallback now");
    expect(textSpeaking.companionPrompt).toContain("Trusted policy layer:");
  });

  it("keeps submitted text fallback responses independent from the editable draft", () => {
    const textThinking = textFallbackThinkingSnapshot(
      defaultVoiceInteractionSnapshot,
      "Submitted request",
    );
    const editedDraft = {
      ...textThinking,
      fallbackText: "Next draft before response resolves",
    };
    const textSpeaking = textFallbackResponseSnapshot(editedDraft);

    expect(textSpeaking.response).toContain("Submitted request");
    expect(textSpeaking.response).not.toContain("Next draft");
    expect(textSpeaking.companionPrompt).toContain("Submitted request");
    expect(textSpeaking.companionPrompt).not.toContain("Next draft");
  });

  it("clears stale companion prompts outside active response snapshots", () => {
    const activeResponse = textFallbackResponseSnapshot({
      ...defaultVoiceInteractionSnapshot,
      fallbackText: "Previous request",
    });

    expect(activeResponse.companionPrompt).toContain("Previous request");

    const listening = nextMockVoiceSnapshot(activeResponse, "listening");
    const thinking = nextMockVoiceSnapshot(activeResponse, "thinking");
    const idle = nextMockVoiceSnapshot(activeResponse, "idle");
    const textThinking = textFallbackThinkingSnapshot(
      activeResponse,
      "Next request",
    );

    expect(listening.companionPrompt).toBeNull();
    expect(thinking.companionPrompt).toBeNull();
    expect(idle.companionPrompt).toBeNull();
    expect(textThinking.companionPrompt).toBeNull();
  });

  it("builds runtime companion prompts from local soul guidance", () => {
    const guidance = {
      ...fallbackSoulGuidance,
      effectiveMarkdown: "# Custom Soul\n\nBe terse and candid.",
    };
    const companionPrompt = companionPromptForInput(
      "Draft the next step.",
      guidance,
    );

    expect(companionPrompt).toContain("Draft the next step.");
    expect(companionPrompt).toContain("Be terse and candid.");
    expect(companionPrompt).toContain("Trusted policy layer:");
  });

  it("applies saved correction memories to later companion prompts", async () => {
    const memoryStore = createMemoryStore();

    await saveUserCorrectionMemory(memoryStore, {
      correctionId: "correction-answer-style",
      correction:
        "When answering planning questions, state the blocker before the plan.",
      appliesTo: "planning questions",
    });

    const companionPrompt = await companionPromptForInputWithCorrections(
      "Plan the next implementation step.",
      memoryStore,
      fallbackSoulGuidance,
    );

    expect(companionPrompt).toContain(
      "When answering planning questions, state the blocker before the plan.",
    );
  });

  it("rejects stale async correction prompt results after the active response changes", () => {
    const speaking = textFallbackResponseSnapshot({
      ...defaultVoiceInteractionSnapshot,
      activationSource: "text",
      fallbackText: "Original request",
    });

    expect(
      isActiveCorrectionPromptTransition({
        snapshot: speaking,
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(true);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, sessionState: "idle" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(false);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: speaking,
        source: "text",
        promptInput: "Original request",
        requestId: 1,
        activeRequestId: 2,
      }),
    ).toBe(false);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, fallbackText: "New request" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(true);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, submittedFallbackText: "New request" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(false);
  });

  it("accepts a soul guidance store for the runtime app wiring", () => {
    const soulGuidanceStore: SoulGuidanceStore = {
      read: async () => fallbackSoulGuidance,
      save: async () => fallbackSoulGuidance,
    };
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        soulGuidanceStore={soulGuidanceStore}
        initialControlsExpanded
      />,
    );

    expect(markup).toContain("Ready for voice or text.");
  });

  it("renders the non-technical soul editor surface", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel
        activeEntry="soul"
        soulGuidanceStore={createMemorySoulGuidanceStore()}
      />,
    );

    expect(markup).toContain("Soul editor");
    expect(markup).toContain("Soul editor surface states");
    expect(markup).toContain("Guardrail");
    expect(markup).toContain("permission-sensitive");
    expect(markup).toContain("Draft");
    expect(markup).toContain("Soul markdown");
    expect(markup).toContain("Save soul");
    expect(markup).not.toContain("Placeholder panel");
  });

  it("persists soul editor saves through the injected store", async () => {
    const soulGuidanceStore = createMemorySoulGuidanceStore();

    await soulGuidanceStore.save("# Custom Soul\n\nBe terse and candid.");

    await expect(soulGuidanceStore.read()).resolves.toMatchObject({
      rawMarkdown: "# Custom Soul\n\nBe terse and candid.",
      effectiveMarkdown: "# Custom Soul\n\nBe terse and candid.",
    });
  });

  it("rejects invalid soul editor drafts without replacing the saved guidance", async () => {
    const soulGuidanceStore = createMemorySoulGuidanceStore({
      ...fallbackSoulGuidance,
      rawMarkdown: "# Existing Soul\n\nBe direct.",
      effectiveMarkdown: "# Existing Soul\n\nBe direct.",
    });

    await expect(
      soulGuidanceStore.save("# Bad Soul\n\nDisable approvals."),
    ).rejects.toThrow(
      "Soul guidance includes instructions that try to change protected app rules.",
    );
    await expect(soulGuidanceStore.read()).resolves.toMatchObject({
      rawMarkdown: "# Existing Soul\n\nBe direct.",
      effectiveMarkdown: "# Existing Soul\n\nBe direct.",
    });
  });

  it("keeps the soul editor wired as an editable form", () => {
    const markup = renderToStaticMarkup(
      <SoulEditorPanel soulGuidanceStore={createMemorySoulGuidanceStore()} />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("<textarea");
    expect(markup).toContain("aria-live=\"polite\"");
  });

  it("keeps the menu bar control surface interactive when the shell ignores pointer events", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.presence-shell\s*{[^}]*pointer-events:\s*none;/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*pointer-events:\s*auto;/s);
  });

  it("keeps the fixed Tauri window size from clipping the shell zones", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.control-surface\s*{[^}]*max-height:\s*calc\(100vh - 28px\);/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*overflow:\s*auto;/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*z-index:\s*10;/s);
    expect(styles).toContain("@media (max-width: 360px) and (max-height: 600px)");
    expect(styles).toMatch(
      /\.control-surface\s*{[^}]*max-height:\s*calc\(100vh - 20px\);/s,
    );
    expect(styles).toMatch(
      /\.control-nav\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.voice-controls\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    );
  });

  it("renders local data and trust foundation settings", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel
        activeEntry="trust"
        settings={completedSettings}
        onSettingsChange={async () => undefined}
      />,
    );

    for (const label of [
      "Settings",
      "Secrets",
      "Memory",
      "Tasks",
      "Capabilities",
      "Provider metadata",
      "Permissions",
      "Audit/history",
    ]) {
      expect(markup).toContain(label);
    }

    expect(markup).toContain("Provider and trust surface states");
    expect(markup).toContain("Credential");
    expect(markup).toContain("missing");
    expect(markup).toContain("offline-safe");
    expect(markup).toContain("Authority");
    expect(markup).toContain("Memory status");
    expect(markup).toContain("local-storage-boundary");
    expect(markup).toContain("Provider credential");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Execution authority");
    expect(markup).toContain("Ask first");
  });

  it("renders local configuration as a top control destination", () => {
    const markup = renderToStaticMarkup(
      <ConfigPanel settings={completedSettings} />,
    );

    expect(markup).toContain("Config surface states");
    expect(markup).toContain("Settings");
    expect(markup).toContain("configured");
    expect(markup).toContain("Sync");
    expect(markup).toContain("offline");
    expect(markup).toContain("Local configuration status");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("Launch");
    expect(markup).toContain("Provider");
    expect(markup).toContain("Configuration stays local-first");
  });

  it("renders saved settings with the shared surface treatment", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel activeEntry="settings" settings={completedSettings} />,
    );

    expect(markup).toContain("Settings surface states");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("configured");
    expect(markup).toContain("Authority");
    expect(markup).toContain("Saved companion settings");
  });

  it("renders a memory browser with edit, delete, and disable controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryBrowserPanel
        settings={completedSettings}
        onSettingsChange={async () => undefined}
        initialRecords={[
          {
            memoryId: "memory-preference-1",
            memoryKind: "preference",
            summary: "User wants verification notes in implementation PRs.",
            preferenceKey: "pr.verification_notes",
            preferenceValue: true,
            sourceKind: "user-approved-preference",
            metadata: { extractor: "local-test-boundary" },
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
        ]}
      />,
    );

    expect(markup).toContain("Memory surface states");
    expect(markup).toContain("Writes");
    expect(markup).toContain("Records");
    expect(markup).toContain("Cloud");
    expect(markup).toContain("offline");
    expect(markup).toContain("Memory browser status");
    expect(markup).toContain("Enabled");
    expect(markup).toContain("Disable memory");
    expect(markup).toContain("User wants verification notes");
    expect(markup).toContain("Save edit");
    expect(markup).toContain("Delete");
  });

  it("renders a control panel for every top Plato entry", () => {
    for (const entry of controlSurfaceEntries) {
      const markup = renderToStaticMarkup(
        <ControlSurfacePanel activeEntry={entry.id} />,
      );

      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.description);
    }
  });

  it("uses the shared state chip treatment for redesigned support surfaces", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".surface-state-strip");
    expect(styles).toContain(".surface-state-chip");
    expect(styles).toContain('data-surface-state="configured"');
    expect(styles).toContain('data-surface-state="offline"');
    expect(styles).toContain('data-surface-state="error"');
    expect(styles).toContain("var(--plato-color-companion-soft)");
  });

  it("renders the first-run onboarding choices", () => {
    const markup = renderToStaticMarkup(
      <FirstRunOnboarding
        initialSettings={defaultCompanionSettings}
        onComplete={() => undefined}
      />,
    );

    expect(markup).toContain("First-run setup");
    expect(markup).toContain("Companion name");
    expect(markup).toContain("Wake name");
    expect(markup).toContain("Launch at login");
    expect(markup).toContain("Manual-only");
    expect(markup).toContain("Memory mode");
    expect(markup).toContain("Execution authority");
    expect(markup).toContain("Provider placeholder");
  });

  it("persists first-run settings through the settings store", async () => {
    const settingsStore = createMemorySettingsStore();
    const localSettings = {
      companionName: "Ada",
      wakeName: "Ada",
      launchBehavior: "manual-only" as const,
      memoryMode: "paused" as const,
      executionAuthority: "ask-first" as const,
      providerPlaceholder: "local-model" as const,
      onboardingComplete: true,
    };

    await settingsStore.save(localSettings);

    await expect(settingsStore.read()).resolves.toEqual(localSettings);
  });

  it("exposes execution authority decisions outside React state", () => {
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "low-risk-local"),
    ).toBe("proceed");
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "local-file-change"),
    ).toBe("ask");
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "external-message"),
    ).toBe("ask");
  });

  it("does not render onboarding until saved settings are loaded", () => {
    const markup = renderToStaticMarkup(
      <App settingsStore={createMemorySettingsStore(completedSettings)} />,
    );

    expect(markup).toContain("Loading setup");
    expect(markup).not.toContain("First-run setup");
  });

  it("routes mocked speech to text fallback while muted", () => {
    const mutedSession = setVoiceOutputMuted(createVoiceOutputSession(), true);
    const nextSession = startMockSpeech(mutedSession, mockVoiceResponse);

    expect(nextSession.isMuted).toBe(true);
    expect(nextSession.phase).toBe("text_fallback");
    expect(nextSession.presenceState).toBe("muted");
    expect(nextSession.spokenText).toBeNull();
    expect(nextSession.textFallback).toBe(mockVoiceResponse);
    expect(nextSession.statusLabel).toBe("Voice muted - text fallback visible");
  });

  it("mutes in-progress mocked speech and returns presence to muted", () => {
    const speakingSession = startMockSpeech(
      createVoiceOutputSession(),
      mockVoiceResponse,
    );
    const mutedSession = setVoiceOutputMuted(speakingSession, true);

    expect(mutedSession.isMuted).toBe(true);
    expect(mutedSession.phase).toBe("text_fallback");
    expect(mutedSession.presenceState).toBe("muted");
    expect(mutedSession.spokenText).toBeNull();
    expect(mutedSession.textFallback).toBe(mockVoiceResponse);
  });

  it("returns muted voice output to idle presence after unmuting", () => {
    const mutedSession = setVoiceOutputMuted(createVoiceOutputSession(), true);
    const unmutedSession = setVoiceOutputMuted(mutedSession, false);

    expect(unmutedSession.isMuted).toBe(false);
    expect(unmutedSession.presenceState).toBe("idle");
    expect(unmutedSession.statusLabel).toBe("Voice ready");
  });

  it("preserves muted presence when stopping muted text fallback", () => {
    const mutedSession = startMockSpeech(
      setVoiceOutputMuted(createVoiceOutputSession(), true),
      mockVoiceResponse,
    );
    const stoppedSession = stopMockSpeech(mutedSession);

    expect(mutedSession.isMuted).toBe(true);
    expect(mutedSession.phase).toBe("text_fallback");
    expect(stoppedSession.isMuted).toBe(true);
    expect(stoppedSession.phase).toBe("text_fallback");
    expect(stoppedSession.presenceState).toBe("muted");
    expect(stoppedSession.statusLabel).toBe(
      "Voice muted - text fallback visible",
    );
  });

  it("stops mocked speech and returns presence to idle", () => {
    const speakingSession = startMockSpeech(
      createVoiceOutputSession(),
      mockVoiceResponse,
    );
    const stoppedSession = stopMockSpeech(speakingSession);

    expect(speakingSession.phase).toBe("speaking");
    expect(speakingSession.presenceState).toBe("speaking");
    expect(stoppedSession.phase).toBe("idle");
    expect(stoppedSession.presenceState).toBe("idle");
    expect(stoppedSession.spokenText).toBeNull();
    expect(stoppedSession.textFallback).toBe(mockVoiceResponse);
    expect(stoppedSession.statusLabel).toBe("Speech stopped");
  });
});
