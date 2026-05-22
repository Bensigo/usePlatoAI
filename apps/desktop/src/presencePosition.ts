export type PresenceWindowPosition = {
  x: number;
  y: number;
};

export type PresenceDragMode = "locked" | "draggable";

export type PresencePositionStore = {
  read: () => Promise<PresenceWindowPosition | null>;
  save: (position: PresenceWindowPosition) => Promise<void>;
};

export const presenceDragIdleTimeoutMs = 2_400;

export function normalizePresenceWindowPosition(
  position: Partial<PresenceWindowPosition> | null | undefined,
): PresenceWindowPosition | null {
  if (
    typeof position?.x !== "number" ||
    typeof position.y !== "number" ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y)
  ) {
    return null;
  }

  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
}

export function presenceDragModeAfterDoubleClick(
  mode: PresenceDragMode,
): PresenceDragMode {
  return mode === "draggable" ? "locked" : "draggable";
}

export function presenceDragModeAfterIdle({
  mode,
  dragStoppedAt,
  now,
  idleTimeoutMs = presenceDragIdleTimeoutMs,
}: {
  mode: PresenceDragMode;
  dragStoppedAt: number;
  now: number;
  idleTimeoutMs?: number;
}): PresenceDragMode {
  if (mode !== "draggable") {
    return mode;
  }

  return now - dragStoppedAt >= idleTimeoutMs ? "locked" : "draggable";
}

export function shouldStartPresenceWindowDrag(
  mode: PresenceDragMode,
  mouseButton: number,
) {
  return mode === "draggable" && mouseButton === 0;
}

export function createMemoryPresencePositionStore(
  initialPosition?: Partial<PresenceWindowPosition> | null,
): PresencePositionStore {
  let storedPosition = normalizePresenceWindowPosition(initialPosition);

  return {
    async read() {
      return storedPosition;
    },
    async save(position) {
      storedPosition = normalizePresenceWindowPosition(position);
    },
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriPresencePositionStore(): PresencePositionStore {
  const fallbackStore = createMemoryPresencePositionStore();

  return {
    async read() {
      if (!isTauriRuntime()) {
        return fallbackStore.read();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const position = await invoke<Partial<PresenceWindowPosition> | null>(
        "read_presence_window_position",
      );

      return normalizePresenceWindowPosition(position);
    },
    async save(position) {
      const normalizedPosition = normalizePresenceWindowPosition(position);

      if (!normalizedPosition) {
        return;
      }

      if (!isTauriRuntime()) {
        await fallbackStore.save(normalizedPosition);
        return;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_presence_window_position", {
        position: normalizedPosition,
      });
    },
  };
}
