export type VoiceRuntimeOperationContext = {
  signal?: AbortSignal;
};

export type VoiceRuntimeStopInput = {
  reason?: string;
};

export type VoiceRuntimeAdapterError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type VoiceProviderAvailabilityInput = {
  activationSource: "voice" | "text";
  outputMode: "audible" | "muted";
};

export type VoiceProviderAvailabilityResult =
  | {
      status: "available";
      providerId: string;
    }
  | {
      status: "unavailable";
      providerId: string;
      reason: string;
    }
  | {
      status: "error";
      providerId: string;
      error: VoiceRuntimeAdapterError;
    };

export type VoiceProviderAvailabilityAdapter = {
  check: (
    input: VoiceProviderAvailabilityInput,
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceProviderAvailabilityResult>;
};

export type VoiceRuntimeAdapterSuccess<TPayload extends object = object> = {
  status: "success";
  providerId: string;
} & TPayload;

export type VoiceRuntimeAdapterFailure = {
  status: "failed";
  providerId: string;
  error: VoiceRuntimeAdapterError;
};

export type VoiceRuntimeAdapterResult<TPayload extends object = object> =
  | VoiceRuntimeAdapterSuccess<TPayload>
  | VoiceRuntimeAdapterFailure;

export type VoiceMicrophoneInputAdapter = {
  capture: (
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceRuntimeAdapterResult<{ audio: Uint8Array }>>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type VoiceSpeechToTextAdapter = {
  transcribe: (
    input: { audio: Uint8Array },
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceRuntimeAdapterResult<{ transcript: string }>>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type VoiceResponseGenerationAdapter = {
  generate: (
    input: { transcript: string; activationSource: "voice" | "text" },
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceRuntimeAdapterResult<{ text: string }>>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type VoiceTextToSpeechAdapter = {
  synthesize: (
    input: { text: string },
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceRuntimeAdapterResult<{ audio: Uint8Array }>>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type VoiceAudioPlaybackAdapter = {
  play: (
    input: { audio: Uint8Array },
    context?: VoiceRuntimeOperationContext,
  ) => Promise<VoiceRuntimeAdapterResult>;
  stop: (input?: VoiceRuntimeStopInput) => Promise<void>;
};

export type VoiceSessionAdapters = {
  availability: VoiceProviderAvailabilityAdapter;
  microphone: VoiceMicrophoneInputAdapter;
  speechToText: VoiceSpeechToTextAdapter;
  responseGeneration: VoiceResponseGenerationAdapter;
  textToSpeech: VoiceTextToSpeechAdapter;
  playback: VoiceAudioPlaybackAdapter;
};

export function voiceRuntimeError(
  code: string,
  message: string,
  retryable: boolean,
): VoiceRuntimeAdapterError {
  return {
    code,
    message,
    retryable,
  };
}
