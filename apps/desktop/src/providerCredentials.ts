export type ProviderCredentialInput = {
  providerId: string;
  providerKind: string;
  displayName: string;
  credential: string;
  metadata?: Record<string, unknown>;
};

export type ProviderMetadata = {
  providerId: string;
  providerKind: string;
  displayName: string;
  authStatus: string;
  secretRef: string | null;
  metadata: unknown;
};

export type ProviderCredentialStore = {
  save: (input: ProviderCredentialInput) => Promise<ProviderMetadata>;
  has: (providerId: string) => Promise<boolean>;
  remove: (providerId: string) => Promise<ProviderMetadata | null>;
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriProviderCredentialStore(): ProviderCredentialStore {
  return {
    async save(credential) {
      if (!isTauriRuntime()) {
        throw new Error("provider credentials require the Tauri runtime");
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<ProviderMetadata>("save_provider_credential", { credential });
    },
    async has(providerId) {
      if (!isTauriRuntime()) {
        return false;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<boolean>("has_provider_credential", { providerId });
    },
    async remove(providerId) {
      if (!isTauriRuntime()) {
        return null;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<ProviderMetadata | null>("remove_provider_credential", {
        providerId,
      });
    },
  };
}
