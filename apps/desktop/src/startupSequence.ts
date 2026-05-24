import {
  avatarIdleWavePolicy,
  avatarLaunchSequence,
  avatarStartupSound,
  millisecondsUntilNextAvatarIdleWave,
  type AvatarCompanionState,
} from "./avatarSurface";
import {
  markAudioActivationResult,
  playComingOnlineSound,
  type AudioActivationSnapshot,
  type ComingOnlineSoundResult,
} from "./audioActivation";
import type { CompanionPresenceState } from "./presenceState";

export type StartupSequenceStorage = Pick<Storage, "getItem" | "setItem">;

export type StartupPresenceState = CompanionPresenceState | null;

export type StartupSequenceStep = {
  delayMs: number;
  state: CompanionPresenceState;
};

export const startupSoundReplayStorageKey = `useplatoai:${avatarStartupSound.id}:startup-sound-attempted`;

export const startupPresenceTimeline = [
  ...avatarLaunchSequence.map((step) => ({
    delayMs: step.delayMs,
    state: step.presenceState as CompanionPresenceState,
  })),
] as const satisfies readonly StartupSequenceStep[];

export const startupPresenceReleaseDelayMs = 1680;

export function startupCompanionStateForPresenceState(
  state: StartupPresenceState,
): AvatarCompanionState | null {
  if (state === null) {
    return null;
  }

  return (
    avatarLaunchSequence.find((step) => step.presenceState === state)
      ?.companionState ?? null
  );
}

export function millisecondsUntilNextStartupIdleWave({
  renderedPresenceState,
  nowMs,
  lastWaveAtMs,
}: {
  renderedPresenceState: string;
  nowMs: number;
  lastWaveAtMs: number | null;
}) {
  return millisecondsUntilNextAvatarIdleWave({
    presenceState: renderedPresenceState,
    nowMs,
    lastWaveAtMs,
  });
}

export const startupIdleWaveDurationMs = avatarIdleWavePolicy.waveDurationMs;

let startupSoundAttemptedInRuntime = false;

function browserSessionStorage(): StartupSequenceStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function hasStartupSoundAttempted({
  storage = browserSessionStorage(),
}: {
  storage?: StartupSequenceStorage;
} = {}) {
  if (startupSoundAttemptedInRuntime) {
    return true;
  }

  try {
    return storage?.getItem(startupSoundReplayStorageKey) === "true";
  } catch {
    return false;
  }
}

export function markStartupSoundAttempted({
  storage = browserSessionStorage(),
}: {
  storage?: StartupSequenceStorage;
} = {}) {
  if (hasStartupSoundAttempted({ storage })) {
    return false;
  }

  startupSoundAttemptedInRuntime = true;

  try {
    storage?.setItem(startupSoundReplayStorageKey, "true");
  } catch {
    // In-memory guard still prevents renderer remount replay.
  }

  return true;
}

export function resetStartupSoundReplayGuardForTests() {
  startupSoundAttemptedInRuntime = false;
}

export function runStartupCompanionSequence({
  setPresenceState,
  setAudioActivationSnapshot,
  playSound = playComingOnlineSound,
  storage,
}: {
  setPresenceState: (state: StartupPresenceState) => void;
  setAudioActivationSnapshot: (
    updater: (snapshot: AudioActivationSnapshot) => AudioActivationSnapshot,
  ) => void;
  playSound?: () => Promise<ComingOnlineSoundResult>;
  storage?: StartupSequenceStorage;
}) {
  let isCancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  if (markStartupSoundAttempted({ storage })) {
    void playSound().then((result) => {
      if (isCancelled) {
        return;
      }

      setAudioActivationSnapshot((snapshot) =>
        markAudioActivationResult(snapshot, result),
      );
    });
  }

  for (const step of startupPresenceTimeline) {
    if (step.delayMs === 0) {
      setPresenceState(step.state);
      continue;
    }

    timers.push(
      setTimeout(() => {
        if (!isCancelled) {
          setPresenceState(step.state);
        }
      }, step.delayMs),
    );
  }

  timers.push(
    setTimeout(() => {
      if (!isCancelled) {
        setPresenceState(null);
      }
    }, startupPresenceReleaseDelayMs),
  );

  return () => {
    isCancelled = true;

    for (const timer of timers) {
      clearTimeout(timer);
    }
  };
}
