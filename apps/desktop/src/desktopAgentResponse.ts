import {
  voiceRuntimeError,
  type VoiceProviderAvailabilityAdapter,
  type VoiceResponseGenerationAdapter,
  type VoiceRuntimeAdapterError,
  type VoiceRuntimeAdapterResult,
  type VoiceRuntimeOperationContext,
  type VoiceRuntimeStopInput,
} from "@useplatoai/voice";

const providerId = "codex-agent-engine-response";

type AgentEngineResponseAvailability = {
  providerId: typeof providerId;
  state: "available" | "unavailable" | "error";
  detail: string;
};

type AgentEngineResponseCommandResult = {
  providerId: typeof providerId;
  status: "completed" | "failed" | "stopped";
  text?: string;
  error?: VoiceRuntimeAdapterError;
};

type AgentEngineResponseInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type AgentEngineResponseAuthSnapshot = {
  activeAuthMode: string | null;
  chatgptOauth: {
    configured: boolean;
    availability: string;
    tokenSource: string | null;
  };
};

export type AgentEngineResponseAdapterOptions = {
  invoke?: AgentEngineResponseInvoke;
  getAuthSnapshot?: () => Promise<AgentEngineResponseAuthSnapshot>;
  timeoutMs?: number;
};

export type AgentEngineResponseRuntimeAdapters = {
  availability: VoiceProviderAvailabilityAdapter;
  responseGeneration: VoiceResponseGenerationAdapter;
};

async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function readTauriAuthSnapshot(): Promise<AgentEngineResponseAuthSnapshot> {
  const snapshot = await tauriInvoke<{
    providerCredential: AgentEngineResponseAuthSnapshot;
  }>("read_trust_foundation_snapshot");

  return snapshot.providerCredential;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAborted(context?: VoiceRuntimeOperationContext) {
  return context?.signal?.aborted === true;
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

function authUnavailableReason(auth: AgentEngineResponseAuthSnapshot) {
  if (auth.activeAuthMode === "openai_api_key") {
    return "Voice response generation requires local SDK auth; OpenAI API-key mode is not used for this voice path.";
  }

  if (
    auth.activeAuthMode !== "chatgpt_oauth" ||
    !auth.chatgptOauth.configured ||
    auth.chatgptOauth.tokenSource !== "codex_app_server"
  ) {
    return "Codex local SDK auth is not configured. Connect ChatGPT OAuth through Codex before using voice response generation.";
  }

  if (auth.chatgptOauth.availability !== "logged-in") {
    return `Codex local SDK auth is ${auth.chatgptOauth.availability}.`;
  }

  return null;
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

function responseFromNative(
  native: AgentEngineResponseCommandResult,
): VoiceRuntimeAdapterResult<{ text: string }> {
  if (native.status === "completed") {
    const text = native.text?.trim() ?? "";

    if (!text) {
      return failedResult<{ text: string }>(
        "empty_agent_response",
        "Agent Engine returned an empty voice response.",
        false,
      );
    }

    return {
      status: "success",
      providerId,
      text,
    };
  }

  return {
    status: "failed",
    providerId,
    error:
      native.error ??
      voiceRuntimeError(
        native.status === "stopped" ? "operation_aborted" : "provider_error",
        native.status === "stopped"
          ? "Voice operation was interrupted."
          : "Agent Engine response generation failed.",
        native.status === "stopped",
      ),
  };
}

export function createAgentEngineResponseAdapters(
  options: AgentEngineResponseAdapterOptions = {},
): AgentEngineResponseRuntimeAdapters {
  const invoke = options.invoke ?? tauriInvoke;
  const getAuthSnapshot = options.getAuthSnapshot ?? readTauriAuthSnapshot;
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function stop() {
    await invoke("agent_engine_stop_response");
  }

  const availability: VoiceProviderAvailabilityAdapter = {
    async check(_input, context) {
      if (isAborted(context)) {
        return {
          status: "error",
          providerId,
          error: voiceRuntimeError(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          ),
        };
      }

      try {
        const unavailableReason = authUnavailableReason(await getAuthSnapshot());

        if (unavailableReason) {
          return {
            status: "unavailable",
            providerId,
            reason: unavailableReason,
          };
        }

        const native = (await invoke(
          "agent_engine_response_availability",
        )) as AgentEngineResponseAvailability;

        if (native.state === "available") {
          return {
            status: "available",
            providerId,
          };
        }

        if (native.state === "unavailable") {
          return {
            status: "unavailable",
            providerId,
            reason: native.detail,
          };
        }

        return {
          status: "error",
          providerId,
          error: voiceRuntimeError("provider_error", native.detail, true),
        };
      } catch (error) {
        return {
          status: "error",
          providerId,
          error: voiceRuntimeError("provider_error", errorMessage(error), true),
        };
      }
    },
  };

  const responseGeneration: VoiceResponseGenerationAdapter = {
    async generate(input, context) {
      if (isAborted(context)) {
        return failedResult<{ text: string }>(
          "operation_aborted",
          "Voice operation was interrupted.",
          true,
        );
      }

      const transcript = input.transcript.trim();

      if (!transcript) {
        return failedResult<{ text: string }>(
          "empty_voice_transcript",
          "Voice response generation needs a transcript.",
          false,
        );
      }

      try {
        const nativeRequest = invoke("agent_engine_generate_response", {
          request: {
            transcript,
            activationSource: input.activationSource,
            timeoutMs,
          },
        }) as Promise<AgentEngineResponseCommandResult>;
        const abort = abortPromise(context);
        const native = await (abort
          ? Promise.race([nativeRequest, abort])
          : nativeRequest);

        if (native === "aborted") {
          await stop();
          return failedResult<{ text: string }>(
            "operation_aborted",
            "Voice operation was interrupted.",
            true,
          );
        }

        return responseFromNative(native);
      } catch (error) {
        return failedResult<{ text: string }>(
          "provider_error",
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
    responseGeneration,
  };
}
