import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiAudioPlaybackAdapter,
  createOpenAiVoiceSessionAdapters,
  defaultOpenAiVoiceConfig,
  openAiVoiceCredentialMetadata,
} from "../src/openAiVoice";
import type { DesktopMicrophoneCaptureDependencies } from "../src/desktopMicrophone";

function successfulMicrophoneDependencies(): DesktopMicrophoneCaptureDependencies {
  class TestMediaRecorder {
    state = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onstop: (() => void) | null = null;

    start() {
      this.state = "recording";
      this.ondataavailable?.({
        data: new Blob(["voice-bytes"], { type: "audio/webm" }),
      } as BlobEvent);
      this.stop();
    }

    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  }

  return {
    mediaDevices: {
      getUserMedia: async () =>
        ({
          getTracks: () => [{ stop: vi.fn() }],
        }) as unknown as MediaStream,
    },
    MediaRecorderConstructor:
      TestMediaRecorder as unknown as DesktopMicrophoneCaptureDependencies["MediaRecorderConstructor"],
    maxCaptureMs: 1,
    mimeType: "audio/webm",
  };
}

describe("OpenAI desktop voice adapters", () => {
  it("drives captured audio through OpenAI STT, response generation, TTS, and playback commands", async () => {
    const calls: string[] = [];
    const playedAudio: number[] = [];
    const invoke = vi.fn(async (command: string, payload?: unknown) => {
      calls.push(`${command}:${JSON.stringify(payload ?? {})}`);

      switch (command) {
        case "openai_voice_availability":
          return { status: "available", providerId: "openai" };
        case "openai_voice_transcribe":
          return {
            status: "success",
            providerId: "openai",
            transcript: "Schedule the release.",
          };
        case "openai_voice_generate_response":
          return {
            status: "success",
            providerId: "openai",
            text: "I will map the release path.",
          };
        case "openai_voice_synthesize":
          return {
            status: "success",
            providerId: "openai",
            audio: [1, 2, 3, 4],
          };
        default:
          throw new Error(`unexpected command ${command}`);
      }
    });

    const adapters = createOpenAiVoiceSessionAdapters(
      successfulMicrophoneDependencies(),
      {
        invoke,
        playback: createOpenAiAudioPlaybackAdapter({
          play: async (audio) => {
            playedAudio.push(...audio);
          },
          stop: async () => undefined,
        }),
      },
    );

    await expect(adapters.availability.check({
      activationSource: "voice",
      outputMode: "audible",
    })).resolves.toEqual({ status: "available", providerId: "openai" });
    const captured = await adapters.microphone.capture();
    expect(captured.status).toBe("success");
    expect(captured.status === "success" ? captured.audio.byteLength : 0).toBeGreaterThan(0);

    await expect(
      adapters.speechToText.transcribe({
        audio: captured.status === "success" ? captured.audio : new Uint8Array(),
      }),
    ).resolves.toMatchObject({
      status: "success",
      providerId: "openai",
      transcript: "Schedule the release.",
    });
    await expect(
      adapters.responseGeneration.generate({
        transcript: "Schedule the release.",
        activationSource: "voice",
      }),
    ).resolves.toMatchObject({
      status: "success",
      text: "I will map the release path.",
    });
    const speech = await adapters.textToSpeech.synthesize({
      text: "I will map the release path.",
    });
    expect(speech).toMatchObject({ status: "success", providerId: "openai" });
    await adapters.playback.play({
      audio: speech.status === "success" ? speech.audio : new Uint8Array(),
    });

    expect(playedAudio).toEqual([1, 2, 3, 4]);
    expect(calls.join("\n")).toContain("openai_voice_transcribe");
    expect(calls.join("\n")).toContain("openai_voice_generate_response");
    expect(calls.join("\n")).toContain("openai_voice_synthesize");
  });

  it("reports missing OpenAI credentials as unavailable without calling STT", async () => {
    const invoke = vi.fn(async (command: string) => {
      expect(command).toBe("openai_voice_availability");
      return {
        status: "unavailable",
        providerId: "openai",
        reason: "OpenAI API key is not configured.",
      };
    });

    const adapters = createOpenAiVoiceSessionAdapters(
      successfulMicrophoneDependencies(),
      { invoke },
    );

    await expect(adapters.availability.check({
      activationSource: "voice",
      outputMode: "audible",
    })).resolves.toEqual({
      status: "unavailable",
      providerId: "openai",
      reason: "OpenAI API key is not configured.",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps OpenAI voice configuration explicit and non-realtime", () => {
    expect(defaultOpenAiVoiceConfig).toMatchObject({
      authType: "api-key",
      apiUse: "paid-remote",
      sttModel: "gpt-4o-mini-transcribe",
      responseModel: "gpt-4o-mini",
      ttsModel: "gpt-4o-mini-tts",
      ttsVoice: "coral",
      ttsFormat: "mp3",
    });
    expect(JSON.stringify(defaultOpenAiVoiceConfig).toLowerCase()).not.toContain(
      "realtime",
    );
    expect(openAiVoiceCredentialMetadata()).toEqual({
      authType: "api-key",
      apiUse: "paid-remote",
      voice: {
        sttModel: "gpt-4o-mini-transcribe",
        responseModel: "gpt-4o-mini",
        ttsModel: "gpt-4o-mini-tts",
        ttsVoice: "coral",
        ttsFormat: "mp3",
      },
    });
  });
});
