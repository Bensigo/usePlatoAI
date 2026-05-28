import { describe, expect, it } from "vitest";

import {
  VoiceSessionTransitionError,
  canTransitionVoiceSession,
  createVoiceSessionRuntimeSnapshot,
  transitionVoiceSession,
  type VoiceSessionProviderAvailability,
} from "../src";

const availableProviders: VoiceSessionProviderAvailability = {
  speechToText: {
    providerId: "prod-stt",
    available: true,
  },
  textToSpeech: {
    providerId: "prod-tts",
    available: true,
  },
};

describe("voice session runtime", () => {
  it("runs the valid production voice state path without transcript payloads", () => {
    const idle = createVoiceSessionRuntimeSnapshot({
      providers: availableProviders,
    });
    const listening = transitionVoiceSession(idle, { type: "start_listening" });
    const thinking = transitionVoiceSession(listening, {
      type: "start_thinking",
    });
    const speaking = transitionVoiceSession(thinking, {
      type: "start_speaking",
    });
    const complete = transitionVoiceSession(speaking, { type: "complete" });

    expect(listening).toMatchObject({
      state: "listening",
      activeProvider: "speechToText",
    });
    expect(thinking).toMatchObject({
      state: "thinking",
      activeProvider: undefined,
    });
    expect(speaking).toMatchObject({
      state: "speaking",
      activeProvider: "textToSpeech",
    });
    expect(complete).toMatchObject({
      state: "idle",
      activeProvider: undefined,
    });
    expect(JSON.stringify(speaking)).not.toContain("transcript");
  });

  it("rejects invalid state transitions", () => {
    const idle = createVoiceSessionRuntimeSnapshot({
      providers: availableProviders,
    });

    expect(canTransitionVoiceSession(idle, { type: "start_speaking" })).toBe(
      false,
    );
    expect(() =>
      transitionVoiceSession(idle, { type: "start_speaking" }),
    ).toThrow(VoiceSessionTransitionError);
  });

  it("moves active sessions through interruption and idle recovery", () => {
    const listening = transitionVoiceSession(
      createVoiceSessionRuntimeSnapshot({ providers: availableProviders }),
      { type: "start_listening" },
    );
    const interrupted = transitionVoiceSession(listening, {
      type: "interrupt",
      reason: "user_stop",
    });
    const recovered = transitionVoiceSession(interrupted, { type: "recover" });

    expect(interrupted).toMatchObject({
      state: "interrupted",
      activeProvider: "speechToText",
      interruptedReason: "user_stop",
    });
    expect(recovered.state).toBe("idle");
  });

  it("reports speech-to-text unavailability without pretending listening started", () => {
    const unavailable = transitionVoiceSession(
      createVoiceSessionRuntimeSnapshot(),
      { type: "start_listening" },
    );

    expect(unavailable).toMatchObject({
      state: "unavailable",
      activeProvider: "speechToText",
      error: {
        code: "speechToText_unavailable",
        message: "No speech-to-text provider is configured.",
        retryable: true,
      },
    });
  });

  it("reports text-to-speech unavailability separately from speech-to-text", () => {
    const listening = transitionVoiceSession(
      createVoiceSessionRuntimeSnapshot({
        providers: {
          speechToText: { providerId: "prod-stt", available: true },
          textToSpeech: {
            providerId: "prod-tts",
            available: false,
            unavailableReason: "No output voice is selected.",
          },
        },
      }),
      { type: "start_listening" },
    );
    const thinking = transitionVoiceSession(listening, {
      type: "start_thinking",
    });
    const unavailable = transitionVoiceSession(thinking, {
      type: "start_speaking",
    });

    expect(unavailable).toMatchObject({
      state: "unavailable",
      activeProvider: "textToSpeech",
      error: {
        code: "textToSpeech_unavailable",
        message: "No output voice is selected.",
      },
    });
  });

  it("tracks provider failures distinctly from provider availability", () => {
    const failed = transitionVoiceSession(
      createVoiceSessionRuntimeSnapshot({ providers: availableProviders }),
      {
        type: "provider_failed",
        provider: "speechToText",
        error: {
          code: "microphone_denied",
          message: "Microphone permission was denied.",
          retryable: true,
        },
      },
    );
    const recovered = transitionVoiceSession(failed, { type: "recover" });

    expect(failed).toMatchObject({
      state: "error",
      activeProvider: "speechToText",
      error: {
        code: "microphone_denied",
        message: "Microphone permission was denied.",
      },
    });
    expect(recovered.state).toBe("idle");
  });

  it("represents muted state and returns to the previous runtime state", () => {
    const listening = transitionVoiceSession(
      createVoiceSessionRuntimeSnapshot({ providers: availableProviders }),
      { type: "start_listening" },
    );
    const muted = transitionVoiceSession(listening, {
      type: "set_muted",
      muted: true,
    });
    const unmuted = transitionVoiceSession(muted, {
      type: "set_muted",
      muted: false,
    });

    expect(muted).toMatchObject({
      state: "muted",
      previousState: "listening",
      isMuted: true,
    });
    expect(unmuted).toMatchObject({
      state: "listening",
      previousState: undefined,
      isMuted: false,
    });
  });
});
