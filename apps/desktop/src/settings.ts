export type LaunchBehavior = "launch-at-login" | "manual-only";
export type MemoryMode = "enabled" | "paused";
export type ExecutionAuthority = "ask-first" | "trusted-local";
export type ActionImpact =
  | "low-risk-local"
  | "local-file-change"
  | "app-control"
  | "external-message"
  | "browser-submission"
  | "destructive-change"
  | "spending";
export type PolicyDecision = "proceed" | "warn" | "ask";
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

export type ExecutionAuthorityPolicy = {
  mode: ExecutionAuthority;
  lowRiskLocal: PolicyDecision;
  localFileChange: PolicyDecision;
  appControl: PolicyDecision;
  externalMessage: PolicyDecision;
  browserSubmission: PolicyDecision;
  destructiveChange: PolicyDecision;
  spending: PolicyDecision;
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

export const defaultExecutionAuthorityPolicy: ExecutionAuthorityPolicy = {
  mode: "ask-first",
  lowRiskLocal: "proceed",
  localFileChange: "ask",
  appControl: "ask",
  externalMessage: "ask",
  browserSubmission: "ask",
  destructiveChange: "ask",
  spending: "ask",
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

export async function readExecutionAuthorityPolicy(): Promise<ExecutionAuthorityPolicy> {
  if (!isTauriRuntime()) {
    return defaultExecutionAuthorityPolicy;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<ExecutionAuthorityPolicy>("read_execution_authority_policy");
}

export function decisionForActionImpact(
  policy: ExecutionAuthorityPolicy,
  impact: ActionImpact,
): PolicyDecision {
  switch (impact) {
    case "low-risk-local":
      return policy.lowRiskLocal;
    case "local-file-change":
      return policy.localFileChange;
    case "app-control":
      return policy.appControl;
    case "external-message":
      return policy.externalMessage;
    case "browser-submission":
      return policy.browserSubmission;
    case "destructive-change":
      return policy.destructiveChange;
    case "spending":
      return policy.spending;
  }
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
