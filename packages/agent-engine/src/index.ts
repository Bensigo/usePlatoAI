export type ProviderKind = "openai" | "anthropic" | "claude" | "local" | "unknown";

export type ProviderAuthMode =
  | "api_key"
  | "local_sdk_auth"
  | "subscription_local_auth"
  | "local_model_endpoint"
  | "none";

export type AgentEngineKind = "codex_sdk" | "claude_agent_sdk" | "none";

export type EngineAvailability = "available" | "unavailable";

export type EngineResolutionStatus =
  | "engine_selected"
  | "engine_unavailable"
  | "no_engine_supported"
  | "unknown_provider";

export const providerAuthModes = [
  "api_key",
  "local_sdk_auth",
  "subscription_local_auth",
  "local_model_endpoint",
  "none",
] as const satisfies readonly ProviderAuthMode[];

export const modelProviderKinds = [
  "openai",
  "anthropic",
  "claude",
  "local",
  "unknown",
] as const satisfies readonly ProviderKind[];

export interface ModelProvider {
  id: string;
  displayName: string;
  kind: ProviderKind;
  authMode: ProviderAuthMode;
  localEndpoint?: string;
}

export interface AgentEngine {
  kind: AgentEngineKind;
  displayName: string;
  availability: EngineAvailability;
}

export interface EngineResolution {
  provider: ModelProvider;
  status: EngineResolutionStatus;
  selectedEngine: AgentEngine | null;
  reason: string;
}

export type AgentEngineCatalog = ReadonlyMap<AgentEngineKind, AgentEngine>;

export type ExecutionAuthorityMode = "ask_first" | "trusted_workspace" | "manual_only";

export interface AgentTaskRequest {
  taskId: string;
  instruction: string;
  authorityMode: ExecutionAuthorityMode;
  requiredCapabilities: string[];
}

export const agentEngineTaskConcepts = [
  "taskId",
  "instruction",
  "authorityMode",
  "requiredCapabilities",
] as const satisfies readonly (keyof AgentTaskRequest)[];

export const defaultAgentEngines = [
  {
    kind: "codex_sdk",
    displayName: "Codex SDK",
    availability: "available",
  },
  {
    kind: "claude_agent_sdk",
    displayName: "Claude Agent SDK",
    availability: "available",
  },
] as const satisfies readonly AgentEngine[];

export function createAgentEngineCatalog(
  engines: readonly AgentEngine[] = defaultAgentEngines,
): AgentEngineCatalog {
  return new Map(engines.map((engine) => [engine.kind, engine]));
}

export function resolveAgentEngineForProvider(
  provider: ModelProvider,
  catalog: AgentEngineCatalog = createAgentEngineCatalog(),
): EngineResolution {
  if (provider.kind === "openai") {
    return resolveKnownEngine(provider, catalog, "codex_sdk");
  }

  if (provider.kind === "anthropic" || provider.kind === "claude") {
    return resolveKnownEngine(provider, catalog, "claude_agent_sdk");
  }

  if (provider.kind === "local") {
    return {
      provider,
      status: "no_engine_supported",
      selectedEngine: null,
      reason:
        "Local providers are represented as model endpoints, but no local Agent Engine support exists yet.",
    };
  }

  return {
    provider,
    status: "unknown_provider",
    selectedEngine: null,
    reason: "No Agent Engine mapping exists for this provider.",
  };
}

function resolveKnownEngine(
  provider: ModelProvider,
  catalog: AgentEngineCatalog,
  engineKind: AgentEngineKind,
): EngineResolution {
  const engine = catalog.get(engineKind);

  if (engine?.availability === "available") {
    return {
      provider,
      status: "engine_selected",
      selectedEngine: engine,
      reason: `${engine.displayName} is available for ${provider.displayName}.`,
    };
  }

  return {
    provider,
    status: "engine_unavailable",
    selectedEngine: null,
    reason: `The mapped Agent Engine is not available for ${provider.displayName}.`,
  };
}
