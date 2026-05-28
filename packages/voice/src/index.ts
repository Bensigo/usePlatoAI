export type VoiceAdapterStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "stopped"
  | "failed";

export const voiceAdapterStatuses = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "stopped",
  "failed",
] as const satisfies readonly VoiceAdapterStatus[];

export type VoiceAdapterError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type VoiceAdapterResultBase = {
  providerId: string;
  status: VoiceAdapterStatus;
  startedAt: string;
  completedAt?: string;
  error?: VoiceAdapterError;
};

export type VoiceOperationContext = {
  signal?: AbortSignal;
};

export type VoiceStopInput = {
  reason?: string;
};

export type SpeechToTextInput = {
  audio: Uint8Array;
  language?: string;
};

export type SpeechToTextResult = VoiceAdapterResultBase & {
  transcript?: string;
};

export type TextToSpeechInput = {
  text: string;
  voiceId?: string;
};

export type TextToSpeechResult = VoiceAdapterResultBase & {
  text?: string;
  audio?: Uint8Array;
};

export type WakeWordInput = {
  audio: Uint8Array;
  wakeName?: string;
};

export type WakeWordResult = VoiceAdapterResultBase & {
  detected?: boolean;
  wakeName?: string;
  confidence?: number;
};

export type SpeechToTextAdapter = {
  providerId: string;
  transcribe: (
    input: SpeechToTextInput,
    context?: VoiceOperationContext,
  ) => Promise<SpeechToTextResult>;
  stop: (input?: VoiceStopInput) => Promise<VoiceAdapterResultBase>;
};

export type TextToSpeechAdapter = {
  providerId: string;
  speak: (
    input: TextToSpeechInput,
    context?: VoiceOperationContext,
  ) => Promise<TextToSpeechResult>;
  stop: (input?: VoiceStopInput) => Promise<VoiceAdapterResultBase>;
};

export type WakeWordAdapter = {
  providerId: string;
  detect: (
    input: WakeWordInput,
    context?: VoiceOperationContext,
  ) => Promise<WakeWordResult>;
  stop: (input?: VoiceStopInput) => Promise<VoiceAdapterResultBase>;
};

export type VoiceSessionAdapters = {
  speechToText?: SpeechToTextAdapter;
  textToSpeech?: TextToSpeechAdapter;
};

export type VoiceProviderKind = "speechToText" | "textToSpeech";

export type VoiceProviderAvailability = {
  providerId?: string;
  available: boolean;
  unavailableReason?: string;
};

export type VoiceSessionProviderAvailability = Record<
  VoiceProviderKind,
  VoiceProviderAvailability
>;

export type VoiceSessionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "unavailable"
  | "error"
  | "muted";

export type VoiceSessionRuntimeSnapshot = {
  state: VoiceSessionState;
  previousState?: Exclude<VoiceSessionState, "muted">;
  isMuted: boolean;
  providers: VoiceSessionProviderAvailability;
  activeProvider?: VoiceProviderKind;
  error?: VoiceAdapterError;
  interruptedReason?: string;
};

export type VoiceSessionRuntimeEvent =
  | { type: "start_listening" }
  | { type: "start_thinking" }
  | { type: "start_speaking" }
  | { type: "complete" }
  | { type: "interrupt"; reason?: string }
  | { type: "set_muted"; muted: boolean }
  | { type: "provider_unavailable"; provider: VoiceProviderKind; reason: string }
  | { type: "provider_failed"; provider: VoiceProviderKind; error: VoiceAdapterError }
  | { type: "recover" };

export class VoiceSessionTransitionError extends Error {
  constructor(
    readonly from: VoiceSessionState,
    readonly event: VoiceSessionRuntimeEvent["type"],
  ) {
    super(`Cannot apply voice session event ${event} from ${from}.`);
    this.name = "VoiceSessionTransitionError";
  }
}

const defaultUnavailableProviders: VoiceSessionProviderAvailability = {
  speechToText: {
    available: false,
    unavailableReason: "No speech-to-text provider is configured.",
  },
  textToSpeech: {
    available: false,
    unavailableReason: "No text-to-speech provider is configured.",
  },
};

export function voiceSessionProviderAvailabilityForAdapters(
  adapters: VoiceSessionAdapters,
): VoiceSessionProviderAvailability {
  return {
    speechToText: adapters.speechToText
      ? {
          providerId: adapters.speechToText.providerId,
          available: true,
        }
      : defaultUnavailableProviders.speechToText,
    textToSpeech: adapters.textToSpeech
      ? {
          providerId: adapters.textToSpeech.providerId,
          available: true,
        }
      : defaultUnavailableProviders.textToSpeech,
  };
}

export function createVoiceSessionRuntimeSnapshot(
  options: Partial<VoiceSessionRuntimeSnapshot> = {},
): VoiceSessionRuntimeSnapshot {
  return {
    state: options.state ?? "idle",
    isMuted: options.isMuted ?? false,
    providers: options.providers ?? defaultUnavailableProviders,
    previousState: options.previousState,
    activeProvider: options.activeProvider,
    error: options.error,
    interruptedReason: options.interruptedReason,
  };
}

export function providerUnavailableError(
  provider: VoiceProviderKind,
  providers: VoiceSessionProviderAvailability,
): VoiceAdapterError {
  return {
    code: `${provider}_unavailable`,
    message:
      providers[provider].unavailableReason ??
      `${provider} provider is unavailable.`,
    retryable: true,
  };
}

export function canTransitionVoiceSession(
  snapshot: VoiceSessionRuntimeSnapshot,
  event: VoiceSessionRuntimeEvent,
): boolean {
  try {
    transitionVoiceSession(snapshot, event);
    return true;
  } catch (error) {
    if (error instanceof VoiceSessionTransitionError) {
      return false;
    }

    throw error;
  }
}

export function transitionVoiceSession(
  snapshot: VoiceSessionRuntimeSnapshot,
  event: VoiceSessionRuntimeEvent,
): VoiceSessionRuntimeSnapshot {
  const base = {
    ...snapshot,
    error: undefined,
    interruptedReason: undefined,
  };

  if (event.type === "provider_unavailable") {
    return {
      ...base,
      state: "unavailable",
      activeProvider: event.provider,
      error: {
        code: `${event.provider}_unavailable`,
        message: event.reason,
        retryable: true,
      },
    };
  }

  if (event.type === "provider_failed") {
    return {
      ...base,
      state: "error",
      activeProvider: event.provider,
      error: event.error,
    };
  }

  if (event.type === "interrupt") {
    if (
      snapshot.state === "idle" ||
      (snapshot.state === "muted" &&
        (snapshot.previousState === undefined ||
          snapshot.previousState === "idle" ||
          snapshot.previousState === "interrupted" ||
          snapshot.previousState === "unavailable" ||
          snapshot.previousState === "error"))
    ) {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    return {
      ...base,
      state: "interrupted",
      activeProvider: snapshot.activeProvider,
      interruptedReason: event.reason,
    };
  }

  if (event.type === "set_muted") {
    if (event.muted) {
      if (snapshot.state === "muted") {
        return snapshot;
      }

      return {
        ...base,
        state: "muted",
        isMuted: true,
        previousState: snapshot.state,
      };
    }

    return {
      ...base,
      state:
        snapshot.state === "muted"
          ? snapshot.previousState ?? "idle"
          : snapshot.state,
      isMuted: false,
      previousState: undefined,
    };
  }

  if (event.type === "recover") {
    if (
      snapshot.state !== "interrupted" &&
      snapshot.state !== "unavailable" &&
      snapshot.state !== "error" &&
      snapshot.state !== "muted"
    ) {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    return {
      ...base,
      state: "idle",
      activeProvider: undefined,
      previousState: undefined,
      isMuted: snapshot.isMuted,
    };
  }

  if (event.type === "complete") {
    const canCompleteMutedSession =
      snapshot.state === "muted" &&
      (snapshot.previousState === "speaking" ||
        snapshot.previousState === "thinking");

    if (
      snapshot.state !== "speaking" &&
      snapshot.state !== "thinking" &&
      !canCompleteMutedSession
    ) {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    return {
      ...base,
      state: "idle",
      activeProvider: undefined,
      previousState: undefined,
    };
  }

  if (event.type === "start_listening") {
    if (snapshot.state !== "idle") {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    if (!snapshot.providers.speechToText.available) {
      return {
        ...base,
        state: "unavailable",
        activeProvider: "speechToText",
        error: providerUnavailableError("speechToText", snapshot.providers),
      };
    }

    return {
      ...base,
      state: "listening",
      activeProvider: "speechToText",
    };
  }

  if (event.type === "start_thinking") {
    if (snapshot.state !== "listening") {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    return {
      ...base,
      state: "thinking",
      activeProvider: undefined,
    };
  }

  if (event.type === "start_speaking") {
    if (snapshot.state !== "thinking") {
      throw new VoiceSessionTransitionError(snapshot.state, event.type);
    }

    if (!snapshot.providers.textToSpeech.available) {
      return {
        ...base,
        state: "unavailable",
        activeProvider: "textToSpeech",
        error: providerUnavailableError("textToSpeech", snapshot.providers),
      };
    }

    return {
      ...base,
      state: "speaking",
      activeProvider: "textToSpeech",
    };
  }

  throw new Error("Unhandled voice session event.");
}

export type AdapterDrivenVoiceSessionProgress = {
  runtime: VoiceSessionRuntimeSnapshot;
  transcript: string;
  responseText: string;
};

export type AdapterDrivenVoiceSessionResult =
  AdapterDrivenVoiceSessionProgress & {
    speechToTextResult?: SpeechToTextResult;
    textToSpeechResult?: TextToSpeechResult;
  };

export type AdapterDrivenVoiceSessionInput = {
  runtime?: VoiceSessionRuntimeSnapshot;
  adapters: VoiceSessionAdapters;
  audio?: Uint8Array;
  context?: VoiceOperationContext;
  isSessionActive?: () => boolean;
  responseTextForTranscript?: (transcript: string) => string;
  onProgress?: (progress: AdapterDrivenVoiceSessionProgress) => void;
};

function defaultVoiceResponseTextForTranscript(transcript: string): string {
  return transcript
    ? `Voice input captured: ${transcript}`
    : "Voice input captured, but no transcript text was returned.";
}

function failedVoiceAdapterEvent(
  provider: VoiceProviderKind,
  result: VoiceAdapterResultBase,
): VoiceSessionRuntimeEvent {
  return {
    type: "provider_failed",
    provider,
    error: result.error ?? {
      code: `${provider}_failed`,
      message: `${provider} provider failed.`,
      retryable: true,
    },
  };
}

function isAdapterAbortResult(result: VoiceAdapterResultBase): boolean {
  return (
    result.status === "stopped" &&
    result.error?.code === "operation_aborted"
  );
}

function unknownSpeechToTextFailure(
  provider: VoiceProviderKind,
  error: unknown,
  providerId: string,
): SpeechToTextResult {
  const message = error instanceof Error ? error.message : "Provider failed.";

  return {
    providerId,
    status: "failed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: {
      code: `${provider}_exception`,
      message,
      retryable: true,
    },
  };
}

function unknownTextToSpeechFailure(
  provider: VoiceProviderKind,
  error: unknown,
  providerId: string,
): TextToSpeechResult {
  const message = error instanceof Error ? error.message : "Provider failed.";

  return {
    providerId,
    status: "failed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: {
      code: `${provider}_exception`,
      message,
      retryable: true,
    },
  };
}

export async function runAdapterDrivenVoiceSession({
  runtime,
  adapters,
  audio = new Uint8Array(),
  context,
  isSessionActive,
  responseTextForTranscript = defaultVoiceResponseTextForTranscript,
  onProgress,
}: AdapterDrivenVoiceSessionInput): Promise<AdapterDrivenVoiceSessionResult> {
  let currentRuntime = createVoiceSessionRuntimeSnapshot({
    ...(runtime ?? {}),
    providers: voiceSessionProviderAvailabilityForAdapters(adapters),
  });
  let transcript = "";
  let responseText = "";
  const progress = (
    nextRuntime: VoiceSessionRuntimeSnapshot,
  ): VoiceSessionRuntimeSnapshot => {
    currentRuntime = nextRuntime;
    onProgress?.({
      runtime: currentRuntime,
      transcript,
      responseText,
    });

    return currentRuntime;
  };
  const sessionStillActive = () =>
    context?.signal?.aborted !== true && (isSessionActive?.() ?? true);
  const interruptIfInactive = (): boolean => {
    if (sessionStillActive()) {
      return false;
    }

    progress(
      transitionVoiceSession(currentRuntime, {
        type: "interrupt",
        reason: "session_cancelled",
      }),
    );

    return true;
  };

  progress(transitionVoiceSession(currentRuntime, { type: "start_listening" }));

  if (currentRuntime.state !== "listening" || !adapters.speechToText) {
    return {
      runtime: currentRuntime,
      transcript,
      responseText,
    };
  }

  const speechToTextResult = await adapters.speechToText
    .transcribe({ audio }, context)
    .catch((error) =>
      unknownSpeechToTextFailure(
        "speechToText",
        error,
        adapters.speechToText!.providerId,
      ),
    );

  if (isAdapterAbortResult(speechToTextResult)) {
    progress(
      transitionVoiceSession(currentRuntime, {
        type: "interrupt",
        reason: "session_cancelled",
      }),
    );

    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
    };
  }

  if (speechToTextResult.status === "failed" || speechToTextResult.error) {
    progress(
      transitionVoiceSession(
        currentRuntime,
        failedVoiceAdapterEvent("speechToText", speechToTextResult),
      ),
    );

    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
    };
  }

  transcript = speechToTextResult.transcript ?? "";
  if (interruptIfInactive()) {
    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
    };
  }

  progress(transitionVoiceSession(currentRuntime, { type: "start_thinking" }));
  responseText = responseTextForTranscript(transcript);
  if (interruptIfInactive()) {
    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
    };
  }

  const speakingRuntime = progress(
    transitionVoiceSession(currentRuntime, { type: "start_speaking" }),
  );

  if (speakingRuntime.state !== "speaking" || !adapters.textToSpeech) {
    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
    };
  }

  const textToSpeechResult = await adapters.textToSpeech
    .speak({ text: responseText }, context)
    .catch((error) =>
      unknownTextToSpeechFailure(
        "textToSpeech",
        error,
        adapters.textToSpeech!.providerId,
      ),
    );

  if (isAdapterAbortResult(textToSpeechResult)) {
    progress(
      transitionVoiceSession(currentRuntime, {
        type: "interrupt",
        reason: "session_cancelled",
      }),
    );

    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
      textToSpeechResult,
    };
  }

  if (textToSpeechResult.status === "failed" || textToSpeechResult.error) {
    progress(
      transitionVoiceSession(
        currentRuntime,
        failedVoiceAdapterEvent("textToSpeech", textToSpeechResult),
      ),
    );

    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
      textToSpeechResult,
    };
  }

  if (interruptIfInactive()) {
    return {
      runtime: currentRuntime,
      transcript,
      responseText,
      speechToTextResult,
      textToSpeechResult,
    };
  }

  progress(transitionVoiceSession(currentRuntime, { type: "complete" }));

  return {
    runtime: currentRuntime,
    transcript,
    responseText,
    speechToTextResult,
    textToSpeechResult,
  };
}

type MockAdapterOptions = {
  providerId?: string;
  now?: () => string;
  failure?: string;
};

type MockSpeechToTextOptions = MockAdapterOptions & {
  transcript?: string;
};

type MockTextToSpeechOptions = MockAdapterOptions & {
  audio?: Uint8Array;
};

type MockWakeWordOptions = MockAdapterOptions & {
  detected?: boolean;
  wakeName?: string;
  confidence?: number;
};

const defaultMockTimestamp = "2026-01-01T00:00:00.000Z";

function defaultNow() {
  return defaultMockTimestamp;
}

function failedResult(
  providerId: string,
  message: string,
  startedAt: string,
): VoiceAdapterResultBase {
  return {
    status: "failed",
    providerId,
    error: {
      code: "mock_failure",
      message,
      retryable: false,
    },
    startedAt,
    completedAt: startedAt,
  };
}

function stoppedResult(
  providerId: string,
  startedAt: string,
): VoiceAdapterResultBase {
  return {
    status: "stopped",
    providerId,
    startedAt,
    completedAt: startedAt,
  };
}

function abortedResult(
  providerId: string,
  startedAt: string,
): VoiceAdapterResultBase {
  return {
    ...stoppedResult(providerId, startedAt),
    error: {
      code: "operation_aborted",
      message: "Voice operation was interrupted.",
      retryable: true,
    },
  };
}

function isAborted(context?: VoiceOperationContext) {
  return context?.signal?.aborted === true;
}

export function createMockSpeechToTextAdapter(
  options: MockSpeechToTextOptions = {},
): SpeechToTextAdapter {
  const providerId = options.providerId ?? "mock-stt";
  const now = options.now ?? defaultNow;

  return {
    providerId,
    async transcribe(_input, context) {
      const startedAt = now();

      if (isAborted(context)) {
        return abortedResult(providerId, startedAt);
      }

      if (options.failure) {
        return failedResult(providerId, options.failure, startedAt);
      }

      return {
        status: "stopped",
        transcript: options.transcript ?? "Mock transcription",
        providerId,
        startedAt,
        completedAt: startedAt,
      };
    },
    async stop() {
      return stoppedResult(providerId, now());
    },
  };
}

export function createMockTextToSpeechAdapter(
  options: MockTextToSpeechOptions = {},
): TextToSpeechAdapter {
  const providerId = options.providerId ?? "mock-tts";
  const now = options.now ?? defaultNow;

  return {
    providerId,
    async speak(input, context) {
      const startedAt = now();

      if (isAborted(context)) {
        return abortedResult(providerId, startedAt);
      }

      if (options.failure) {
        return failedResult(providerId, options.failure, startedAt);
      }

      return {
        status: "stopped",
        providerId,
        text: input.text,
        audio: options.audio ?? new TextEncoder().encode(input.text),
        startedAt,
        completedAt: startedAt,
      };
    },
    async stop() {
      return stoppedResult(providerId, now());
    },
  };
}

export function createMockWakeWordAdapter(
  options: MockWakeWordOptions = {},
): WakeWordAdapter {
  const providerId = options.providerId ?? "mock-wake-word";
  const now = options.now ?? defaultNow;

  return {
    providerId,
    async detect(input, context) {
      const startedAt = now();

      if (isAborted(context)) {
        return abortedResult(providerId, startedAt);
      }

      if (options.failure) {
        return failedResult(providerId, options.failure, startedAt);
      }

      return {
        status: "stopped",
        providerId,
        detected: options.detected ?? false,
        wakeName: options.wakeName ?? input.wakeName,
        confidence: options.confidence ?? (options.detected ? 1 : 0),
        startedAt,
        completedAt: startedAt,
      };
    },
    async stop() {
      return stoppedResult(providerId, now());
    },
  };
}
