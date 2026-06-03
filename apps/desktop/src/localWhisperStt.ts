import {
  voiceRuntimeError,
  type VoiceProviderAvailabilityAdapter,
  type VoiceRuntimeAdapterError,
  type VoiceRuntimeAdapterResult,
  type VoiceRuntimeOperationContext,
  type VoiceRuntimeStopInput,
  type VoiceSpeechToTextAdapter,
} from "@useplatoai/voice";

export const localWhisperProviderId = "local-whisper-stt";

export type LocalWhisperConfig = {
  binaryPath: string;
  modelPath: string;
};

export type LocalWhisperAvailability = {
  providerId: typeof localWhisperProviderId;
  state: "available" | "unavailable" | "error";
  detail: string;
};

type LocalWhisperCommandResult = {
  providerId: typeof localWhisperProviderId;
  status: "completed" | "failed" | "stopped";
  transcript?: string;
  error?: VoiceRuntimeAdapterError;
};

type LocalWhisperInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type LocalWhisperAdapterOptions = {
  getConfig: () => LocalWhisperConfig;
  invoke?: LocalWhisperInvoke;
};

export type LocalWhisperRuntimeAdapters = {
  availability: VoiceProviderAvailabilityAdapter;
  speechToText: VoiceSpeechToTextAdapter;
};

const missingConfigReason =
  "Local Whisper STT needs a whisper.cpp binary path and ggml model path.";

async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function failedResult<TPayload extends object = object>(
  code: string,
  message: string,
  retryable: boolean,
): VoiceRuntimeAdapterResult<TPayload> {
  return {
    status: "failed",
    providerId: localWhisperProviderId,
    error: voiceRuntimeError(code, message, retryable),
  };
}

function isConfigured(config: LocalWhisperConfig) {
  return Boolean(config.binaryPath.trim() && config.modelPath.trim());
}

function isWavAudio(audio: Uint8Array) {
  return (
    audio.byteLength >= 12 &&
    audio[0] === 82 &&
    audio[1] === 73 &&
    audio[2] === 70 &&
    audio[3] === 70 &&
    audio[8] === 87 &&
    audio[9] === 65 &&
    audio[10] === 86 &&
    audio[11] === 69
  );
}

function isAborted(context?: VoiceRuntimeOperationContext) {
  return context?.signal?.aborted === true;
}

function resultFromNative(
  native: LocalWhisperCommandResult,
): VoiceRuntimeAdapterResult<{ transcript: string }> {
  if (native.status === "completed") {
    const transcript = native.transcript?.trim() ?? "";

    if (!transcript) {
      return failedResult<{ transcript: string }>(
        "empty_transcript",
        "Local Whisper returned an empty transcript.",
        true,
      );
    }

    return {
      status: "success",
      providerId: localWhisperProviderId,
      transcript,
    };
  }

  return {
    status: "failed",
    providerId: localWhisperProviderId,
    error:
      native.error ??
      voiceRuntimeError("whisper_process_failed", "Local Whisper failed.", false),
  };
}

export function createLocalWhisperSpeechToTextAdapter({
  getConfig,
  invoke = tauriInvoke,
}: LocalWhisperAdapterOptions): LocalWhisperRuntimeAdapters {
  async function stop() {
    await invoke("local_whisper_stop");
  }

  const availability: VoiceProviderAvailabilityAdapter = {
    async check(_input, context) {
      if (isAborted(context)) {
        return {
          status: "error",
          providerId: localWhisperProviderId,
          error: voiceRuntimeError(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          ),
        };
      }

      const config = getConfig();

      if (!isConfigured(config)) {
        return {
          status: "unavailable",
          providerId: localWhisperProviderId,
          reason: missingConfigReason,
        };
      }

      try {
        const native = (await invoke("local_whisper_availability", {
          request: {
            binaryPath: config.binaryPath,
            modelPath: config.modelPath,
          },
        })) as LocalWhisperAvailability;

        if (native.state === "available") {
          return {
            status: "available",
            providerId: localWhisperProviderId,
          };
        }

        if (native.state === "unavailable") {
          return {
            status: "unavailable",
            providerId: localWhisperProviderId,
            reason: native.detail,
          };
        }

        return {
          status: "error",
          providerId: localWhisperProviderId,
          error: voiceRuntimeError("whisper_availability_error", native.detail, true),
        };
      } catch (error) {
        return {
          status: "error",
          providerId: localWhisperProviderId,
          error: voiceRuntimeError(
            "whisper_availability_error",
            errorMessage(error),
            true,
          ),
        };
      }
    },
  };

  const speechToText: VoiceSpeechToTextAdapter = {
    async transcribe(input, context) {
      if (isAborted(context)) {
        return failedResult<{ transcript: string }>(
          "operation_aborted",
          "Voice operation was interrupted.",
          true,
        );
      }

      const config = getConfig();

      if (!isConfigured(config)) {
        return failedResult<{ transcript: string }>(
          "provider_unavailable",
          missingConfigReason,
          true,
        );
      }

      if (!isWavAudio(input.audio)) {
        return failedResult<{ transcript: string }>(
          "invalid_whisper_audio",
          "Local Whisper STT requires 16-bit mono WAV audio.",
          true,
        );
      }

      try {
        const native = (await invoke("local_whisper_transcribe", {
          request: {
            binaryPath: config.binaryPath,
            modelPath: config.modelPath,
            wavAudio: input.audio,
          },
        })) as LocalWhisperCommandResult;

        if (isAborted(context)) {
          await stop();
          return failedResult<{ transcript: string }>(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          );
        }

        return resultFromNative(native);
      } catch (error) {
        return failedResult<{ transcript: string }>(
          "whisper_process_failed",
          errorMessage(error),
          false,
        );
      }
    },
    async stop(_input?: VoiceRuntimeStopInput) {
      await stop();
    },
  };

  return {
    availability,
    speechToText,
  };
}
