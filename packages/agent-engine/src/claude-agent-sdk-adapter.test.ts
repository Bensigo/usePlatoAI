import { describe, expect, it } from "vitest";

import {
  createAgentEngineAdapterRegistry,
  createAgentEngineCatalogFromAdapters,
  createApiKeyProviderAuthState,
  createClaudeAgentSdkAgentEngineAdapter,
  resolveAgentEngineForProvider,
  type LocalSdkProviderAuthState,
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

describe("Claude Agent SDK Agent Engine adapter", () => {
  it("registers behind the Agent Engine adapter registry", () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const registry = createAgentEngineAdapterRegistry([adapter]);

    expect(registry.get("claude_agent_sdk")).toBe(adapter);
    expect(registry.get("claude_agent_sdk")?.engine).toEqual({
      kind: "claude_agent_sdk",
      displayName: "Claude Agent SDK",
      availability: "available",
    });
  });

  it("lets Anthropic-backed provider selection resolve to the registered Claude adapter", () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const registry = createAgentEngineAdapterRegistry([adapter]);
    const catalog = createAgentEngineCatalogFromAdapters(registry);
    const provider: ModelProvider = {
      id: "anthropic",
      displayName: "Anthropic",
      kind: "anthropic",
      authMode: "api_key",
    };

    const resolution = resolveAgentEngineForProvider(provider, catalog);

    expect(resolution.status).toBe("engine_selected");
    expect(resolution.selectedEngine).toBe(adapter.engine);
  });

  it("lets Claude-backed provider selection resolve to the registered Claude adapter", () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const registry = createAgentEngineAdapterRegistry([adapter]);
    const catalog = createAgentEngineCatalogFromAdapters(registry);
    const provider: ModelProvider = {
      id: "claude",
      displayName: "Claude",
      kind: "claude",
      authMode: "local_sdk_auth",
    };

    const resolution = resolveAgentEngineForProvider(provider, catalog);

    expect(resolution.status).toBe("engine_selected");
    expect(resolution.selectedEngine).toBe(adapter.engine);
  });

  it("exposes unavailable state without pretending work can run", async () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter();
    const provider: ModelProvider = {
      id: "anthropic",
      displayName: "Anthropic",
      kind: "anthropic",
      authMode: "api_key",
    };

    await expect(adapter.getState(provider)).resolves.toEqual({
      status: "unavailable",
      reason: "Claude Agent SDK runtime is not available in this app build.",
    });
  });

  it("exposes auth-missing state for available Claude runtime without provider auth", async () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const provider: ModelProvider = {
      id: "anthropic",
      displayName: "Anthropic",
      kind: "anthropic",
      authMode: "api_key",
    };

    await expect(adapter.getState(provider)).resolves.toEqual({
      status: "auth_missing",
      reason: "Anthropic/Claude provider auth is not configured for Claude Agent SDK.",
      authAvailability: "not_configured",
    });
  });

  it("exposes auth-missing state when the Anthropic secret reference has no value", async () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const secretStore = new MemorySecretStore();
    const authState = await createApiKeyProviderAuthState({
      providerId: "anthropic",
      providerDisplayName: "Anthropic",
      apiKey: "anthropic-test",
      secretStore,
    });
    const provider: ModelProvider = {
      id: "anthropic",
      displayName: "Anthropic",
      kind: "anthropic",
      authMode: "api_key",
      authState,
    };

    secretStore.values.clear();

    await expect(adapter.getState(provider, secretStore)).resolves.toEqual({
      status: "auth_missing",
      reason: "Anthropic/Claude provider auth is not ready for Claude Agent SDK.",
      authAvailability: "missing_secret",
    });
  });

  it("accepts local Claude SDK auth when runtime and local auth are ready", async () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const authState: LocalSdkProviderAuthState = {
      mode: "local_sdk_auth",
      sdkName: "Claude Code",
      isAuthenticated: true,
      accountHint: "user@example.com",
    };
    const provider: ModelProvider = {
      id: "claude",
      displayName: "Claude",
      kind: "claude",
      authMode: "local_sdk_auth",
      authState,
    };

    await expect(adapter.getState(provider)).resolves.toEqual({
      status: "available",
      reason:
        "Claude Agent SDK is available for Anthropic/Claude-backed Agent Engine tasks.",
      authAvailability: "ready",
    });
  });

  it("returns a mocked execution result compatible with task records", async () => {
    const adapter = createClaudeAgentSdkAgentEngineAdapter({
      runtimeAvailable: true,
      now: () => new Date("2026-05-21T12:30:00.000Z"),
    });

    await expect(
      adapter.runMockedTask({
        taskId: "task-225",
        instruction: "Summarize the current issue.",
        authorityMode: "ask_first",
        requiredCapabilities: ["github", "filesystem"],
      }),
    ).resolves.toEqual({
      taskId: "task-225",
      status: "completed",
      summary: "Mocked Claude Agent SDK completed: Summarize the current issue.",
      output: {
        kind: "mocked_agent_engine_result",
        text: "Claude Agent SDK mocked execution accepted 2 required capabilities under ask_first.",
      },
      engineKind: "claude_agent_sdk",
      completedAt: "2026-05-21T12:30:00.000Z",
    });
  });
});
