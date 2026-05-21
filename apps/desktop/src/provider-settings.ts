import {
  createAgentEngineCatalogFromAdapters,
  createAgentEngineAdapterRegistry,
  createClaudeAgentSdkAgentEngineAdapter,
  createCodexSdkAgentEngineAdapter,
  createMemoryLocalTaskRepository,
  createProviderSecretReference,
  getProviderAuthAvailabilitySnapshot,
  runMockedEngineBackedTask,
  resolveAgentEngineForProvider,
  type AgentEngineAdapter,
  type AgentEngineAdapterRegistry,
  type AgentEngineCatalog,
  type EngineResolution,
  type LocalTaskRecord,
  type LocalTaskRepository,
  type ModelProvider,
  type ProviderAuthAvailabilitySnapshot,
  type SecretReference,
  type SecretStore,
} from "@useplatoai/agent-engine";

export type ProviderOption = ModelProvider & {
  authLabel: string;
  availabilityLabel: string;
  costWarning: string;
};

type EngineDisplayState = {
  engineName: string;
  stateLabel: string;
  reason: string;
  isBlocking: boolean;
};

export interface ProviderSettingsSurface {
  root: HTMLElement;
  currentTask: Promise<LocalTaskRecord | null>;
  selectProvider(providerId: string): Promise<void>;
  launchMockedTask(): Promise<LocalTaskRecord>;
}

class ProviderSettingsSecretStore implements SecretStore {
  read(reference: SecretReference): string | null {
    void reference;
    return null;
  }

  write(reference: SecretReference, value: string): void {
    void reference;
    void value;
  }
}

const openAiSecretReference = createProviderSecretReference({
  providerId: "openai",
  authMode: "api_key",
  description: "OpenAI API key",
});

const anthropicSecretReference = createProviderSecretReference({
  providerId: "anthropic",
  authMode: "api_key",
  description: "Anthropic API key",
});

const defaultProviderSettingsSecretStore = new ProviderSettingsSecretStore();

const defaultRuntimeAdapters = [
  createCodexSdkAgentEngineAdapter({ runtimeAvailable: false }),
  createClaudeAgentSdkAgentEngineAdapter({ runtimeAvailable: false }),
] satisfies AgentEngineAdapter[];

const defaultProviders: ProviderOption[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    kind: "openai",
    authMode: "api_key",
    authState: {
      mode: "api_key",
      secretReference: openAiSecretReference,
    },
    authLabel: "API key provider",
    availabilityLabel: "Cloud provider waits for a stored key before work can run.",
    costWarning:
      "Token and API usage may create spend. Review task scope before running engine-backed work.",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    kind: "anthropic",
    authMode: "api_key",
    authState: {
      mode: "api_key",
      secretReference: anthropicSecretReference,
    },
    authLabel: "API key provider",
    availabilityLabel: "Cloud provider waits for a stored key before work can run.",
    costWarning:
      "Claude API usage may create spend. Keep long-running tasks approval-gated.",
  },
  {
    id: "claude",
    displayName: "Claude Code",
    kind: "claude",
    authMode: "local_sdk_auth",
    authState: {
      mode: "local_sdk_auth",
      sdkName: "Claude Code",
      isAuthenticated: false,
    },
    authLabel: "Local SDK auth",
    availabilityLabel: "Uses an existing local SDK login instead of storing an app-owned key.",
    costWarning:
      "Subscription-backed local auth is separate from API-key billing and must stay explicit.",
  },
  {
    id: "claude-pro",
    displayName: "Claude Pro",
    kind: "claude",
    authMode: "subscription_local_auth",
    authState: {
      mode: "subscription_local_auth",
      subscriptionName: "Claude Pro",
      isAuthenticated: false,
    },
    authLabel: "Subscription-backed local auth",
    availabilityLabel: "Requires a supported local auth path before engine work can run.",
    costWarning:
      "Subscription access does not equal API access unless the local SDK exposes supported auth.",
  },
  {
    id: "local",
    displayName: "Ollama",
    kind: "local",
    authMode: "local_model_endpoint",
    authState: {
      mode: "local_model_endpoint",
      endpoint: "",
    },
    authLabel: "Local model endpoint",
    availabilityLabel: "Local provider waits for a configured endpoint.",
    costWarning:
      "Local providers can reduce API cost, but agent-engine task execution is unavailable until implemented.",
  },
];

export interface ProviderSettingsOptions {
  providers?: ProviderOption[];
  adapters?: readonly AgentEngineAdapter[];
  secretStore?: SecretStore;
  repository?: LocalTaskRepository;
  now?: () => Date;
}

export function renderProviderSettings(
  root: HTMLElement,
  options: ProviderSettingsOptions = {},
): ProviderSettingsSurface {
  const providerOptions = options.providers ?? defaultProviders;
  const secretStore = options.secretStore ?? defaultProviderSettingsSecretStore;
  const adapters = createAgentEngineAdapterRegistry(
    options.adapters ?? defaultRuntimeAdapters,
  );
  const catalog = createAgentEngineCatalogFromAdapters(adapters);
  const repository =
    options.repository ??
    createMemoryLocalTaskRepository({
      now: options.now,
    });
  let selectedProviderId = providerOptions[0]?.id ?? "";
  let renderVersion = 0;
  let latestTask: LocalTaskRecord | null = null;
  let currentTaskPromise: Promise<LocalTaskRecord | null> = Promise.resolve(null);

  async function render() {
    const currentRenderVersion = ++renderVersion;
    const selectedProvider =
      providerOptions.find((provider) => provider.id === selectedProviderId) ??
      providerOptions[0];

    if (!selectedProvider) {
      root.replaceChildren();
      return;
    }

    const [authSnapshot, engineDisplayState] = await Promise.all([
      selectedProvider.authState
        ? getProviderAuthAvailabilitySnapshot(
            selectedProvider.authState,
            secretStore,
          )
        : Promise.resolve<ProviderAuthAvailabilitySnapshot>({
            mode: selectedProvider.authMode,
            availability: "not_configured",
            hasSecretReference: false,
          }),
      getEngineDisplayState(selectedProvider, catalog, adapters, secretStore),
    ]);

    if (currentRenderVersion !== renderVersion) {
      return;
    }

    root.replaceChildren(
      buildShell(selectedProvider, authSnapshot, engineDisplayState),
    );
  }

  function buildShell(
    selectedProvider: ProviderOption,
    authSnapshot: ProviderAuthAvailabilitySnapshot,
    engineDisplayState: EngineDisplayState,
  ) {
    const shell = element("section", "provider-settings");
    shell.append(
      buildHeader(),
      buildProviderTabs(selectedProvider.id),
      buildProviderPanel(selectedProvider, authSnapshot, engineDisplayState),
      buildTaskTray(latestTask),
    );
    return shell;
  }

  function buildHeader() {
    const header = element("header", "provider-settings__header");
    header.append(
      element("p", "provider-settings__kicker", "Provider settings"),
      element("h1", "provider-settings__title", "Model Provider"),
      element(
        "p",
        "provider-settings__summary",
        "Configure the provider, verify auth, and see the compatible Agent Engine before Plato runs engine-backed tasks.",
      ),
    );
    return header;
  }

  function buildProviderTabs(activeProviderId: string) {
    const group = element("div", "provider-settings__tabs");
    group.setAttribute("role", "tablist");
    group.setAttribute("aria-label", "Model providers");

    for (const provider of providerOptions) {
      const button = element(
        "button",
        "provider-settings__tab",
        provider.displayName,
      );
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute(
        "aria-selected",
        String(provider.id === activeProviderId),
      );
      button.dataset.providerId = provider.id;
      if (provider.id === activeProviderId) {
        button.classList.add("provider-settings__tab--active");
      }
      button.addEventListener("click", () => {
        void selectProvider(provider.id);
      });
      group.append(button);
    }

    return group;
  }

  function buildProviderPanel(
    provider: ProviderOption,
    authSnapshot: ProviderAuthAvailabilitySnapshot,
    engineDisplayState: EngineDisplayState,
  ) {
    const panel = element("article", "provider-settings__panel");
    const status = authStatusLabel(authSnapshot);

    panel.append(
      buildSection("Provider", [
        ["Selected provider", provider.displayName],
        ["Auth type", provider.authLabel],
        ["Provider availability", provider.availabilityLabel],
        ["Auth status", status],
        [
          "Endpoint",
          authSnapshot.endpoint || provider.localEndpoint || "Not applicable",
        ],
      ]),
      buildSection("Agent Engine", [
        ["Selected engine", engineDisplayState.engineName],
        ["Engine state", engineDisplayState.stateLabel],
        ["Reason", engineDisplayState.reason],
      ]),
      buildWarning(provider.costWarning, engineDisplayState.isBlocking),
    );

    return panel;
  }

  function buildSection(
    title: string,
    rows: readonly (readonly [string, string])[],
  ) {
    const section = element("section", "provider-settings__section");
    section.append(element("h2", "provider-settings__section-title", title));

    const list = element("dl", "provider-settings__facts");
    for (const [label, value] of rows) {
      list.append(
        element("dt", "provider-settings__fact-label", label),
        element("dd", "provider-settings__fact-value", value),
      );
    }
    section.append(list);
    return section;
  }

  function buildWarning(message: string, isBlocking: boolean) {
    const warning = element(
      "section",
      isBlocking
        ? "provider-settings__warning provider-settings__warning--blocking"
        : "provider-settings__warning",
    );
    warning.append(
      element("h2", "provider-settings__warning-title", "Cost and availability"),
      element("p", "provider-settings__warning-copy", message),
    );
    return warning;
  }

  async function selectProvider(providerId: string) {
    if (!providerOptions.some((provider) => provider.id === providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    selectedProviderId = providerId;
    await render();
  }

  function buildTaskTray(task: LocalTaskRecord | null) {
    const tray = element("section", "task-tray");
    tray.append(
      element("h2", "task-tray__title", "Task Tray"),
      buildMockedTaskLauncher(),
      task
        ? buildTaskRecord(task)
        : element("p", "task-tray__empty", "No tasks yet."),
    );
    return tray;
  }

  function buildMockedTaskLauncher() {
    const button = element(
      "button",
      "task-tray__launch",
      "Run mocked engine task",
    );
    button.type = "button";
    button.dataset.action = "launch-mocked-task";
    button.addEventListener("click", () => {
      void launchMockedTask();
    });
    return button;
  }

  function buildTaskRecord(task: LocalTaskRecord) {
    return buildSection("Current task", [
      ["Task title", task.title],
      ["Task status", taskStatusLabel(task.status)],
      ["Task result", task.summary],
      ["Verification", task.metadata.verification],
      ["Cost", task.metadata.costAwareness],
    ]);
  }

  async function launchMockedTask(): Promise<LocalTaskRecord> {
    const provider =
      providerOptions.find((candidate) => candidate.id === selectedProviderId) ??
      providerOptions[0];

    if (!provider) {
      throw new Error("No provider is available for mocked task launch.");
    }

    latestTask = {
      id: `task-${Date.now().toString(36)}`,
      title: "Summarize the current issue.",
      status: "running",
      summary: "Running mocked Agent Engine task.",
      metadata: {
        executionSource: "agent_engine",
        verification: "Mocked Agent Engine task was accepted by the local task model.",
        costAwareness:
          "Mocked execution only; no provider API call or token spend occurred.",
      },
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
    root.querySelector(".task-tray")?.replaceWith(buildTaskTray(latestTask));

    currentTaskPromise = runMockedEngineBackedTask({
      provider,
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["github"],
      adapters,
      catalog,
      secretStore,
      repository,
      now: options.now,
      onTaskChanged: async (task) => {
        latestTask = task;
        await render();
      },
    });

    const task = await currentTaskPromise;
    if (!task) {
      throw new Error("Mocked task did not return a task record.");
    }
    return task;
  }

  void render();

  return {
    root,
    get currentTask() {
      return currentTaskPromise;
    },
    selectProvider,
    launchMockedTask,
  };
}

async function getEngineDisplayState(
  provider: ModelProvider,
  catalog: AgentEngineCatalog,
  adapters: AgentEngineAdapterRegistry,
  secretStore: SecretStore,
): Promise<EngineDisplayState> {
  const resolution = resolveAgentEngineForProvider(provider, catalog);
  const engineName =
    resolution.selectedEngine?.displayName ?? fallbackEngineName(resolution);

  if (resolution.status !== "engine_selected" || !resolution.selectedEngine) {
    return {
      engineName,
      stateLabel: engineStateLabel(resolution),
      reason: resolution.reason,
      isBlocking: resolution.status !== "engine_selected",
    };
  }

  const adapter = adapters.get(resolution.selectedEngine.kind);
  if (!adapter) {
    return {
      engineName,
      stateLabel: "Unavailable",
      reason: `${engineName} adapter is not registered.`,
      isBlocking: true,
    };
  }

  const adapterState = await adapter.getState(
    provider,
    secretStore,
  );

  return {
    engineName,
    stateLabel:
      adapterState.status === "available" ? "Available" : "Unavailable",
    reason: adapterState.reason,
    isBlocking: adapterState.status !== "available",
  };
}

function taskStatusLabel(status: LocalTaskRecord["status"]): string {
  if (status === "completed") {
    return "Completed";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Running";
}

function authStatusLabel(snapshot: ProviderAuthAvailabilitySnapshot): string {
  if (snapshot.availability === "ready" && snapshot.accountHint) {
    return `Signed in as ${snapshot.accountHint}`;
  }

  if (snapshot.availability === "ready") {
    return "Auth ready";
  }

  if (snapshot.availability === "missing_secret") {
    return "Auth missing: stored secret is not available";
  }

  if (snapshot.availability === "missing_local_auth") {
    return "Auth missing: local login is not available";
  }

  if (snapshot.availability === "missing_endpoint") {
    return "Auth missing: local endpoint is not configured";
  }

  return "Auth not configured";
}

function engineStateLabel(resolution: EngineResolution): string {
  if (resolution.status === "engine_selected") {
    return "Available";
  }

  if (resolution.status === "no_engine_supported") {
    return "No Agent Engine supported yet";
  }

  return "Unavailable";
}

function fallbackEngineName(resolution: EngineResolution): string {
  if (resolution.provider.kind === "openai") {
    return "Codex SDK";
  }

  if (
    resolution.provider.kind === "anthropic" ||
    resolution.provider.kind === "claude"
  ) {
    return "Claude Agent SDK";
  }

  return "No Agent Engine";
}

function element<TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  className: string,
  textContent?: string,
): HTMLElementTagNameMap[TagName] {
  const node = document.createElement(tagName);
  node.className = className;
  if (textContent !== undefined) {
    node.textContent = textContent;
  }
  return node;
}
