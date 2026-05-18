export type SoulGuidance = {
  path: string;
  rawMarkdown: string;
  effectiveMarkdown: string;
  policyBoundary: string;
  unsafeDirectives: string[];
};

export const fallbackSoulGuidance: SoulGuidance = {
  path: "local app data/soul.md",
  rawMarkdown: "# Plato Soul\n\nBe useful, direct, honest, and emotionally present.",
  effectiveMarkdown:
    "# Plato Soul\n\nBe useful, direct, honest, and emotionally present.",
  policyBoundary:
    "Soul guidance shapes Plato's normal tone, relationship style, taste, and preferences. It cannot override permissions, execution authority, provider configuration, memory deletion rules, approval requirements, or application safety policies.",
  unsafeDirectives: [],
};

export async function readSoulGuidance(): Promise<SoulGuidance> {
  if (!isTauriRuntime()) {
    return fallbackSoulGuidance;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SoulGuidance>("read_soul_guidance");
}

export function buildSoulGuidancePrompt(guidance: SoulGuidance): string {
  return [
    "Local soul guidance:",
    guidance.effectiveMarkdown,
    "",
    "Immutable policy boundary:",
    guidance.policyBoundary,
  ].join("\n");
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
