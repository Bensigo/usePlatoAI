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

export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

export const companionSettingsKey = "useplatoai.companionSettings.v1";

export const defaultCompanionSettings: CompanionSettings = {
  companionName: "Plato",
  wakeName: "Plato",
  launchBehavior: "launch-at-login",
  memoryMode: "enabled",
  executionAuthority: "ask-first",
  providerPlaceholder: "configure-later",
  onboardingComplete: false,
};

export function getBrowserSettingsStorage(): SettingsStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

export function readCompanionSettings(
  storage: SettingsStorage | undefined = getBrowserSettingsStorage(),
): CompanionSettings {
  if (!storage) {
    return defaultCompanionSettings;
  }

  const storedSettings = storage.getItem(companionSettingsKey);
  if (!storedSettings) {
    return defaultCompanionSettings;
  }

  try {
    return {
      ...defaultCompanionSettings,
      ...(JSON.parse(storedSettings) as Partial<CompanionSettings>),
    };
  } catch {
    return defaultCompanionSettings;
  }
}

export function saveCompanionSettings(
  settings: CompanionSettings,
  storage: SettingsStorage | undefined = getBrowserSettingsStorage(),
) {
  storage?.setItem(companionSettingsKey, JSON.stringify(settings));
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
