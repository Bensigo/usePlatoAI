import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  App,
  AudioActivationStatus,
  MemoryBrowserPanel,
  renderedPresenceStateFor,
} from "../src/App";
import {
  audioActivationSnapshotForState,
  type AudioActivationState,
} from "../src/audioActivation";
import {
  avatarPresenceStates,
  getLive2DAvatarSurfaceHook,
  Live2DAvatarSurface,
} from "../src/avatarSurface";
import { controlSurfaceEntries } from "../src/controlSurface";
import {
  defaultCompanionSettings,
  type CompanionSettings,
} from "../src/settings";
import type { LocalMemoryRecord } from "../src/memory";
import {
  defaultVoiceInteractionSnapshot,
  nextMockVoiceSnapshot,
} from "../src/voiceInteraction";

const completedSettings: CompanionSettings = {
  ...defaultCompanionSettings,
  onboardingComplete: true,
};

const sampleMemoryRecord: LocalMemoryRecord = {
  memoryId: "memory-redesign-smoke",
  memoryKind: "preference",
  summary: "Prefers concise operator-style responses.",
  preferenceKey: "response_style",
  preferenceValue: "concise",
  sourceKind: "smoke-test",
  metadata: {},
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

function pngHeaderStats(filePath: string) {
  const data = readFileSync(filePath);
  expect(data.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
    byteLength: data.byteLength,
  };
}

describe("Milestone 005 redesign smoke coverage", () => {
  it("renders the main shell, top Plato navigation, and each redesigned control surface", () => {
    const shellMarkup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(shellMarkup).toContain('aria-label="Top Plato control surface"');
    expect(shellMarkup).toContain('aria-label="Floating Plato presence"');
    expect(shellMarkup).toContain('aria-label="Voice output controls"');
    expect(shellMarkup).toContain("Activate audio with Plato");

    for (const entry of controlSurfaceEntries) {
      expect(shellMarkup).toContain(`<span>${entry.label}</span>`);
      expect(shellMarkup).toContain(`data-control-state=`);

      const surfaceMarkup = renderToStaticMarkup(
        <App
          initialSettings={completedSettings}
          initialActiveEntry={entry.id}
        />,
      );

      expect(surfaceMarkup).toContain(`aria-pressed="true"`);
      expect(surfaceMarkup).toContain(`<h2>${entry.label}</h2>`);
      expect(surfaceMarkup).not.toContain("<h2></h2>");
    }
  });

  it("smokes memory, soul, settings/config, provider/trust, and voice surfaces with state strips", () => {
    const expectedSurfaceCopy = {
      voice: [
        "Voice surface states",
        "Start listening",
        "Text fallback",
        "Desktop audio",
      ],
      settings: [
        "Saved companion settings",
        "Launch behavior",
        "Execution authority",
      ],
      config: ["Config surface states", "Provider", "Memory"],
      memory: ["Memory surface states", "Memory browser status", "Records"],
      soul: ["Soul editor surface states", "Soul markdown", "Save soul"],
      trust: [
        "Provider and trust surface states",
        "Provider credential",
        "Execution authority",
      ],
    } as const;

    for (const [surface, requiredCopy] of Object.entries(expectedSurfaceCopy)) {
      const markup = renderToStaticMarkup(
        <App
          initialSettings={completedSettings}
          initialActiveEntry={surface as (typeof controlSurfaceEntries)[number]["id"]}
        />,
      );

      for (const copy of requiredCopy) {
        expect(markup).toContain(copy);
      }

      expect(markup).not.toContain("<section></section>");
    }

    const memoryWithRecordsMarkup = renderToStaticMarkup(
      <MemoryBrowserPanel
        settings={completedSettings}
        onSettingsChange={async () => undefined}
        initialRecords={[sampleMemoryRecord]}
      />,
    );

    expect(memoryWithRecordsMarkup).toContain("Prefers concise");
    expect(memoryWithRecordsMarkup).toContain("Save edit");
    expect(memoryWithRecordsMarkup).toContain("Delete");
  });

  it("confirms every required Plato avatar state renders a nonblank asset-backed surface", () => {
    for (const state of avatarPresenceStates) {
      const hook = getLive2DAvatarSurfaceHook(state);
      const markup = renderToStaticMarkup(
        <Live2DAvatarSurface presenceState={state} />,
      );
      const publicAssetPath = resolve(
        __dirname,
        "../public",
        hook.assetSrc.replace(/^\//, ""),
      );

      expect(existsSync(publicAssetPath)).toBe(true);
      expect(markup).toContain(`data-presence-state="${state}"`);
      expect(markup).toContain(`data-live2d-motion-group="${hook.motionGroup}"`);
      expect(markup).toContain(`data-live2d-expression="${hook.expression}"`);
      expect(markup).toContain(`data-avatar-asset="${hook.assetSrc}"`);
      expect(markup).toContain(hook.statusText);
      expect(markup).not.toContain('src=""');

      const stats = pngHeaderStats(publicAssetPath);

      expect(stats.width).toBe(384);
      expect(stats.height).toBe(760);
      expect(stats.bitDepth).toBe(8);
      expect(stats.colorType).toBe(6);
      expect(stats.byteLength).toBeGreaterThan(300_000);
    }
  });

  it("covers audio activation, muted, unavailable, and error visual states", () => {
    const audioStates: AudioActivationState[] = [
      "inactive",
      "active",
      "muted",
      "unavailable",
      "error",
    ];

    for (const state of audioStates) {
      const snapshot = audioActivationSnapshotForState(state);
      const markup = renderToStaticMarkup(
        <AudioActivationStatus audioActivation={snapshot} />,
      );

      expect(markup).toContain(`data-audio-activation-state="${state}"`);
      expect(markup).toContain(snapshot.statusLabel);
      expect(markup).toContain(snapshot.detail);
    }

    expect(
      renderedPresenceStateFor({
        audioActivationState: "error",
        voiceOutputPresenceState: "idle",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("error");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "active",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("muted");
  });

  it("renders voice thinking and speaking states for repeatable visual captures", () => {
    for (const sessionState of ["thinking", "speaking"] as const) {
      const voiceSnapshot = nextMockVoiceSnapshot(
        nextMockVoiceSnapshot(defaultVoiceInteractionSnapshot, "listening"),
        sessionState,
      );

      expect(voiceSnapshot.sessionState).toBe(sessionState);

      const markup = renderToStaticMarkup(
        <App
          initialSettings={completedSettings}
          initialAudioActivationState="active"
          initialVoiceSessionState={sessionState}
        />,
      );

      expect(markup).toContain(`data-presence-state="${sessionState}"`);
      expect(markup).toContain(`data-presence-bubble-state="${sessionState}"`);
      expect(markup).toContain(
        `Open voice controls: ${getLive2DAvatarSurfaceHook(sessionState).label}`,
      );
    }
  });
});
