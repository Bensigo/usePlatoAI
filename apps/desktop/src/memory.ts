export type LocalMemoryKind = "summary" | "preference";

export type LocalMemoryInput = {
  memoryId: string;
  memoryKind: LocalMemoryKind;
  summary: string;
  preferenceKey?: string | null;
  preferenceValue?: unknown;
  sourceKind: string;
  metadata: unknown;
};

export type LocalMemoryRecord = LocalMemoryInput & {
  createdAt: string;
  updatedAt: string;
};

export type LocalMemoryRetrievalQuery = {
  query?: string | null;
  memoryKind?: LocalMemoryKind | null;
  limit?: number | null;
};

export type MemoryStore = {
  remember: (memory: LocalMemoryInput) => Promise<LocalMemoryRecord>;
  read: (memoryId: string) => Promise<LocalMemoryRecord | null>;
  readPreference: (preferenceKey: string) => Promise<LocalMemoryRecord | null>;
  retrieve: (query: LocalMemoryRetrievalQuery) => Promise<LocalMemoryRecord[]>;
};

export function createMemoryStore(initialRecords: LocalMemoryRecord[] = []): MemoryStore {
  const records = new Map(initialRecords.map((record) => [record.memoryId, record]));

  return {
    async remember(memory) {
      const now = new Date(0).toISOString();
      const existing = records.get(memory.memoryId);
      const record: LocalMemoryRecord = {
        ...memory,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      records.set(record.memoryId, record);
      return record;
    },
    async read(memoryId) {
      return records.get(memoryId) ?? null;
    },
    async readPreference(preferenceKey) {
      return (
        [...records.values()].find(
          (record) =>
            record.memoryKind === "preference" &&
            record.preferenceKey === preferenceKey,
        ) ?? null
      );
    },
    async retrieve(query) {
      const textQuery = query.query?.trim().toLocaleLowerCase();
      return [...records.values()]
        .filter((record) => !query.memoryKind || record.memoryKind === query.memoryKind)
        .filter((record) => {
          if (!textQuery) {
            return true;
          }

          return [
            record.summary,
            record.preferenceKey ?? "",
            JSON.stringify(record.preferenceValue ?? null),
          ].some((value) => value.toLocaleLowerCase().includes(textQuery));
        })
        .slice(0, query.limit ?? 10);
    },
  };
}

export function createTauriMemoryStore(): MemoryStore {
  const fallbackStore = createMemoryStore();

  return {
    async remember(memory) {
      if (!isTauriRuntime()) {
        return fallbackStore.remember(memory);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord>("remember_local_memory", { memory });
    },
    async read(memoryId) {
      if (!isTauriRuntime()) {
        return fallbackStore.read(memoryId);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord | null>("read_local_memory", { memoryId });
    },
    async readPreference(preferenceKey) {
      if (!isTauriRuntime()) {
        return fallbackStore.readPreference(preferenceKey);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord | null>("read_local_memory_preference", {
        preferenceKey,
      });
    },
    async retrieve(query) {
      if (!isTauriRuntime()) {
        return fallbackStore.retrieve(query);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord[]>("retrieve_local_memories", { query });
    },
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
