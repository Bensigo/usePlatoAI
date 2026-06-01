import { describe, expect, it } from "vitest";

import {
  createVoiceSessionRuntime,
  voiceSessionStateToAvatarState,
  voiceSessionStates,
  type VoiceSessionState,
} from "../src";
import { createVoiceSessionTestAdapters } from "../src/testAdapters";

describe("voice session runtime", () => {
  it("drives a production voice session from real adapter results and playable audio", async () => {
    const events: VoiceSessionState[] = [];
    const adapters = createVoiceSessionTestAdapters({
      capturedAudio: new Uint8Array([1, 2, 3]),
      transcript: "Plan the release.",
      generatedResponse: "I will map the release path.",
      speechAudio: new Uint8Array([8, 9, 10]),
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    runtime.subscribe((snapshot) => {
      if (events.at(-1) !== snapshot.state) {
        events.push(snapshot.state);
      }
    });

    await runtime.startVoice();

    expect(events).toEqual([
      "listening",
      "transcribing",
      "thinking",
      "speaking",
      "idle",
    ]);
    expect(runtime.getSnapshot()).toMatchObject({
      state: "idle",
      transcript: "Plan the release.",
      responseText: "I will map the release path.",
      isMuted: false,
    });
    expect(adapters.calls).toEqual([
      "availability.check",
      "microphone.capture",
      "stt.transcribe",
      "response.generate",
      "tts.synthesize",
      "playback.play",
    ]);
    expect(adapters.lastPlaybackAudio).toEqual(new Uint8Array([8, 9, 10]));
  });

  it("exports every explicit production voice state and avatar mapping", () => {
    expect(voiceSessionStates).toEqual([
      "idle",
      "listening",
      "transcribing",
      "thinking",
      "speaking",
      "interrupted",
      "error",
      "unavailable",
      "muted",
    ]);
    expect(voiceSessionStateToAvatarState("idle")).toBe("idle");
    expect(voiceSessionStateToAvatarState("listening")).toBe("listening");
    expect(voiceSessionStateToAvatarState("transcribing")).toBe("thinking");
    expect(voiceSessionStateToAvatarState("thinking")).toBe("thinking");
    expect(voiceSessionStateToAvatarState("speaking")).toBe("speaking");
    expect(voiceSessionStateToAvatarState("interrupted")).toBe("idle");
    expect(voiceSessionStateToAvatarState("error")).toBe("error");
    expect(voiceSessionStateToAvatarState("unavailable")).toBe("error");
    expect(voiceSessionStateToAvatarState("muted")).toBe("muted");
  });

  it("rejects invalid starts while a session is already active", async () => {
    const adapters = createVoiceSessionTestAdapters({
      captureDelayMs: 20,
      capturedAudio: new Uint8Array([1]),
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    const activeRun = runtime.startVoice();

    await expect(runtime.startVoice()).rejects.toThrow(
      "voice session cannot start while another session is active",
    );

    await activeRun;
  });

  it("interrupts active work, stops adapters, emits interrupted, and recovers to idle", async () => {
    const events: VoiceSessionState[] = [];
    const adapters = createVoiceSessionTestAdapters({
      captureDelayMs: 50,
      capturedAudio: new Uint8Array([1]),
    });
    const runtime = createVoiceSessionRuntime({ adapters });
    runtime.subscribe((snapshot) => {
      if (events.at(-1) !== snapshot.state) {
        events.push(snapshot.state);
      }
    });

    const activeRun = runtime.startVoice();
    await adapters.waitForCall("microphone.capture");

    await runtime.interrupt("user_interrupt");
    await activeRun;

    expect(events).toContain("interrupted");
    expect(runtime.getSnapshot().state).toBe("idle");
    expect(adapters.calls).toContain("microphone.stop:user_interrupt");
    expect(adapters.calls).not.toContain("stt.transcribe");
    expect(adapters.calls).not.toContain("playback.play");
  });

  it("reports unavailable providers without reporting success", async () => {
    const adapters = createVoiceSessionTestAdapters({
      availability: {
        status: "unavailable",
        providerId: "voice-stack",
        reason: "No STT provider is configured.",
      },
      capturedAudio: new Uint8Array([1]),
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    await runtime.startVoice();

    expect(runtime.getSnapshot()).toMatchObject({
      state: "unavailable",
      error: {
        code: "provider_unavailable",
        message: "No STT provider is configured.",
        retryable: true,
      },
    });
    expect(adapters.calls).toEqual(["availability.check"]);
  });

  it("reports provider errors without playback or success", async () => {
    const adapters = createVoiceSessionTestAdapters({
      capturedAudio: new Uint8Array([1]),
      sttError: "Microphone permission was denied.",
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    await runtime.startVoice();

    expect(runtime.getSnapshot()).toMatchObject({
      state: "error",
      error: {
        code: "provider_error",
        message: "Microphone permission was denied.",
        retryable: false,
      },
    });
    expect(adapters.calls).not.toContain("response.generate");
    expect(adapters.calls).not.toContain("playback.play");
  });

  it("keeps muted output in text fallback and does not synthesize or play audio", async () => {
    const adapters = createVoiceSessionTestAdapters({
      transcript: "Keep it quiet.",
      generatedResponse: "Text fallback only.",
      speechAudio: new Uint8Array([8]),
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    runtime.setMuted(true);
    await runtime.startVoice();

    expect(runtime.getSnapshot()).toMatchObject({
      state: "muted",
      isMuted: true,
      transcript: "Keep it quiet.",
      responseText: "Text fallback only.",
    });
    expect(adapters.calls).toEqual([
      "availability.check",
      "microphone.capture",
      "stt.transcribe",
      "response.generate",
    ]);
  });

  it("runs text fallback through response generation without persistent history", async () => {
    const adapters = createVoiceSessionTestAdapters({
      generatedResponse: "Typed input handled.",
    });
    const runtime = createVoiceSessionRuntime({ adapters });

    await runtime.submitTextFallback("Review this plan.");

    expect(runtime.getSnapshot()).toMatchObject({
      state: "idle",
      activationSource: "text",
      transcript: "Review this plan.",
      responseText: "Typed input handled.",
    });
    expect(runtime.getSnapshot()).not.toHaveProperty("history");
    expect(runtime.getSnapshot()).not.toHaveProperty("rawAudio");
    expect(adapters.calls).toEqual([
      "availability.check",
      "response.generate",
      "tts.synthesize",
      "playback.play",
    ]);
  });
});
