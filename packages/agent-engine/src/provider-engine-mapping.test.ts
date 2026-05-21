import { describe, expect, it } from "vitest";

import {
  agentEngineTaskConcepts,
  createAgentEngineCatalog,
  providerAuthModes,
  resolveAgentEngineForProvider,
  type AgentEngine,
  type AgentTaskRequest,
  type ModelProvider,
} from "./index.js";

const openAiProvider: ModelProvider = {
  id: "openai",
  displayName: "OpenAI",
  kind: "openai",
  authMode: "api_key",
};

const anthropicProvider: ModelProvider = {
  id: "anthropic",
  displayName: "Anthropic",
  kind: "anthropic",
  authMode: "api_key",
};

const claudeProvider: ModelProvider = {
  id: "claude",
  displayName: "Claude",
  kind: "claude",
  authMode: "local_sdk_auth",
};

const localProvider: ModelProvider = {
  id: "ollama",
  displayName: "Ollama",
  kind: "local",
  authMode: "local_model_endpoint",
  localEndpoint: "http://localhost:11434",
};

describe("provider to Agent Engine mapping", () => {
  it("distinguishes provider auth modes used by provider setup", () => {
    expect(providerAuthModes).toEqual([
      "api_key",
      "local_sdk_auth",
      "subscription_local_auth",
      "local_model_endpoint",
      "none",
    ]);
  });

  it("maps OpenAI providers to Codex SDK when available", () => {
    const resolution = resolveAgentEngineForProvider(openAiProvider);

    expect(resolution.status).toBe("engine_selected");
    expect(resolution.selectedEngine?.kind).toBe("codex_sdk");
  });

  it("maps Anthropic/Claude providers to Claude Agent SDK when available", () => {
    const anthropicResolution = resolveAgentEngineForProvider(anthropicProvider);
    const claudeResolution = resolveAgentEngineForProvider(claudeProvider);

    expect(anthropicResolution.status).toBe("engine_selected");
    expect(anthropicResolution.selectedEngine?.kind).toBe("claude_agent_sdk");
    expect(claudeResolution.status).toBe("engine_selected");
    expect(claudeResolution.selectedEngine?.kind).toBe("claude_agent_sdk");
  });

  it("represents local providers as endpoints without claiming Agent Engine support", () => {
    const resolution = resolveAgentEngineForProvider(localProvider);

    expect(localProvider.authMode).toBe("local_model_endpoint");
    expect(localProvider.localEndpoint).toBe("http://localhost:11434");
    expect(resolution.status).toBe("no_engine_supported");
    expect(resolution.selectedEngine).toBeNull();
  });

  it("reports unavailable mapped engines without selecting a fallback engine", () => {
    const engines: AgentEngine[] = [
      {
        kind: "codex_sdk",
        displayName: "Codex SDK",
        availability: "unavailable",
      },
    ];
    const catalog = createAgentEngineCatalog(engines);

    const resolution = resolveAgentEngineForProvider(openAiProvider, catalog);

    expect(resolution.status).toBe("engine_unavailable");
    expect(resolution.selectedEngine).toBeNull();
  });

  it("reports unknown providers without selecting an engine", () => {
    const unknownProvider: ModelProvider = {
      id: "future-provider",
      displayName: "Future Provider",
      kind: "unknown",
      authMode: "none",
    };

    const resolution = resolveAgentEngineForProvider(unknownProvider);

    expect(resolution.status).toBe("unknown_provider");
    expect(resolution.selectedEngine).toBeNull();
  });

  it("keeps task concepts independent of provider and engine selection", () => {
    const task: AgentTaskRequest = {
      taskId: "task-1",
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["github"],
    };

    expect(agentEngineTaskConcepts).toEqual([
      "taskId",
      "instruction",
      "authorityMode",
      "requiredCapabilities",
    ]);
    expect(task).not.toHaveProperty("providerId");
    expect(task).not.toHaveProperty("engineKind");
  });
});
