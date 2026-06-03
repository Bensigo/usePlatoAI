import { describe, expect, it, vi } from "vitest";

import {
  createLocalWhisperSpeechToTextAdapter,
  localWhisperProviderId,
} from "../src/localWhisperStt";

const wavAudio = new Uint8Array([
  82, 73, 70, 70, 40, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
]);

describe("local Whisper STT desktop runtime adapter", () => {
  it("reports unavailable until both whisper binary and ggml model paths are configured", async () => {
    const adapter = createLocalWhisperSpeechToTextAdapter({
      getConfig: () => ({ binaryPath: "", modelPath: "" }),
    });

    await expect(
      adapter.availability.check({
        activationSource: "voice",
        outputMode: "audible",
      }),
    ).resolves.toEqual({
      status: "unavailable",
      providerId: localWhisperProviderId,
      reason:
        "Local Whisper STT needs a whisper.cpp binary path and ggml model path.",
    });
  });

  it("validates configured binary and model paths through the Tauri command boundary", async () => {
    const invoke = vi.fn().mockResolvedValue({
      providerId: localWhisperProviderId,
      state: "available",
      detail: "Local Whisper STT is available.",
    });
    const adapter = createLocalWhisperSpeechToTextAdapter({
      invoke,
      getConfig: () => ({
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      }),
    });

    await expect(
      adapter.availability.check({
        activationSource: "voice",
        outputMode: "audible",
      }),
    ).resolves.toEqual({
      status: "available",
      providerId: localWhisperProviderId,
    });
    expect(invoke).toHaveBeenCalledWith("local_whisper_availability", {
      request: {
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      },
    });
  });

  it("transcribes wav microphone bytes with configured local Whisper paths", async () => {
    const invoke = vi.fn().mockResolvedValue({
      providerId: localWhisperProviderId,
      status: "completed",
      transcript: "Plan the release.",
    });
    const adapter = createLocalWhisperSpeechToTextAdapter({
      invoke,
      getConfig: () => ({
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      }),
    });

    await expect(adapter.speechToText.transcribe({ audio: wavAudio })).resolves.toEqual({
      status: "success",
      providerId: localWhisperProviderId,
      transcript: "Plan the release.",
    });
    expect(invoke).toHaveBeenCalledWith("local_whisper_transcribe", {
      request: {
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
        wavAudio,
      },
    });
  });

  it("rejects non-wav audio before invoking whisper.cpp", async () => {
    const invoke = vi.fn();
    const adapter = createLocalWhisperSpeechToTextAdapter({
      invoke,
      getConfig: () => ({
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      }),
    });

    await expect(
      adapter.speechToText.transcribe({ audio: new Uint8Array([1, 2, 3]) }),
    ).resolves.toMatchObject({
      status: "failed",
      providerId: localWhisperProviderId,
      error: {
        code: "invalid_whisper_audio",
        message: "Local Whisper STT requires 16-bit mono WAV audio.",
        retryable: true,
      },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps empty transcripts and process failures to explicit adapter failures", async () => {
    const adapter = createLocalWhisperSpeechToTextAdapter({
      invoke: vi.fn().mockResolvedValue({
        providerId: localWhisperProviderId,
        status: "failed",
        error: {
          code: "empty_transcript",
          message: "Local Whisper returned an empty transcript.",
          retryable: true,
        },
      }),
      getConfig: () => ({
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      }),
    });

    await expect(adapter.speechToText.transcribe({ audio: wavAudio })).resolves.toEqual({
      status: "failed",
      providerId: localWhisperProviderId,
      error: {
        code: "empty_transcript",
        message: "Local Whisper returned an empty transcript.",
        retryable: true,
      },
    });
  });

  it("stops active local Whisper transcription through the native stop command", async () => {
    const invoke = vi.fn().mockResolvedValue({
      providerId: localWhisperProviderId,
      status: "stopped",
    });
    const adapter = createLocalWhisperSpeechToTextAdapter({
      invoke,
      getConfig: () => ({
        binaryPath: "/usr/local/bin/whisper-cli",
        modelPath: "/models/ggml-base.en.bin",
      }),
    });

    await expect(
      adapter.speechToText.stop({ reason: "user_interrupt" }),
    ).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("local_whisper_stop");
  });
});
