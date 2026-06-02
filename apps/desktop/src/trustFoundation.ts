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
  apiKeyConfigured: boolean;
  activeAuthMode: string | null;
  chatgptOauth: ChatGptOAuthStatus;
};

export type ChatGptOAuthStatus = {
  configured: boolean;
  accountId: string | null;
  email: string | null;
  planType: string | null;
  tokenSource: string | null;
  updatedAt: string | null;
  availability: string;
  lastError: string | null;
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
  startChatGptOAuthLogin: (
    mode: "browser" | "device-code",
  ) => Promise<TrustFoundationSnapshot>;
  clearChatGptOAuthLogin: () => Promise<TrustFoundationSnapshot>;
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
        intelligenceStatus: "local-storage-boundary",
      },
    },
    providerCredential: {
      providerId: "openai",
      displayName: "OpenAI",
      authStatus: "needs-secret",
      hasSecret: false,
      apiKeyConfigured: false,
      activeAuthMode: null,
      chatgptOauth: {
        configured: false,
        accountId: null,
        email: null,
        planType: null,
        tokenSource: null,
        updatedAt: null,
        availability: "not-logged-in",
        lastError: null,
      },
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
          apiKeyConfigured: true,
          activeAuthMode: "openai_api_key",
          chatgptOauth: snapshot.providerCredential.chatgptOauth,
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
          authStatus: snapshot.providerCredential.chatgptOauth.configured
            ? "configured"
            : "needs-secret",
          hasSecret: false,
          apiKeyConfigured: false,
          activeAuthMode: snapshot.providerCredential.chatgptOauth.configured
            ? "chatgpt_oauth"
            : null,
          chatgptOauth: snapshot.providerCredential.chatgptOauth,
        },
      };
      return snapshot;
    },
    async startChatGptOAuthLogin() {
      snapshot = {
        ...snapshot,
        providerCredential: {
          ...snapshot.providerCredential,
          authStatus: "configured",
          activeAuthMode: "chatgpt_oauth",
          chatgptOauth: {
            configured: true,
            accountId: "user@example.com",
            email: "user@example.com",
            planType: "plus",
            tokenSource: "codex_app_server",
            updatedAt: "test",
            availability: "logged-in",
            lastError: null,
          },
        },
      };
      return snapshot;
    },
    async clearChatGptOAuthLogin() {
      const hasSecret = snapshot.providerCredential.hasSecret;
      snapshot = {
        ...snapshot,
        providerCredential: {
          ...snapshot.providerCredential,
          authStatus: hasSecret ? "configured" : "needs-secret",
          activeAuthMode: hasSecret ? "openai_api_key" : null,
          chatgptOauth: {
            configured: false,
            accountId: null,
            email: null,
            planType: null,
            tokenSource: null,
            updatedAt: null,
            availability: "not-logged-in",
            lastError: null,
          },
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
    async startChatGptOAuthLogin(mode) {
      if (!isTauriRuntime()) {
        return defaultTrustFoundationSnapshot();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TrustFoundationSnapshot>("start_chatgpt_oauth_login", {
        mode,
      });
    },
    async clearChatGptOAuthLogin() {
      if (!isTauriRuntime()) {
        return defaultTrustFoundationSnapshot();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TrustFoundationSnapshot>("clear_chatgpt_oauth_login");
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
