import { describe, expect, it } from "vitest";

import {
  createAgentEngineAdapterRegistry,
  createAgentEngineCatalogFromAdapters,
  createApiKeyProviderAuthState,
  createCodexSdkAgentEngineAdapter,
  createMemoryLocalTaskRepository,
  runMockedEngineBackedTask,
  type LocalTaskRecord,
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

describe("mocked engine-backed task integration", () => {
  it("runs a selected provider through the mocked engine and persists a canonical completed task", async () => {
    const secretStore = new MemorySecretStore();
    const authState = await createApiKeyProviderAuthState({
      providerId: "openai",
      providerDisplayName: "OpenAI",
      apiKey: "sk-test",
      secretStore,
    });
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
      now: () => new Date("2026-05-21T13:00:00.000Z"),
    });
    const adapters = createAgentEngineAdapterRegistry([adapter]);
    const repository = createMemoryLocalTaskRepository({
      now: () => new Date("2026-05-21T13:00:00.000Z"),
    });

    const task = await runMockedEngineBackedTask({
      provider: {
        id: "openai",
        displayName: "OpenAI",
        kind: "openai",
        authMode: "api_key",
        authState,
      },
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["github"],
      adapters,
      catalog: createAgentEngineCatalogFromAdapters(adapters),
      secretStore,
      repository,
      taskId: "task-227",
      now: () => new Date("2026-05-21T13:00:00.000Z"),
    });

    expect(task).toEqual({
      id: "task-227",
      title: "Summarize the current issue.",
      status: "completed",
      summary: "Mocked Codex SDK completed: Summarize the current issue.",
      result: {
        kind: "mocked_agent_engine_result",
        text: "Codex SDK mocked execution accepted 1 required capabilities under ask_first.",
      },
      metadata: {
        executionSource: "agent_engine",
        verification: "Mocked Agent Engine adapter returned a completed result.",
        costAwareness:
          "Mocked execution only; no provider API call or token spend occurred.",
      },
      createdAt: "2026-05-21T13:00:00.000Z",
      updatedAt: "2026-05-21T13:00:00.000Z",
      completedAt: "2026-05-21T13:00:00.000Z",
    });
    expect(await repository.list()).toEqual([task]);
    expect(task).not.toHaveProperty("providerId");
    expect(task).not.toHaveProperty("engineKind");
    expect(JSON.stringify(task)).not.toContain("codex_sdk");
  });

  it("persists a failed task when the mapped engine is unavailable", async () => {
    const repository = createMemoryLocalTaskRepository({
      now: () => new Date("2026-05-21T13:05:00.000Z"),
    });

    const task = await runMockedEngineBackedTask({
      provider: {
        id: "openai",
        displayName: "OpenAI",
        kind: "openai",
        authMode: "api_key",
      },
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["github"],
      adapters: createAgentEngineAdapterRegistry(),
      repository,
      taskId: "task-unavailable",
    });

    expect(task.status).toBe("failed");
    expect(task.summary).toBe("The mapped Agent Engine is not available for OpenAI.");
    expect(task.metadata.verification).toBe(
      "Task stopped before execution because no runnable Agent Engine was selected.",
    );
    expect(await repository.list()).toEqual([task]);
  });

  it("persists a blocked task when provider auth is missing", async () => {
    const adapter = createCodexSdkAgentEngineAdapter({
      runtimeAvailable: true,
    });
    const adapters = createAgentEngineAdapterRegistry([adapter]);
    const repository = createMemoryLocalTaskRepository({
      now: () => new Date("2026-05-21T13:10:00.000Z"),
    });

    const task = await runMockedEngineBackedTask({
      provider: {
        id: "openai",
        displayName: "OpenAI",
        kind: "openai",
        authMode: "api_key",
      },
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["github"],
      adapters,
      catalog: createAgentEngineCatalogFromAdapters(adapters),
      repository,
      taskId: "task-missing-auth",
    });

    expect(task.status).toBe("blocked");
    expect(task.summary).toBe("OpenAI provider auth is not configured for Codex SDK.");
    expect(task.metadata.verification).toBe(
      "Task stopped before execution because provider auth is not ready.",
    );
    expect(await repository.list()).toEqual([task]);
  });

  it("keeps local task records free of selected provider and engine identifiers", async () => {
    const task: LocalTaskRecord = {
      id: "task-shape",
      title: "Run mocked task",
      status: "completed",
      summary: "Mocked task completed.",
      result: {
        kind: "mocked_agent_engine_result",
        text: "Done.",
      },
      metadata: {
        executionSource: "agent_engine",
        verification: "Verified by mocked adapter.",
        costAwareness: "No provider API call occurred.",
      },
      createdAt: "2026-05-21T13:15:00.000Z",
      updatedAt: "2026-05-21T13:15:00.000Z",
      completedAt: "2026-05-21T13:15:00.000Z",
    };

    expect(Object.keys(task)).toEqual([
      "id",
      "title",
      "status",
      "summary",
      "result",
      "metadata",
      "createdAt",
      "updatedAt",
      "completedAt",
    ]);
    expect(task).not.toHaveProperty("providerId");
    expect(task).not.toHaveProperty("engineKind");
  });
});
