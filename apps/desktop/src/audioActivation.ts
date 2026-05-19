export type AudioActivationState =
  | "inactive"
  | "muted"
  | "active"
  | "unavailable"
  | "error";

export type AudioActivationSnapshot = {
  state: AudioActivationState;
  statusLabel: string;
  detail: string;
  startupSoundPlayed: boolean;
  lastError: string | null;
};

export type ComingOnlineSoundResult =
  | { ok: true }
  | { ok: false; state: "unavailable" | "error"; message: string };

export type AudioContextLike = {
  currentTime: number;
  destination: AudioNode;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createGain: () => GainNode;
  createOscillator: () => OscillatorNode;
};

export type AudioContextConstructorLike = new () => AudioContextLike;

export const audioActivationStates = [
  "muted",
  "active",
  "unavailable",
  "error",
] as const;

export function audioActivationStateFrom(
  value: string | null,
): AudioActivationState | undefined {
  if (value === "inactive") {
    return value;
  }

  if (audioActivationStates.some((state) => state === value)) {
    return value as AudioActivationState;
  }

  return undefined;
}

export function createAudioActivationSnapshot(): AudioActivationSnapshot {
  return {
    state: "inactive",
    statusLabel: "Audio waits for activation",
    detail: "No passive listening. Click Plato or use voice controls to enable audio.",
    startupSoundPlayed: false,
    lastError: null,
  };
}

export function audioActivationSnapshotForState(
  state: AudioActivationState,
): AudioActivationSnapshot {
  const base = createAudioActivationSnapshot();

  switch (state) {
    case "muted":
      return setAudioActivationMuted(base, true);
    case "active":
      return markAudioActivationResult(base, { ok: true });
    case "unavailable":
      return markAudioActivationResult(base, {
        ok: false,
        state: "unavailable",
        message: "This runtime does not expose Web Audio.",
      });
    case "error":
      return markAudioActivationResult(base, {
        ok: false,
        state: "error",
        message: "Audio activation failed before playback.",
      });
    case "inactive":
      return base;
  }
}

export function setAudioActivationMuted(
  snapshot: AudioActivationSnapshot,
  isMuted: boolean,
): AudioActivationSnapshot {
  if (isMuted) {
    return {
      ...snapshot,
      state: "muted",
      statusLabel: "Audio muted",
      detail: "Spoken output stays off; text fallback remains visible.",
      lastError: null,
    };
  }

  return {
    ...snapshot,
    state: snapshot.startupSoundPlayed ? "active" : "inactive",
    statusLabel: snapshot.startupSoundPlayed
      ? "Audio active"
      : "Audio waits for activation",
    detail: snapshot.startupSoundPlayed
      ? "Audio was enabled by an explicit action."
      : "No passive listening. Click Plato or use voice controls to enable audio.",
    lastError: null,
  };
}

export function markAudioActivationResult(
  snapshot: AudioActivationSnapshot,
  result: ComingOnlineSoundResult,
): AudioActivationSnapshot {
  if (result.ok) {
    return {
      ...snapshot,
      state: "active",
      statusLabel: "Audio active",
      detail: "Coming-online sound completed from an explicit app action.",
      startupSoundPlayed: true,
      lastError: null,
    };
  }

  return {
    ...snapshot,
    state: result.state,
    statusLabel:
      result.state === "unavailable" ? "Audio unavailable" : "Audio error",
    detail: result.message,
    lastError: result.message,
  };
}

export function audioActivationStateLabel(state: AudioActivationState): string {
  switch (state) {
    case "muted":
      return "Muted";
    case "active":
      return "Active";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
    case "inactive":
      return "Inactive";
  }
}

export function browserAudioContextConstructor():
  | AudioContextConstructorLike
  | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    window.AudioContext ??
    (window as typeof window & {
      webkitAudioContext?: AudioContextConstructorLike;
    }).webkitAudioContext
  );
}

export async function playComingOnlineSound({
  AudioContextConstructor = browserAudioContextConstructor(),
  durationMs = 220,
}: {
  AudioContextConstructor?: AudioContextConstructorLike;
  durationMs?: number;
} = {}): Promise<ComingOnlineSoundResult> {
  if (!AudioContextConstructor) {
    return {
      ok: false,
      state: "unavailable",
      message: "This runtime does not expose Web Audio.",
    };
  }

  let context: AudioContextLike | undefined;

  try {
    context = new AudioContextConstructor();
    await context.resume?.();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    const durationSeconds = durationMs / 1000;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(392, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      523.25,
      start + durationSeconds,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + durationSeconds);

    globalThis.setTimeout(() => {
      void context?.close?.();
    }, durationMs + 80);

    return { ok: true };
  } catch (error) {
    await context?.close?.().catch(() => undefined);

    return {
      ok: false,
      state: "error",
      message:
        error instanceof Error
          ? error.message
          : "Audio activation failed before playback.",
    };
  }
}
