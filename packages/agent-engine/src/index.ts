export type ProviderKind = "openai" | "anthropic" | "claude" | "local" | "unknown";

export type ProviderAuthMode =
  | "api_key"
  | "local_sdk_auth"
  | "subscription_local_auth"
  | "local_model_endpoint"
  | "none";

export type ProviderAuthAvailability =
  | "ready"
  | "missing_secret"
  | "missing_local_auth"
  | "missing_endpoint"
  | "not_configured";

export interface SecretReference {
  store: "secret_store";
  id: string;
  description: string;
}

export interface SecretStore {
  write(reference: SecretReference, value: string): void | Promise<void>;
  read(reference: SecretReference): string | null | Promise<string | null>;
}

export interface ApiKeyProviderAuthState {
  mode: "api_key";
  secretReference: SecretReference;
}

export interface LocalSdkProviderAuthState {
  mode: "local_sdk_auth";
  sdkName: string;
  isAuthenticated: boolean;
  accountHint?: string;
}

export interface SubscriptionLocalProviderAuthState {
  mode: "subscription_local_auth";
  subscriptionName: string;
  isAuthenticated: boolean;
  accountHint?: string;
}

export interface LocalModelEndpointProviderAuthState {
  mode: "local_model_endpoint";
  endpoint: string;
}

export interface UnconfiguredProviderAuthState {
  mode: "none";
}

export type ProviderAuthState =
  | ApiKeyProviderAuthState
  | LocalSdkProviderAuthState
  | SubscriptionLocalProviderAuthState
  | LocalModelEndpointProviderAuthState
  | UnconfiguredProviderAuthState;

export interface ProviderAuthAvailabilitySnapshot {
  mode: ProviderAuthMode;
  availability: ProviderAuthAvailability;
  hasSecretReference: boolean;
  accountHint?: string;
  endpoint?: string;
}

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
  authState?: ProviderAuthState;
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
    availability: "unavailable",
  },
  {
    kind: "claude_agent_sdk",
    displayName: "Claude Agent SDK",
    availability: "unavailable",
  },
] as const satisfies readonly AgentEngine[];

export function createAgentEngineCatalog(
  engines: readonly AgentEngine[] = defaultAgentEngines,
): AgentEngineCatalog {
  return new Map(engines.map((engine) => [engine.kind, engine]));
}

export async function createApiKeyProviderAuthState(input: {
  providerId: string;
  providerDisplayName: string;
  apiKey: string;
  secretStore: SecretStore;
}): Promise<ApiKeyProviderAuthState> {
  const secretReference = createProviderSecretReference({
    providerId: input.providerId,
    authMode: "api_key",
    description: `${input.providerDisplayName} API key`,
  });

  await input.secretStore.write(secretReference, input.apiKey);

  return {
    mode: "api_key",
    secretReference,
  };
}

export function createProviderSecretReference(input: {
  providerId: string;
  authMode: ProviderAuthMode;
  description: string;
}): SecretReference {
  return {
    store: "secret_store",
    id: `provider:${input.providerId}:${input.authMode}`,
    description: input.description,
  };
}

export async function readProviderSecret(
  secretStore: SecretStore,
  reference: SecretReference,
): Promise<string | null> {
  return secretStore.read(reference);
}

export async function getProviderAuthAvailabilitySnapshot(
  authState: ProviderAuthState,
  secretStore?: SecretStore,
): Promise<ProviderAuthAvailabilitySnapshot> {
  if (authState.mode === "api_key") {
    const secret = secretStore
      ? await readProviderSecret(secretStore, authState.secretReference)
      : null;

    return {
      mode: authState.mode,
      availability: secret ? "ready" : "missing_secret",
      hasSecretReference: true,
    };
  }

  if (authState.mode === "local_sdk_auth") {
    return {
      mode: authState.mode,
      availability: authState.isAuthenticated ? "ready" : "missing_local_auth",
      hasSecretReference: false,
      accountHint: authState.accountHint,
    };
  }

  if (authState.mode === "subscription_local_auth") {
    return {
      mode: authState.mode,
      availability: authState.isAuthenticated ? "ready" : "missing_local_auth",
      hasSecretReference: false,
      accountHint: authState.accountHint,
    };
  }

  if (authState.mode === "local_model_endpoint") {
    return {
      mode: authState.mode,
      availability: authState.endpoint ? "ready" : "missing_endpoint",
      hasSecretReference: false,
      endpoint: authState.endpoint,
    };
  }

  return {
    mode: authState.mode,
    availability: "not_configured",
    hasSecretReference: false,
  };
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
