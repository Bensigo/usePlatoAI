import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  App,
  ControlSurfacePanel,
  DismissedPresence,
  FirstRunOnboarding,
  VoiceInteractionPanel,
} from "../src/App";
import { controlSurfaceEntries } from "../src/controlSurface";
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
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
    expect(markup).not.toContain("Plato is hidden");
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
