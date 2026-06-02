import { describe, expect, it } from "vitest";

import { createAppleLocalVoiceRuntimeAdapters } from "../src/appleLocalTts";

describe("Apple local TTS desktop runtime adapters", () => {
  it("reports supported availability from the Tauri command boundary", async () => {
    const adapters = createAppleLocalVoiceRuntimeAdapters({
      invoke: async (command) => {
        expect(command).toBe("apple_tts_availability");
        return {
          providerId: "apple-local-tts",
          state: "supported",
          detail: "Apple system voices are available.",
        };
      },
    });

    await expect(
      adapters.availability.check({
        activationSource: "voice",
        outputMode: "audible",
      }),
    ).resolves.toEqual({
      providerId: "apple-local-tts",
      status: "available",
    });
  });

  it("turns generated response text into the production runtime playback payload", async () => {
    const adapters = createAppleLocalVoiceRuntimeAdapters();

    const result = await adapters.textToSpeech.synthesize({
      text: "I am on it.",
    });

    expect(result).toMatchObject({
      providerId: "apple-local-tts",
      status: "success",
    });
    expect(result.status === "success" ? result.audio : null).toEqual(
      new TextEncoder().encode("I am on it."),
    );
  });

  it("speaks runtime playback text through Apple local TTS without credentials", async () => {
    const calls: Array<{ command: string; args?: unknown }> = [];
    const adapters = createAppleLocalVoiceRuntimeAdapters({
      invoke: async (command, args) => {
        calls.push({ command, args });
        return {
          providerId: "apple-local-tts",
          status: "speaking",
          text: "I am on it.",
        };
      },
    });

    await expect(
      adapters.playback.play({
        audio: new TextEncoder().encode("I am on it."),
      }),
    ).resolves.toEqual({
      providerId: "apple-local-tts",
      status: "success",
    });
    expect(calls).toEqual([
      {
        command: "apple_tts_speak",
        args: { request: { text: "I am on it.", voiceId: undefined } },
      },
    ]);
  });

  it("stops Apple local TTS through the same runtime stop path", async () => {
    const adapters = createAppleLocalVoiceRuntimeAdapters({
      invoke: async (command) => {
        expect(command).toBe("apple_tts_stop");
        return {
          providerId: "apple-local-tts",
          status: "stopped",
        };
      },
    });

    await expect(
      adapters.playback.stop({ reason: "user_interrupt" }),
    ).resolves.toBeUndefined();
  });

  it("maps native availability errors into a runtime error state", async () => {
    const adapters = createAppleLocalVoiceRuntimeAdapters({
      invoke: async () => {
        throw new Error("say command failed");
      },
    });

    await expect(
      adapters.availability.check({
        activationSource: "voice",
        outputMode: "audible",
      }),
    ).resolves.toEqual({
      providerId: "apple-local-tts",
      status: "error",
      error: {
        code: "apple_tts_error",
        message: "say command failed",
        retryable: true,
      },
    });
  });
});
