import {
  voiceRuntimeError,
  type VoiceAudioPlaybackAdapter,
  type VoiceProviderAvailabilityResult,
  type VoiceResponseGenerationAdapter,
  type VoiceRuntimeAdapterResult,
  type VoiceRuntimeStopInput,
  type VoiceSessionAdapters,
  type VoiceSpeechToTextAdapter,
  type VoiceTextToSpeechAdapter,
} from "@useplatoai/voice";

import {
  createDesktopMicrophoneInputAdapter,
  isDesktopMicrophoneCaptureAvailable,
  type DesktopMicrophoneCaptureDependencies,
} from "./desktopMicrophone";

export const defaultOpenAiVoiceConfig = {
  authType: "api-key",
  apiUse: "paid-remote",
  sttModel: "gpt-4o-mini-transcribe",
  responseModel: "gpt-4o-mini",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "coral",
  ttsFormat: "mp3",
} as const;

export function openAiVoiceCredentialMetadata() {
  return {
    authType: defaultOpenAiVoiceConfig.authType,
    apiUse: defaultOpenAiVoiceConfig.apiUse,
    voice: {
      sttModel: defaultOpenAiVoiceConfig.sttModel,
      responseModel: defaultOpenAiVoiceConfig.responseModel,
      ttsModel: defaultOpenAiVoiceConfig.ttsModel,
      ttsVoice: defaultOpenAiVoiceConfig.ttsVoice,
      ttsFormat: defaultOpenAiVoiceConfig.ttsFormat,
    },
  };
}

type OpenAiVoiceError = {
  code: string;
  message: string;
  retryable: boolean;
};

type OpenAiCommandSuccess<TPayload extends object> = {
  status: "success";
  providerId: string;
} & TPayload;

type OpenAiCommandFailure = {
  status: "failed";
  providerId: string;
  error: OpenAiVoiceError;
};

type OpenAiCommandResult<TPayload extends object> =
  | OpenAiCommandSuccess<TPayload>
  | OpenAiCommandFailure;

type OpenAiVoiceInvoke = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

type PlaybackImplementation = {
  play: (audio: number[]) => Promise<void>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type OpenAiVoiceAdapterDependencies = {
  invoke?: OpenAiVoiceInvoke;
  playback?: VoiceAudioPlaybackAdapter;
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function defaultInvoke(
  command: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  if (!isTauriRuntime()) {
    throw new Error("OpenAI voice requires the Tauri runtime.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, payload);
}

function unavailableResult<TPayload extends object>(
  message: string,
): VoiceRuntimeAdapterResult<TPayload> {
  return {
    status: "failed",
    providerId: "openai",
    error: voiceRuntimeError("provider_unavailable", message, true),
  };
}

function errorResult<TPayload extends object>(
  error: unknown,
): VoiceRuntimeAdapterResult<TPayload> {
  return {
    status: "failed",
    providerId: "openai",
    error: voiceRuntimeError(
      "provider_error",
      error instanceof Error ? error.message : "OpenAI voice provider failed.",
      false,
    ),
  };
}

function commandResultToAdapterResult<TPayload extends object>(
  result: OpenAiCommandResult<TPayload>,
): VoiceRuntimeAdapterResult<TPayload> {
  if (result.status === "success") {
    return result;
  }

  return {
    status: "failed",
    providerId: result.providerId,
    error: result.error,
  };
}

function audioArrayFromBytes(audio: Uint8Array) {
  return Array.from(audio);
}

function bytesFromCommandAudio(audio: unknown): Uint8Array {
  if (audio instanceof Uint8Array) {
    return audio;
  }

  if (Array.isArray(audio)) {
    return new Uint8Array(audio);
  }

  return new Uint8Array();
}

export function createOpenAiAudioPlaybackAdapter(
  implementation?: PlaybackImplementation,
): VoiceAudioPlaybackAdapter {
  if (implementation) {
    return {
      async play(input) {
        await implementation.play(audioArrayFromBytes(input.audio));
        return { status: "success", providerId: "openai-playback" };
      },
      async stop(input) {
        await implementation.stop(input);
      },
    };
  }

  let activeAudio: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;

  function releaseActiveAudio() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio = null;
    }

    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
    }
  }

  return {
    async play(input) {
      if (typeof Audio === "undefined" || typeof URL === "undefined") {
        return unavailableResult("Browser audio playback is unavailable.");
      }

      releaseActiveAudio();
      const audioBuffer = input.audio.buffer.slice(
        input.audio.byteOffset,
        input.audio.byteOffset + input.audio.byteLength,
      ) as ArrayBuffer;
      activeUrl = URL.createObjectURL(new Blob([audioBuffer], { type: "audio/mpeg" }));
      activeAudio = new Audio(activeUrl);

      try {
        await new Promise<void>((resolve, reject) => {
          if (!activeAudio) {
            reject(new Error("Audio playback was not initialized."));
            return;
          }

          activeAudio.onended = () => resolve();
          activeAudio.onerror = () =>
            reject(new Error("OpenAI speech audio could not be played."));
          void activeAudio.play().catch(reject);
        });
        releaseActiveAudio();
        return { status: "success", providerId: "openai-playback" };
      } catch (error) {
        releaseActiveAudio();
        return errorResult(error);
      }
    },
    async stop() {
      releaseActiveAudio();
    },
  };
}

export function createOpenAiVoiceSessionAdapters(
  microphoneDependencies: DesktopMicrophoneCaptureDependencies = {},
  dependencies: OpenAiVoiceAdapterDependencies = {},
): VoiceSessionAdapters {
  const invoke = dependencies.invoke ?? defaultInvoke;
  const microphone = createDesktopMicrophoneInputAdapter(microphoneDependencies);
  const playback = dependencies.playback ?? createOpenAiAudioPlaybackAdapter();

  const speechToText: VoiceSpeechToTextAdapter = {
    async transcribe(input) {
      try {
        const result = (await invoke(
          "openai_voice_transcribe",
          {
            audio: audioArrayFromBytes(input.audio),
            mimeType: microphoneDependencies.mimeType ?? "audio/webm",
          },
        )) as OpenAiCommandResult<{ transcript: string }>;
        return commandResultToAdapterResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
    async stop() {
      return;
    },
  };

  const responseGeneration: VoiceResponseGenerationAdapter = {
    async generate(input) {
      try {
        const result = (await invoke(
          "openai_voice_generate_response",
          {
            transcript: input.transcript,
            activationSource: input.activationSource,
          },
        )) as OpenAiCommandResult<{ text: string }>;
        return commandResultToAdapterResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
    async stop() {
      return;
    },
  };

  const textToSpeech: VoiceTextToSpeechAdapter = {
    async synthesize(input) {
      try {
        const result = (await invoke(
          "openai_voice_synthesize",
          { text: input.text },
        )) as OpenAiCommandResult<{ audio: unknown }>;
        const adapterResult = commandResultToAdapterResult(result);

        if (adapterResult.status === "failed") {
          return adapterResult;
        }

        return {
          ...adapterResult,
          audio: bytesFromCommandAudio(adapterResult.audio),
        };
      } catch (error) {
        return errorResult(error);
      }
    },
    async stop() {
      return;
    },
  };

  return {
    availability: {
      async check(): Promise<VoiceProviderAvailabilityResult> {
        if (!isDesktopMicrophoneCaptureAvailable(microphoneDependencies)) {
          return {
            status: "unavailable",
            providerId: "desktop-microphone",
            reason: "Desktop microphone capture is unavailable in this runtime.",
          };
        }

        if (!dependencies.invoke && !isTauriRuntime()) {
          return {
            status: "unavailable",
            providerId: "openai",
            reason: "OpenAI voice requires the Tauri runtime.",
          };
        }

        try {
          return (await invoke(
            "openai_voice_availability",
          )) as VoiceProviderAvailabilityResult;
        } catch (error) {
          return {
            status: "error",
            providerId: "openai",
            error: voiceRuntimeError(
              "provider_error",
              error instanceof Error
                ? error.message
                : "OpenAI voice availability failed.",
              false,
            ),
          };
        }
      },
    },
    microphone,
    speechToText,
    responseGeneration,
    textToSpeech,
    playback,
  };
}
