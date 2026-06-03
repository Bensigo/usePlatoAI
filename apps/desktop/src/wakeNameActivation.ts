export type WakeNameActivationState =
  | "disabled"
  | "listening"
  | "matched"
  | "false-positive"
  | "unavailable"
  | "error";

export type WakeNameActivationSnapshot = {
  state: WakeNameActivationState;
  wakeName: string;
  providerId: string;
  detail: string;
  retryable: boolean;
};

export type WakeNameActivationSettings = {
  wakeName: string;
  wakeNameActivationEnabled: boolean;
  wakeNameDetectorModelPath: string;
};

export type WakeNameDetectorEvent =
  | {
      type: "match";
      wakeName: string;
    }
  | {
      type: "false-positive";
      transcript: string;
      confidence?: number;
    }
  | {
      type: "error";
      message: string;
      retryable: boolean;
    };

export type WakeNameDetectorStartResult =
  | {
      status: "listening";
      providerId: string;
      detail: string;
    }
  | {
      status: "unavailable";
      providerId: string;
      reason: string;
    }
  | {
      status: "error";
      providerId: string;
      error: {
        message: string;
        retryable: boolean;
      };
    };

export type WakeNameDetector = {
  start: (
    input: {
      wakeName: string;
      modelPath: string;
    },
    onEvent: (event: WakeNameDetectorEvent) => void,
  ) => Promise<WakeNameDetectorStartResult>;
  stop: () => Promise<void>;
};

export type StartWakeNameActivationInput = {
  settings: WakeNameActivationSettings;
  detector: WakeNameDetector;
  onActivation: (wakeName: string) => void;
  onSnapshot: (snapshot: WakeNameActivationSnapshot) => void;
};

export const voskWakeNameDetectorProviderId = "local-vosk-wake-name";

export const defaultWakeNameActivationSnapshot: WakeNameActivationSnapshot = {
  state: "disabled",
  wakeName: "Amber",
  providerId: voskWakeNameDetectorProviderId,
  detail: "Wake-name activation is off.",
  retryable: true,
};

export function wakeNameActivationStateFrom(
  value: string | null | undefined,
): WakeNameActivationState | undefined {
  return [
    "disabled",
    "listening",
    "matched",
    "false-positive",
    "unavailable",
    "error",
  ].find((state): state is WakeNameActivationState => state === value);
}

export function wakeNameActivationSnapshotForState({
  state,
  wakeName = "Amber",
}: {
  state: WakeNameActivationState;
  wakeName?: string;
}): WakeNameActivationSnapshot {
  switch (state) {
    case "disabled":
      return {
        ...defaultWakeNameActivationSnapshot,
        wakeName,
      };
    case "listening":
      return {
        state,
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail: `Listening locally for ${wakeName}.`,
        retryable: true,
      };
    case "matched":
      return {
        state,
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail: `${wakeName} heard the wake name. Starting voice.`,
        retryable: true,
      };
    case "false-positive":
      return {
        state,
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail: "Ignored possible wake audio below the match threshold.",
        retryable: true,
      };
    case "unavailable":
      return {
        state,
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail:
          "Vosk wake-name detector is unavailable. Hotkey and avatar activation still work.",
        retryable: true,
      };
    case "error":
      return {
        state,
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail: "Wake-name detector failed. Disable and re-enable it to retry.",
        retryable: true,
      };
  }
}

function normalizedWakeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function isConfiguredWakeNameMatch({
  detectedWakeName,
  configuredWakeName,
}: {
  detectedWakeName: string;
  configuredWakeName: string;
}) {
  return (
    normalizedWakeName(detectedWakeName) ===
    normalizedWakeName(configuredWakeName)
  );
}

export function createUnavailableVoskWakeNameDetector(): WakeNameDetector {
  return {
    async start(input) {
      const modelPath = input.modelPath.trim();

      if (!modelPath) {
        return {
          status: "unavailable",
          providerId: voskWakeNameDetectorProviderId,
          reason:
            "Vosk wake-name detection needs a local model path before Amber can listen for her wake name.",
        };
      }

      return {
        status: "unavailable",
        providerId: voskWakeNameDetectorProviderId,
        reason:
          "Vosk wake-name detector runtime is unavailable. Explicit hotkey and avatar activation still work.",
      };
    },
    async stop() {
      return;
    },
  };
}

export async function startWakeNameActivation({
  settings,
  detector,
  onActivation,
  onSnapshot,
}: StartWakeNameActivationInput): Promise<() => Promise<void>> {
  const wakeName = settings.wakeName.trim() || "Amber";

  if (!settings.wakeNameActivationEnabled) {
    onSnapshot({
      ...defaultWakeNameActivationSnapshot,
      wakeName,
    });
    return async () => undefined;
  }

  let isCurrent = true;
  let hasDetectorEvent = false;
  const emit = (snapshot: WakeNameActivationSnapshot) => {
    if (isCurrent) {
      onSnapshot(snapshot);
    }
  };

  const startResult = await detector.start(
    {
      wakeName,
      modelPath: settings.wakeNameDetectorModelPath,
    },
    (event) => {
      if (!isCurrent) {
        return;
      }

      hasDetectorEvent = true;

      if (event.type === "match") {
        if (
          isConfiguredWakeNameMatch({
            detectedWakeName: event.wakeName,
            configuredWakeName: wakeName,
          })
        ) {
          emit({
            state: "matched",
            wakeName,
            providerId: voskWakeNameDetectorProviderId,
            detail: `${wakeName} heard the wake name. Starting voice.`,
            retryable: true,
          });
          onActivation(wakeName);
          return;
        }

        emit({
          state: "false-positive",
          wakeName,
          providerId: voskWakeNameDetectorProviderId,
          detail: `Ignored "${event.wakeName}" because the configured wake name is ${wakeName}.`,
          retryable: true,
        });
        return;
      }

      if (event.type === "false-positive") {
        emit({
          state: "false-positive",
          wakeName,
          providerId: voskWakeNameDetectorProviderId,
          detail: event.transcript
            ? `Ignored possible wake audio: ${event.transcript}`
            : "Ignored possible wake audio below the match threshold.",
          retryable: true,
        });
        return;
      }

      emit({
        state: "error",
        wakeName,
        providerId: voskWakeNameDetectorProviderId,
        detail: event.message,
        retryable: event.retryable,
      });
    },
  );

  if (!isCurrent) {
    await detector.stop();
    return async () => undefined;
  }

  if (startResult.status === "listening") {
    if (hasDetectorEvent) {
      return async () => {
        isCurrent = false;
        await detector.stop();
      };
    }

    emit({
      state: "listening",
      wakeName,
      providerId: startResult.providerId,
      detail: startResult.detail,
      retryable: true,
    });
  } else if (startResult.status === "unavailable") {
    emit({
      state: "unavailable",
      wakeName,
      providerId: startResult.providerId,
      detail: startResult.reason,
      retryable: true,
    });
  } else {
    emit({
      state: "error",
      wakeName,
      providerId: startResult.providerId,
      detail: startResult.error.message,
      retryable: startResult.error.retryable,
    });
  }

  return async () => {
    isCurrent = false;
    await detector.stop();
  };
}
