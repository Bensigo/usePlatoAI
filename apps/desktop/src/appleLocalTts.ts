import {
  voiceRuntimeError,
  type TextToSpeechProviderAvailabilityState,
  type VoiceAudioPlaybackAdapter,
  type VoiceProviderAvailabilityAdapter,
  type VoiceRuntimeAdapterError,
  type VoiceRuntimeAdapterResult,
  type VoiceRuntimeOperationContext,
  type VoiceRuntimeStopInput,
  type VoiceTextToSpeechAdapter,
} from "@useplatoai/voice";

export type AppleLocalTtsAvailability = {
  providerId: "apple-local-tts";
  state: TextToSpeechProviderAvailabilityState;
  detail: string;
};

type AppleLocalTtsCommandResult = {
  providerId: "apple-local-tts";
  status: "speaking" | "completed" | "stopped" | "failed";
  text?: string;
  error?: VoiceRuntimeAdapterError;
};

type AppleLocalTtsInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type AppleLocalTtsAdapterOptions = {
  invoke?: AppleLocalTtsInvoke;
};

export type AppleLocalVoiceRuntimeAdapters = {
  availability: VoiceProviderAvailabilityAdapter;
  textToSpeech: VoiceTextToSpeechAdapter;
  playback: VoiceAudioPlaybackAdapter;
};

const providerId = "apple-local-tts";

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
    providerId,
    error: voiceRuntimeError(code, message, retryable),
  };
}

function resultFromNative(
  native: AppleLocalTtsCommandResult,
): VoiceRuntimeAdapterResult {
  if (native.status === "failed") {
    return {
      status: "failed",
      providerId,
      error:
        native.error ??
        voiceRuntimeError("apple_tts_error", "Apple local TTS failed.", false),
    };
  }

  return {
    status: "success",
    providerId,
  };
}

function isAborted(context?: VoiceRuntimeOperationContext) {
  return context?.signal?.aborted === true;
}

function abortPromise(context?: VoiceRuntimeOperationContext) {
  if (!context?.signal) {
    return null;
  }

  if (context.signal.aborted) {
    return Promise.resolve("aborted" as const);
  }

  return new Promise<"aborted">((resolve) => {
    context.signal?.addEventListener("abort", () => resolve("aborted"), {
      once: true,
    });
  });
}

export function createAppleLocalVoiceRuntimeAdapters(
  options: AppleLocalTtsAdapterOptions = {},
): AppleLocalVoiceRuntimeAdapters {
  const invoke = options.invoke ?? tauriInvoke;

  return {
    availability: {
      async check() {
        try {
          const availability = (await invoke(
            "apple_tts_availability",
          )) as AppleLocalTtsAvailability;

          if (availability.state === "supported") {
            return {
              status: "available",
              providerId,
            };
          }

          if (availability.state === "unavailable") {
            return {
              status: "unavailable",
              providerId,
              reason: availability.detail,
            };
          }

          return {
            status: "error",
            providerId,
            error: voiceRuntimeError(
              "apple_tts_error",
              availability.detail,
              true,
            ),
          };
        } catch (error) {
          return {
            status: "error",
            providerId,
            error: voiceRuntimeError(
              "apple_tts_error",
              errorMessage(error),
              true,
            ),
          };
        }
      },
    },
    textToSpeech: {
      async synthesize(input, context) {
        if (isAborted(context)) {
          return failedResult<{ audio: Uint8Array }>(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          );
        }

        const text = input.text.trim();

        if (!text) {
          return failedResult<{ audio: Uint8Array }>(
            "apple_tts_empty_text",
            "Apple TTS text cannot be empty.",
            false,
          );
        }

        return {
          status: "success",
          providerId,
          audio: new TextEncoder().encode(text),
        };
      },
      async stop() {
        return;
      },
    },
    playback: {
      async play(input, context) {
        if (isAborted(context)) {
          return failedResult(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          );
        }

        const text = new TextDecoder().decode(input.audio).trim();

        if (!text) {
          return failedResult(
            "apple_tts_empty_text",
            "Apple TTS text cannot be empty.",
            false,
          );
        }

        try {
          const speakRequest = invoke("apple_tts_speak", {
            request: {
              text,
              voiceId: undefined,
            },
          }) as Promise<AppleLocalTtsCommandResult>;
          const abort = abortPromise(context);
          const native = await (abort
            ? Promise.race([speakRequest, abort])
            : speakRequest);

          if (native === "aborted") {
            await invoke("apple_tts_stop");
            return failedResult(
              "operation_aborted",
              "Voice operation was interrupted.",
              true,
            );
          }

          return resultFromNative(native);
        } catch (error) {
          return failedResult("apple_tts_error", errorMessage(error), false);
        }
      },
      async stop(_input?: VoiceRuntimeStopInput) {
        await invoke("apple_tts_stop");
      },
    },
  };
}
