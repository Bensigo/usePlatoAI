import { describe, expect, it, vi } from "vitest";

import {
  createUnavailableVoskWakeNameDetector,
  defaultWakeNameActivationSnapshot,
  isConfiguredWakeNameMatch,
  startWakeNameActivation,
  type WakeNameActivationSnapshot,
  type WakeNameDetector,
  type WakeNameDetectorEvent,
} from "../src/wakeNameActivation";

function createFakeWakeNameDetector(
  events: WakeNameDetectorEvent[],
): WakeNameDetector & { starts: number; stops: number } {
  const detector = {
    starts: 0,
    stops: 0,
    async start(_input, onEvent) {
      detector.starts += 1;
      for (const event of events) {
        onEvent(event);
      }
      return {
        status: "listening",
        providerId: "local-vosk-wake-name",
        detail: "Listening locally for the configured wake name.",
      } as const;
    },
    async stop() {
      detector.stops += 1;
    },
  } satisfies WakeNameDetector & { starts: number; stops: number };

  return detector;
}

describe("wake-name activation", () => {
  it("stays disabled by default and does not start the detector", async () => {
    const detector = createFakeWakeNameDetector([
      { type: "match", wakeName: "Amber" },
    ]);
    const onActivation = vi.fn();
    const snapshots: WakeNameActivationSnapshot[] = [];

    await startWakeNameActivation({
      settings: {
        wakeName: "Amber",
        wakeNameActivationEnabled: false,
        wakeNameDetectorModelPath: "",
      },
      detector,
      onActivation,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(detector.starts).toBe(0);
    expect(onActivation).not.toHaveBeenCalled();
    expect(snapshots).toEqual([
      {
        ...defaultWakeNameActivationSnapshot,
        wakeName: "Amber",
      },
    ]);
  });

  it("activates only for the configured wake name", async () => {
    const detector = createFakeWakeNameDetector([
      { type: "match", wakeName: "Plato" },
      { type: "match", wakeName: "Ada" },
    ]);
    const onActivation = vi.fn();
    const snapshots: WakeNameActivationSnapshot[] = [];

    await startWakeNameActivation({
      settings: {
        wakeName: "Ada",
        wakeNameActivationEnabled: true,
        wakeNameDetectorModelPath: "/models/vosk",
      },
      detector,
      onActivation,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(onActivation).toHaveBeenCalledOnce();
    expect(onActivation).toHaveBeenCalledWith("Ada");
    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      "false-positive",
      "matched",
    ]);
    expect(
      isConfiguredWakeNameMatch({
        detectedWakeName: "amber",
        configuredWakeName: "Amber",
      }),
    ).toBe(true);
  });

  it("surfaces detector false positives, failures, and unavailable Vosk state as recoverable", async () => {
    const falsePositiveDetector = createFakeWakeNameDetector([
      {
        type: "false-positive",
        transcript: "member",
        confidence: 0.42,
      },
      {
        type: "error",
        message: "Vosk stream failed.",
        retryable: true,
      },
    ]);
    const snapshots: WakeNameActivationSnapshot[] = [];

    await startWakeNameActivation({
      settings: {
        wakeName: "Amber",
        wakeNameActivationEnabled: true,
        wakeNameDetectorModelPath: "/models/vosk",
      },
      detector: falsePositiveDetector,
      onActivation: vi.fn(),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(snapshots.map((snapshot) => snapshot.state)).toEqual([
      "false-positive",
      "error",
    ]);
    expect(snapshots[0].detail).toContain("member");
    expect(snapshots[1]).toMatchObject({
      state: "error",
      detail: "Vosk stream failed.",
      retryable: true,
    });

    const unavailableSnapshots: WakeNameActivationSnapshot[] = [];
    await startWakeNameActivation({
      settings: {
        wakeName: "Amber",
        wakeNameActivationEnabled: true,
        wakeNameDetectorModelPath: "",
      },
      detector: createUnavailableVoskWakeNameDetector(),
      onActivation: vi.fn(),
      onSnapshot: (snapshot) => unavailableSnapshots.push(snapshot),
    });

    expect(unavailableSnapshots).toEqual([
      expect.objectContaining({
        state: "unavailable",
        detail: expect.stringContaining("Vosk wake-name detection needs"),
        retryable: true,
      }),
    ]);
  });
});
