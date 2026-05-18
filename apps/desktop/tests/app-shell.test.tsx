import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  App,
  ControlSurfacePanel,
  DismissedPresence,
  FirstRunOnboarding,
  VoiceInteractionPanel,
} from "../src/App";
import {
  Live2DAvatarSurface,
  getLive2DAvatarSurfaceHook,
  isAvatarPresenceState,
  type AvatarPresenceState,
} from "../src/avatarSurface";
import { controlSurfaceEntries } from "../src/controlSurface";
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
  companionPresenceForVoiceState,
  defaultVoiceInteractionSnapshot,
  nextMockVoiceSnapshot,
  presenceLabelForState,
  textFallbackResponseSnapshot,
  textFallbackThinkingSnapshot,
} from "../src/voiceInteraction";

const completedSettings: CompanionSettings = {
  ...defaultCompanionSettings,
  onboardingComplete: true,
};

describe("desktop app shell", () => {
  it("renders the floating Plato presence controls", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("Wake name: Plato");
    expect(markup).toContain("Idle presence");
    expect(markup).toContain("data-live2d-motion-group=\"idle\"");
    expect(markup).toContain("data-live2d-expression=\"neutral\"");
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
    expect(markup).not.toContain("Plato is hidden");
  });

  it("maps renderer-independent presence states to Live2D surface hooks", () => {
    const expectedMappings: Array<{
      state: AvatarPresenceState;
      statusText: string;
      motionGroup: string;
      expression: string;
    }> = [
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
        state: "waiting_for_approval",
        statusText: "Waiting for approval",
        motionGroup: "approval",
        expression: "concerned",
      },
    ];

    for (const mapping of expectedMappings) {
      const hook = getLive2DAvatarSurfaceHook(mapping.state);
      const markup = renderToStaticMarkup(
        <Live2DAvatarSurface presenceState={mapping.state} />,
      );

      expect(hook.statusText).toBe(mapping.statusText);
      expect(hook.motionGroup).toBe(mapping.motionGroup);
      expect(hook.expression).toBe(mapping.expression);
      expect(markup).toContain(`data-presence-state="${mapping.state}"`);
      expect(markup).toContain(
        `data-live2d-motion-group="${mapping.motionGroup}"`,
      );
      expect(markup).toContain(
        `data-live2d-expression="${mapping.expression}"`,
      );
      expect(markup).toContain(mapping.statusText);
    }
  });

  it("renders the floating presence from an injected presence state", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waiting_for_approval"
      />,
    );

    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain('data-presence-state="waiting_for_approval"');
    expect(markup).toContain('data-live2d-motion-group="approval"');
    expect(markup).toContain('data-live2d-expression="concerned"');
  });

  it("recognizes valid URL presence states for visual smoke checks", () => {
    expect(isAvatarPresenceState("speaking")).toBe(true);
    expect(isAvatarPresenceState("waiting_for_approval")).toBe(true);
    expect(isAvatarPresenceState("unknown")).toBe(false);
    expect(isAvatarPresenceState(null)).toBe(false);
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
  });

  it("renders a restore path for the dismissed presence state", () => {
    const markup = renderToStaticMarkup(
      <DismissedPresence onRestore={() => undefined} />,
    );

    expect(markup).toContain("Plato presence hidden");
    expect(markup).toContain("Plato is hidden");
    expect(markup).toContain("Show Plato presence");
  });

  it("renders every menu bar placeholder entry", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(controlSurfaceEntries.map((entry) => entry.id)).toEqual([
      "voice",
      "settings",
      "tasks",
      "memory",
      "permissions",
      "providers",
      "soul",
    ]);

    for (const entry of controlSurfaceEntries) {
      expect(markup).toContain(entry.label);
    }

    expect(markup).toContain(controlSurfaceEntries[0].description);
    expect(markup).toContain("Start listening");
  });

  it("renders explicit voice controls and text fallback without credentials", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("Start listening");
    expect(markup).toContain("Mute voice output");
    expect(markup).toContain("Text fallback");
    expect(markup).toContain("Ready for voice or text.");
    expect(markup).not.toContain("OpenAI credential");
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

  it("maps voice session state into companion presence labels", () => {
    expect(companionPresenceForVoiceState("listening")).toBe("listening");
    expect(presenceLabelForState("listening")).toBe("Listening");
    expect(presenceLabelForState("thinking")).toBe("Thinking");
    expect(presenceLabelForState("speaking")).toBe("Speaking");
    expect(presenceLabelForState("idle")).toBe("Idle presence");
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
    expect(textThinking.activationSource).toBe("text");
    expect(textThinking.sessionState).toBe("thinking");
    expect(textSpeaking.sessionState).toBe("speaking");
    expect(textSpeaking.response).toContain("Fallback now");
  });

  it("keeps the menu bar control surface interactive when the shell ignores pointer events", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.presence-shell\s*{[^}]*pointer-events:\s*none;/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*pointer-events:\s*auto;/s);
  });

  it("renders local data and trust foundation settings", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel
        activeEntry="settings"
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

    expect(markup).toContain("Memory status");
    expect(markup).toContain("metadata-only");
    expect(markup).toContain("Provider credential");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Execution authority");
    expect(markup).toContain("Ask first");
  });

  it("renders a placeholder panel for every menu bar entry", () => {
    for (const entry of controlSurfaceEntries) {
      const markup = renderToStaticMarkup(
        <ControlSurfacePanel activeEntry={entry.id} />,
      );

      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.description);
    }
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
});
