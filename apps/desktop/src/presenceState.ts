export const companionPresenceStates = [
  "appearing",
  "idle",
  "listening",
  "thinking",
  "speaking",
  "focused",
  "happy",
  "confused",
  "waiting_for_approval",
  "waitingApproval",
  "muted",
  "error",
  "task_running",
  "task_paused",
  "sleeping",
] as const;

export type CompanionPresenceState = (typeof companionPresenceStates)[number];

export type PresenceRendererHint =
  | "resting"
  | "attentive"
  | "processing"
  | "talking"
  | "focused"
  | "positive"
  | "uncertain"
  | "approval"
  | "muted"
  | "error"
  | "working"
  | "paused"
  | "quiet";

export type PresenceStateSnapshot = {
  state: CompanionPresenceState;
  label: string;
  rendererHint: PresenceRendererHint;
};

export type PresenceStateSource = {
  getSnapshot: () => PresenceStateSnapshot;
  setState: (nextState: unknown) => PresenceStateSnapshot;
  subscribe: (listener: () => void) => () => void;
};

const presenceStateSnapshots: Record<
  CompanionPresenceState,
  PresenceStateSnapshot
> = {
  idle: {
    state: "idle",
    label: "Idle presence",
    rendererHint: "resting",
  },
  appearing: {
    state: "appearing",
    label: "Coming online",
    rendererHint: "attentive",
  },
  listening: {
    state: "listening",
    label: "Listening",
    rendererHint: "attentive",
  },
  thinking: {
    state: "thinking",
    label: "Thinking",
    rendererHint: "processing",
  },
  speaking: {
    state: "speaking",
    label: "Speaking",
    rendererHint: "talking",
  },
  focused: {
    state: "focused",
    label: "Focused",
    rendererHint: "focused",
  },
  happy: {
    state: "happy",
    label: "Happy",
    rendererHint: "positive",
  },
  confused: {
    state: "confused",
    label: "Confused",
    rendererHint: "uncertain",
  },
  waiting_for_approval: {
    state: "waiting_for_approval",
    label: "Waiting for approval",
    rendererHint: "approval",
  },
  waitingApproval: {
    state: "waitingApproval",
    label: "Waiting for approval",
    rendererHint: "approval",
  },
  muted: {
    state: "muted",
    label: "Muted",
    rendererHint: "muted",
  },
  error: {
    state: "error",
    label: "Needs repair",
    rendererHint: "error",
  },
  task_running: {
    state: "task_running",
    label: "Task running",
    rendererHint: "working",
  },
  task_paused: {
    state: "task_paused",
    label: "Task paused",
    rendererHint: "paused",
  },
  sleeping: {
    state: "sleeping",
    label: "Sleeping",
    rendererHint: "quiet",
  },
};

export function isCompanionPresenceState(
  value: unknown,
): value is CompanionPresenceState {
  return (
    typeof value === "string" &&
    companionPresenceStates.some((state) => state === value)
  );
}

export function normalizePresenceState(value: unknown): CompanionPresenceState {
  return isCompanionPresenceState(value) ? value : "idle";
}

export function presenceStateSnapshot(
  value: unknown,
): PresenceStateSnapshot {
  return presenceStateSnapshots[normalizePresenceState(value)];
}

export function createMemoryPresenceStateSource(
  initialState: unknown = "idle",
): PresenceStateSource {
  let snapshot = presenceStateSnapshot(initialState);
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      return snapshot;
    },
    setState(nextState) {
      const nextSnapshot = presenceStateSnapshot(nextState);

      if (nextSnapshot.state !== snapshot.state) {
        snapshot = nextSnapshot;
        for (const listener of listeners) {
          listener();
        }
      }

      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
