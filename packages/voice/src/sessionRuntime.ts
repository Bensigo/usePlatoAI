import type {
  VoiceRuntimeAdapterError,
  VoiceRuntimeAdapterFailure,
  VoiceRuntimeAdapterResult,
  VoiceRuntimeOperationContext,
  VoiceRuntimeStopInput,
  VoiceSessionAdapters,
} from "./adapters";
import { voiceRuntimeError } from "./adapters";
import { voiceSessionStateToAvatarState, type VoiceAvatarState } from "./avatarMapping";

export const voiceSessionStates = [
  "idle",
  "listening",
  "transcribing",
  "thinking",
  "speaking",
  "interrupted",
  "error",
  "unavailable",
  "muted",
] as const;

export type VoiceSessionState = (typeof voiceSessionStates)[number];
export type VoiceActivationSource = "voice" | "text";

export type VoiceSessionSnapshot = {
  state: VoiceSessionState;
  activationSource: VoiceActivationSource;
  isMuted: boolean;
  transcript: string;
  responseText: string;
  error: VoiceRuntimeAdapterError | null;
  avatarState: VoiceAvatarState;
};

export type VoiceSessionRuntime = {
  getSnapshot: () => VoiceSessionSnapshot;
  subscribe: (listener: (snapshot: VoiceSessionSnapshot) => void) => () => void;
  startVoice: () => Promise<VoiceSessionSnapshot>;
  submitTextFallback: (text: string) => Promise<VoiceSessionSnapshot>;
  interrupt: (reason?: string) => Promise<VoiceSessionSnapshot>;
  setMuted: (isMuted: boolean) => VoiceSessionSnapshot;
};

export type CreateVoiceSessionRuntimeInput = {
  adapters: VoiceSessionAdapters;
};

type MutableVoiceSessionSnapshot = Omit<VoiceSessionSnapshot, "avatarState">;

const activeVoiceStates = new Set<VoiceSessionState>([
  "listening",
  "transcribing",
  "thinking",
  "speaking",
]);

const defaultSnapshot: MutableVoiceSessionSnapshot = {
  state: "idle",
  activationSource: "voice",
  isMuted: false,
  transcript: "",
  responseText: "",
  error: null,
};

class VoiceSessionInterruptedError extends Error {
  constructor() {
    super("Voice session was interrupted.");
  }
}

function snapshotWithAvatarState(
  snapshot: MutableVoiceSessionSnapshot,
): VoiceSessionSnapshot {
  return {
    ...snapshot,
    avatarState: voiceSessionStateToAvatarState(snapshot.state),
  };
}

function isActiveVoiceState(state: VoiceSessionState) {
  return activeVoiceStates.has(state);
}

function isAbortError(error: unknown) {
  return (
    error instanceof VoiceSessionInterruptedError ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function assertNotAborted(context: VoiceRuntimeOperationContext) {
  if (context.signal?.aborted) {
    throw new VoiceSessionInterruptedError();
  }
}

function failureFromUnknown(error: unknown): VoiceRuntimeAdapterError {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return voiceRuntimeError("provider_error", error.message, false);
  }

  return voiceRuntimeError("provider_error", "Voice provider failed.", false);
}

function isVoiceRuntimeAdapterError(
  error: unknown,
): error is VoiceRuntimeAdapterError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "retryable" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.retryable === "boolean"
  );
}

function failureFromAdapter(
  result: VoiceRuntimeAdapterFailure,
): VoiceRuntimeAdapterError {
  if (result.error.code === "operation_aborted") {
    return result.error;
  }

  return {
    ...result.error,
    code:
      result.error.code === "provider_error"
        ? result.error.code
        : "provider_error",
  };
}

function requireSuccess<TPayload extends object>(
  result: VoiceRuntimeAdapterResult<TPayload>,
): TPayload {
  if (result.status === "success") {
    const { status: _status, providerId: _providerId, ...payload } = result;
    return payload as TPayload;
  }

  if (result.error.code === "operation_aborted") {
    throw new VoiceSessionInterruptedError();
  }

  throw failureFromAdapter(result);
}

export function voiceSessionStateFrom(
  value: string | null,
): VoiceSessionState | undefined {
  return voiceSessionStates.find((state) => state === value);
}

export function createVoiceSessionRuntime({
  adapters,
}: CreateVoiceSessionRuntimeInput): VoiceSessionRuntime {
  let snapshot = defaultSnapshot;
  let activeController: AbortController | null = null;
  let activeRunId = 0;
  const interruptedRunIds = new Set<number>();
  const listeners = new Set<(snapshot: VoiceSessionSnapshot) => void>();

  function emit(nextSnapshot: Partial<MutableVoiceSessionSnapshot>) {
    snapshot = {
      ...snapshot,
      ...nextSnapshot,
    };
    const publicSnapshot = snapshotWithAvatarState(snapshot);

    for (const listener of listeners) {
      listener(publicSnapshot);
    }

    return publicSnapshot;
  }

  function getSnapshot() {
    return snapshotWithAvatarState(snapshot);
  }

  function canStartFromCurrentState() {
    if (activeController) {
      return false;
    }

    return (
      snapshot.state === "idle" ||
      snapshot.state === "muted" ||
      snapshot.state === "interrupted" ||
      snapshot.state === "error" ||
      snapshot.state === "unavailable"
    );
  }

  function assertCurrentRun(
    runId: number,
    context: VoiceRuntimeOperationContext,
  ) {
    assertNotAborted(context);

    if (activeRunId !== runId) {
      throw new VoiceSessionInterruptedError();
    }
  }

  async function checkAvailability(
    runId: number,
    context: VoiceRuntimeOperationContext,
  ) {
    const availability = await adapters.availability.check(context);
    assertCurrentRun(runId, context);

    if (availability.status === "available") {
      return true;
    }

    if (availability.status === "unavailable") {
      emit({
        state: "unavailable",
        error: voiceRuntimeError(
          "provider_unavailable",
          availability.reason,
          true,
        ),
      });
      return false;
    }

    emit({
      state: "error",
      error: availability.error,
    });
    return false;
  }

  async function stopAdapters(input: VoiceRuntimeStopInput) {
    await Promise.allSettled([
      adapters.microphone.stop(input),
      adapters.speechToText.stop(input),
      adapters.responseGeneration.stop(input),
      adapters.textToSpeech.stop(input),
      adapters.playback.stop(input),
    ]);
  }

  function markInterrupted(runId: number) {
    interruptedRunIds.add(runId);
    emit({
      state: "interrupted",
      error: voiceRuntimeError(
        "operation_aborted",
        "Voice operation was interrupted.",
        true,
      ),
    });
    emit({
      state: snapshot.isMuted ? "muted" : "idle",
      error: null,
    });
  }

  async function runWithController(
    runner: (
      context: VoiceRuntimeOperationContext,
      runId: number,
    ) => Promise<void>,
  ) {
    if (!canStartFromCurrentState()) {
      throw new Error(
        activeController
          ? "voice session cannot start while another session is active"
          : `voice session cannot start from ${snapshot.state}`,
      );
    }

    const runId = activeRunId + 1;
    const controller = new AbortController();
    const context = { signal: controller.signal };
    activeRunId = runId;
    activeController = controller;

    try {
      const isAvailable = await checkAvailability(runId, context);
      assertCurrentRun(runId, context);

      if (!isAvailable) {
        return getSnapshot();
      }

      await runner(context, runId);
      assertCurrentRun(runId, context);
    } catch (error) {
      if (isAbortError(error) || interruptedRunIds.has(runId)) {
        return getSnapshot();
      }

      emit({
        state: "error",
        error: isVoiceRuntimeAdapterError(error)
          ? error
          : failureFromUnknown(error),
      });
    } finally {
      interruptedRunIds.delete(runId);
      if (activeRunId === runId) {
        activeController = null;
      }
    }

    return getSnapshot();
  }

  async function startVoice() {
    return runWithController(async (context, runId) => {
      emit({
        state: "listening",
        activationSource: "voice",
        transcript: "",
        responseText: "",
        error: null,
      });

      const captured = requireSuccess(await adapters.microphone.capture(context));

      assertCurrentRun(runId, context);
      emit({ state: "transcribing" });

      const transcribed = requireSuccess(
        await adapters.speechToText.transcribe(
          { audio: captured.audio },
          context,
        ),
      );

      assertCurrentRun(runId, context);
      emit({
        state: "thinking",
        transcript: transcribed.transcript,
      });

      await completeResponse(transcribed.transcript, "voice", context, runId);
    });
  }

  async function completeResponse(
    transcript: string,
    activationSource: VoiceActivationSource,
    context: VoiceRuntimeOperationContext,
    runId: number,
  ) {
    const response = requireSuccess(
      await adapters.responseGeneration.generate(
        { transcript, activationSource },
        context,
      ),
    );

    assertCurrentRun(runId, context);
    emit({
      responseText: response.text,
    });

    if (snapshot.isMuted) {
      emit({ state: "muted" });
      return;
    }

    const speech = requireSuccess(
      await adapters.textToSpeech.synthesize({ text: response.text }, context),
    );

    assertCurrentRun(runId, context);
    emit({ state: "speaking" });

    requireSuccess(await adapters.playback.play({ audio: speech.audio }, context));

    assertCurrentRun(runId, context);
    emit({ state: "idle" });
  }

  async function submitTextFallback(text: string) {
    const trimmedText = text.trim();

    if (!trimmedText) {
      emit({
        state: "error",
        error: voiceRuntimeError(
          "empty_text_fallback",
          "Text fallback cannot be empty.",
          false,
        ),
      });
      return getSnapshot();
    }

    return runWithController(async (context, runId) => {
      emit({
        state: "thinking",
        activationSource: "text",
        transcript: trimmedText,
        responseText: "",
        error: null,
      });

      await completeResponse(trimmedText, "text", context, runId);
    });
  }

  async function interrupt(reason = "user_interrupt") {
    if (!activeController) {
      return getSnapshot();
    }

    const runId = activeRunId;
    activeController.abort();
    activeController = null;
    activeRunId = runId + 1;
    await stopAdapters({ reason });
    markInterrupted(runId);
    return getSnapshot();
  }

  function setMuted(isMuted: boolean) {
    if (snapshot.isMuted === isMuted) {
      return getSnapshot();
    }

    if (isMuted) {
      if (isActiveVoiceState(snapshot.state)) {
        void interrupt("muted");
      }

      return emit({
        isMuted,
        state: "muted",
        error: null,
      });
    }

    return emit({
      isMuted,
      state: snapshot.state === "muted" ? "idle" : snapshot.state,
      error: null,
    });
  }

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startVoice,
    submitTextFallback,
    interrupt,
    setMuted,
  };
}
