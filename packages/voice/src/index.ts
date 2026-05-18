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
