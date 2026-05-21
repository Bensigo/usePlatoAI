import { describe, expect, it } from "vitest";

import {
  createAgentEngineAdapterRegistry,
  createAgentEngineCatalogFromAdapters,
  createApiKeyProviderAuthState,
  createCodexSdkAgentEngineAdapter,
  resolveAgentEngineForProvider,
  type ModelProvider,
  type SecretReference,
  type SecretStore,
} from "./index.js";

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  write(reference: SecretReference, value: string): void {
    this.values.set(reference.id, value);
  }

  read(reference: SecretReference): string | null {
    return this.values.get(reference.id) ?? null;
  }
}

describe("Codex SDK Agent Engine adapter", () => {
  it("registers behind the Agent Engine adapter registry", () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const registry = createAgentEngineAdapterRegistry([adapter]);

    expect(registry.get("codex_sdk")).toBe(adapter);
    expect(registry.get("codex_sdk")?.engine).toEqual({
      kind: "codex_sdk",
      displayName: "Codex SDK",
      availability: "available",
    });
  });

  it("lets OpenAI-backed provider selection resolve to the registered Codex adapter", () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const registry = createAgentEngineAdapterRegistry([adapter]);
    const catalog = createAgentEngineCatalogFromAdapters(registry);
    const provider: ModelProvider = {
      id: "openai",
      displayName: "OpenAI",
      kind: "openai",
      authMode: "api_key",
    };

    const resolution = resolveAgentEngineForProvider(provider, catalog);

    expect(resolution.status).toBe("engine_selected");
    expect(resolution.selectedEngine).toBe(adapter.engine);
  });

  it("exposes unavailable state without pretending work can run", async () => {
    const adapter = createCodexSdkAgentEngineAdapter();
    const provider: ModelProvider = {
      id: "openai",
      displayName: "OpenAI",
      kind: "openai",
      authMode: "api_key",
    };

    await expect(adapter.getState(provider)).resolves.toEqual({
      status: "unavailable",
      reason: "Codex SDK runtime is not available in this app build.",
    });
  });

  it("exposes auth-missing state for available Codex runtime without OpenAI auth", async () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const provider: ModelProvider = {
      id: "openai",
      displayName: "OpenAI",
      kind: "openai",
      authMode: "api_key",
    };

    await expect(adapter.getState(provider)).resolves.toEqual({
      status: "auth_missing",
      reason: "OpenAI provider auth is not configured for Codex SDK.",
      authAvailability: "not_configured",
    });
  });

  it("exposes auth-missing state when the OpenAI secret reference has no value", async () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const secretStore = new MemorySecretStore();
    const authState = await createApiKeyProviderAuthState({
      providerId: "openai",
      providerDisplayName: "OpenAI",
      apiKey: "sk-test",
      secretStore,
    });
    const provider: ModelProvider = {
      id: "openai",
      displayName: "OpenAI",
      kind: "openai",
      authMode: "api_key",
      authState,
    };

    secretStore.values.clear();

    await expect(adapter.getState(provider, secretStore)).resolves.toEqual({
      status: "auth_missing",
      reason: "OpenAI provider auth is not ready for Codex SDK.",
      authAvailability: "missing_secret",
    });
  });

  it("returns a mocked execution result compatible with task records", async () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
      now: () => new Date("2026-05-21T12:00:00.000Z"),
    });

    await expect(
      adapter.runMockedTask({
        taskId: "task-224",
        instruction: "Summarize the current issue.",
        authorityMode: "ask_first",
        requiredCapabilities: ["github"],
      }),
    ).resolves.toEqual({
      taskId: "task-224",
      status: "completed",
      summary: "Mocked Codex SDK completed: Summarize the current issue.",
      output: {
        kind: "mocked_agent_engine_result",
        text: "Codex SDK mocked execution accepted 1 required capabilities under ask_first.",
      },
      engineKind: "codex_sdk",
      completedAt: "2026-05-21T12:00:00.000Z",
    });
  });
});
