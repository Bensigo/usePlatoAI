import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  App,
  ControlSurfacePanel,
  DismissedPresence,
  FirstRunOnboarding,
} from "../src/App";
import { controlSurfaceEntries } from "../src/controlSurface";
import {
  type CompanionSettings,
  createMemorySettingsStore,
  defaultCompanionSettings,
} from "../src/settings";

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
    expect(markup).toContain("Launch at login");
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

  it("does not render onboarding until saved settings are loaded", () => {
    const markup = renderToStaticMarkup(
      <App settingsStore={createMemorySettingsStore(completedSettings)} />,
    );

    expect(markup).toContain("Loading setup");
    expect(markup).not.toContain("First-run setup");
  });
});
