import {
  defaultCompanionSettings,
  defaultExecutionAuthorityPolicy,
  type AuditHistoryEntry,
  type CompanionSettings,
  type ExecutionAuthority,
  type ExecutionAuthorityPolicy,
} from "./settings";

export type LocalDataCategoryStatus = {
  categoryId: string;
  label: string;
  storage: string;
  recordCount: number;
  status: string;
};

export type MemoryStatus = {
  mode: string;
  recordCount: number;
  intelligenceStatus: string;
};

export type ProviderCredentialStatus = {
  providerId: string;
  displayName: string;
  authStatus: string;
  hasSecret: boolean;
};

export type TrustFoundationSnapshot = {
  localData: {
    categories: LocalDataCategoryStatus[];
    memoryStatus: MemoryStatus;
  };
  providerCredential: ProviderCredentialStatus;
  executionAuthority: ExecutionAuthorityPolicy;
  auditHistory: AuditHistoryEntry[];
};

export type TrustFoundationStore = {
  read: () => Promise<TrustFoundationSnapshot>;
  saveOpenAiCredential: (credential: string) => Promise<TrustFoundationSnapshot>;
  removeOpenAiCredential: () => Promise<TrustFoundationSnapshot>;
};

export function defaultTrustFoundationSnapshot(
  settings: CompanionSettings = defaultCompanionSettings,
): TrustFoundationSnapshot {
  const hasSettings = settings.onboardingComplete;

  return {
    localData: {
      categories: [
        category("settings", "Settings", "SQLite settings", hasSettings ? 1 : 0),
        category("secrets", "Secrets", "OS-backed secret store", 0),
        category("memory", "Memory", "SQLite memory metadata", 0),
        category("tasks", "Tasks", "SQLite task metadata", 0),
        category("capabilities", "Capabilities", "SQLite capability metadata", 0),
        category(
          "provider-metadata",
          "Provider metadata",
          "SQLite provider metadata",
          0,
        ),
        {
          ...category(
            "permissions",
            "Permissions",
            "SQLite settings policy",
            hasSettings ? 1 : 0,
          ),
          status: settings.executionAuthority,
        },
        category("audit-history", "Audit/history", "SQLite audit history", 0),
      ],
      memoryStatus: {
        mode: settings.memoryMode,
        recordCount: 0,
        intelligenceStatus: "metadata-only",
      },
    },
    providerCredential: {
      providerId: "openai",
      displayName: "OpenAI",
      authStatus: "needs-secret",
      hasSecret: false,
    },
    executionAuthority: {
      ...defaultExecutionAuthorityPolicy,
      mode: settings.executionAuthority,
      localFileChange:
        settings.executionAuthority === "trusted-local" ? "warn" : "ask",
      appControl: settings.executionAuthority === "trusted-local" ? "warn" : "ask",
    },
    auditHistory: [],
  };
}

export function createMemoryTrustFoundationStore(
  initialSettings: CompanionSettings = defaultCompanionSettings,
): TrustFoundationStore {
  let snapshot = defaultTrustFoundationSnapshot(initialSettings);

  return {
    async read() {
      return snapshot;
    },
    async saveOpenAiCredential() {
      snapshot = {
        ...snapshot,
        localData: {
          ...snapshot.localData,
          categories: snapshot.localData.categories.map((categoryStatus) =>
            categoryStatus.categoryId === "secrets" ||
            categoryStatus.categoryId === "provider-metadata"
              ? { ...categoryStatus, recordCount: 1, status: "active" }
              : categoryStatus,
          ),
        },
        providerCredential: {
          providerId: "openai",
          displayName: "OpenAI",
          authStatus: "configured",
          hasSecret: true,
        },
        auditHistory: [
          {
            auditId: 1,
            category: "provider_metadata",
            action: "provider_metadata.upserted",
            metadata: "openai",
            createdAt: "test",
          },
        ],
      };
      return snapshot;
    },
    async removeOpenAiCredential() {
      snapshot = {
        ...snapshot,
        localData: {
          ...snapshot.localData,
          categories: snapshot.localData.categories.map((categoryStatus) =>
            categoryStatus.categoryId === "secrets"
              ? { ...categoryStatus, recordCount: 0, status: "empty" }
              : categoryStatus,
          ),
        },
        providerCredential: {
          providerId: "openai",
          displayName: "OpenAI",
          authStatus: "needs-secret",
          hasSecret: false,
        },
      };
      return snapshot;
    },
  };
}

export function createTauriTrustFoundationStore(): TrustFoundationStore {
  return {
    async read() {
      if (!isTauriRuntime()) {
        return defaultTrustFoundationSnapshot();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TrustFoundationSnapshot>("read_trust_foundation_snapshot");
    },
    async saveOpenAiCredential(credential) {
      if (!isTauriRuntime()) {
        return defaultTrustFoundationSnapshot();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_provider_credential", {
        credential: {
          providerId: "openai",
          providerKind: "model-provider",
          displayName: "OpenAI",
          credential,
          metadata: { engine: "codex" },
        },
      });
      return invoke<TrustFoundationSnapshot>("read_trust_foundation_snapshot");
    },
    async removeOpenAiCredential() {
      if (!isTauriRuntime()) {
        return defaultTrustFoundationSnapshot();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_provider_credential", { providerId: "openai" });
      return invoke<TrustFoundationSnapshot>("read_trust_foundation_snapshot");
    },
  };
}

export function snapshotWithExecutionAuthority(
  snapshot: TrustFoundationSnapshot,
  executionAuthority: ExecutionAuthority,
): TrustFoundationSnapshot {
  const policy =
    executionAuthority === "trusted-local"
      ? {
          ...defaultExecutionAuthorityPolicy,
          mode: executionAuthority,
          localFileChange: "warn" as const,
          appControl: "warn" as const,
        }
      : { ...defaultExecutionAuthorityPolicy, mode: executionAuthority };

  return {
    ...snapshot,
    localData: {
      ...snapshot.localData,
      categories: snapshot.localData.categories.map((categoryStatus) =>
        categoryStatus.categoryId === "permissions"
          ? { ...categoryStatus, status: executionAuthority }
          : categoryStatus,
      ),
    },
    executionAuthority: policy,
  };
}

function category(
  categoryId: string,
  label: string,
  storage: string,
  recordCount: number,
): LocalDataCategoryStatus {
  return {
    categoryId,
    label,
    storage,
    recordCount,
    status: recordCount > 0 ? "active" : "empty",
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
