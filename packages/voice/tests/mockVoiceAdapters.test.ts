import { describe, expect, it } from "vitest";

import {
  createMockSpeechToTextAdapter,
  createMockTextToSpeechAdapter,
  createMockWakeWordAdapter,
  voiceAdapterStatuses,
} from "../src";

describe("mock voice adapters", () => {
  it("exports the UI-distinguishable voice adapter status set", () => {
    expect(voiceAdapterStatuses).toEqual([
      "idle",
      "listening",
      "thinking",
      "speaking",
      "stopped",
      "failed",
    ]);
  });

  it("produces deterministic mock transcription without provider credentials", async () => {
    const adapter = createMockSpeechToTextAdapter({
      transcript: "Plato, summarize my task tray",
    });

    await expect(
      adapter.transcribe({ audio: new Uint8Array([1, 2, 3]) }),
    ).resolves.toEqual({
      status: "stopped",
      transcript: "Plato, summarize my task tray",
      providerId: "mock-stt",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns stopped state when transcription is interrupted", async () => {
    const adapter = createMockSpeechToTextAdapter();
    const controller = new AbortController();

    controller.abort();

    await expect(
      adapter.transcribe(
        { audio: new Uint8Array([1]) },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      status: "stopped",
      providerId: "mock-stt",
      error: {
        code: "operation_aborted",
        message: "Voice operation was interrupted.",
        retryable: true,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("produces deterministic mock speech output without provider credentials", async () => {
    const adapter = createMockTextToSpeechAdapter();

    await expect(adapter.speak({ text: "I am on it." })).resolves.toEqual({
      status: "stopped",
      providerId: "mock-tts",
      text: "I am on it.",
      audio: new Uint8Array([73, 32, 97, 109, 32, 111, 110, 32, 105, 116, 46]),
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires text-to-speech adapters to expose interrupt controls", async () => {
    const adapter = createMockTextToSpeechAdapter();

    await expect(adapter.stop({ reason: "user_interrupt" })).resolves.toEqual({
      status: "stopped",
      providerId: "mock-tts",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns stopped state when speech output is interrupted", async () => {
    const adapter = createMockTextToSpeechAdapter();
    const controller = new AbortController();

    controller.abort();

    await expect(
      adapter.speak({ text: "Stop talking." }, { signal: controller.signal }),
    ).resolves.toEqual({
      status: "stopped",
      providerId: "mock-tts",
      error: {
        code: "operation_aborted",
        message: "Voice operation was interrupted.",
        retryable: true,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("reports adapter failures in a UI-distinguishable failed state", async () => {
    const adapter = createMockSpeechToTextAdapter({
      failure: "microphone unavailable",
    });

    await expect(
      adapter.transcribe({ audio: new Uint8Array([1]) }),
    ).resolves.toEqual({
      status: "failed",
      providerId: "mock-stt",
      error: {
        code: "mock_failure",
        message: "microphone unavailable",
        retryable: false,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("keeps wake-word detection separate from STT and TTS adapters", async () => {
    const adapter = createMockWakeWordAdapter({
      detected: true,
      wakeName: "Plato",
    });

    await expect(
      adapter.detect({ audio: new Uint8Array([8]) }),
    ).resolves.toEqual({
      status: "stopped",
      providerId: "mock-wake-word",
      detected: true,
      wakeName: "Plato",
      confidence: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires wake-word adapters to expose interrupt controls", async () => {
    const adapter = createMockWakeWordAdapter();

    await expect(adapter.stop({ reason: "disabled" })).resolves.toEqual({
      status: "stopped",
      providerId: "mock-wake-word",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
