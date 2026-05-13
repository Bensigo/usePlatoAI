export type LaunchBehavior = "launch-at-login" | "manual-only";
export type MemoryMode = "enabled" | "paused";
export type ExecutionAuthority = "ask-first" | "trusted-local";
export type ProviderPlaceholder =
  | "configure-later"
  | "openai-api-key"
  | "claude-sdk"
  | "local-model";

export type CompanionSettings = {
  companionName: string;
  wakeName: string;
  launchBehavior: LaunchBehavior;
  memoryMode: MemoryMode;
  executionAuthority: ExecutionAuthority;
  providerPlaceholder: ProviderPlaceholder;
  onboardingComplete: boolean;
};

export type SettingsStore = {
  read: () => Promise<CompanionSettings>;
  save: (settings: CompanionSettings) => Promise<void>;
};

export const defaultCompanionSettings: CompanionSettings = {
  companionName: "Plato",
  wakeName: "Plato",
  launchBehavior: "launch-at-login",
  memoryMode: "enabled",
  executionAuthority: "ask-first",
  providerPlaceholder: "configure-later",
  onboardingComplete: false,
};

export function normalizeCompanionSettings(
  settings: Partial<CompanionSettings> | null | undefined,
): CompanionSettings {
  return {
    ...defaultCompanionSettings,
    ...settings,
  };
}

export function createMemorySettingsStore(
  initialSettings?: Partial<CompanionSettings>,
): SettingsStore {
  let storedSettings = normalizeCompanionSettings(initialSettings);

  return {
    async read() {
      return storedSettings;
    },
    async save(settings) {
      storedSettings = normalizeCompanionSettings(settings);
    },
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriSettingsStore(): SettingsStore {
  return {
    async read() {
      if (!isTauriRuntime()) {
        return defaultCompanionSettings;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const settings = await invoke<Partial<CompanionSettings> | null>(
        "read_companion_settings",
      );

      return normalizeCompanionSettings(settings);
    },
    async save(settings) {
      if (!isTauriRuntime()) {
        return;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_companion_settings", {
        settings: normalizeCompanionSettings(settings),
      });
    },
  };
}

export function providerPlaceholderLabel(value: ProviderPlaceholder) {
  switch (value) {
    case "openai-api-key":
      return "OpenAI API key later";
    case "claude-sdk":
      return "Claude local SDK auth later";
    case "local-model":
      return "Local model later";
    case "configure-later":
      return "Configure later";
  }
}
