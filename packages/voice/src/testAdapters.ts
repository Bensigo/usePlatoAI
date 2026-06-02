import type {
  VoiceAudioPlaybackAdapter,
  VoiceMicrophoneInputAdapter,
  VoiceProviderAvailabilityResult,
  VoiceResponseGenerationAdapter,
  VoiceSessionAdapters,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
} from "./adapters";
import { voiceRuntimeError } from "./adapters";

type TestAdaptersOptions = {
  availability?: VoiceProviderAvailabilityResult;
  capturedAudio?: Uint8Array;
  transcript?: string;
  generatedResponse?: string;
  speechAudio?: Uint8Array;
  captureDelayMs?: number;
  captureIgnoresAbort?: boolean;
  sttError?: string;
};

type CallWaiter = {
  label: string;
  resolve: () => void;
};

export type VoiceSessionTestAdapters = VoiceSessionAdapters & {
  calls: string[];
  lastPlaybackAudio: Uint8Array | null;
  waitForCall: (label: string) => Promise<void>;
};

const defaultAvailability = {
  status: "available",
  providerId: "test-voice-stack",
} as const satisfies VoiceProviderAvailabilityResult;

function successful<TPayload extends object>(payload: TPayload) {
  return {
    status: "success",
    providerId: "test-provider",
    ...payload,
  } as const;
}

function failed(message: string) {
  return {
    status: "failed",
    providerId: "test-provider",
    error: voiceRuntimeError("provider_error", message, false),
  } as const;
}

function waitForDelay(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function createVoiceSessionTestAdapters(
  options: TestAdaptersOptions = {},
): VoiceSessionTestAdapters {
  const calls: string[] = [];
  const waiters: CallWaiter[] = [];
  let lastPlaybackAudio: Uint8Array | null = null;

  function record(label: string) {
    calls.push(label);

    for (const waiter of waiters.filter((candidate) => candidate.label === label)) {
      waiter.resolve();
    }
  }

  function waitForCall(label: string) {
    if (calls.includes(label)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      waiters.push({ label, resolve });
    });
  }

  const microphone: VoiceMicrophoneInputAdapter = {
    async capture(context) {
      record("microphone.capture");
      await waitForDelay(
        options.captureDelayMs ?? 0,
        options.captureIgnoresAbort ? undefined : context?.signal,
      );
      return successful({
        audio: options.capturedAudio ?? new Uint8Array([1]),
      });
    },
    async stop(input) {
      record(`microphone.stop:${input?.reason ?? "stop"}`);
    },
  };

  const speechToText: VoiceSpeechToTextAdapter = {
    async transcribe() {
      record("stt.transcribe");

      if (options.sttError) {
        return failed(options.sttError);
      }

      return successful({
        transcript: options.transcript ?? "Test transcript",
      });
    },
    async stop(input) {
      record(`stt.stop:${input?.reason ?? "stop"}`);
    },
  };

  const responseGeneration: VoiceResponseGenerationAdapter = {
    async generate() {
      record("response.generate");
      return successful({
        text: options.generatedResponse ?? "Test response",
      });
    },
    async stop(input) {
      record(`response.stop:${input?.reason ?? "stop"}`);
    },
  };

  const textToSpeech: VoiceTextToSpeechAdapter = {
    async synthesize() {
      record("tts.synthesize");
      return successful({
        audio: options.speechAudio ?? new Uint8Array([2]),
      });
    },
    async stop(input) {
      record(`tts.stop:${input?.reason ?? "stop"}`);
    },
  };

  const playback: VoiceAudioPlaybackAdapter = {
    async play(input) {
      record("playback.play");
      lastPlaybackAudio = input.audio;
      return successful({});
    },
    async stop(input) {
      record(`playback.stop:${input?.reason ?? "stop"}`);
    },
  };

  return {
    availability: {
      async check(input) {
        record(
          `availability.check:${input.activationSource}:${input.outputMode}`,
        );
        return options.availability ?? defaultAvailability;
      },
    },
    microphone,
    speechToText,
    responseGeneration,
    textToSpeech,
    playback,
    calls,
    get lastPlaybackAudio() {
      return lastPlaybackAudio;
    },
    waitForCall,
  };
}
