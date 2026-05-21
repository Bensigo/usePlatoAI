import {
  createAgentEngineCatalogFromAdapters,
  createClaudeAgentSdkAgentEngineAdapter,
  createCodexSdkAgentEngineAdapter,
  createProviderSecretReference,
  getProviderAuthAvailabilitySnapshot,
  resolveAgentEngineForProvider,
  type EngineResolution,
  type ModelProvider,
  type ProviderAuthAvailabilitySnapshot,
  type SecretReference,
  type SecretStore,
} from "@useplatoai/agent-engine";

type ProviderOption = ModelProvider & {
  authLabel: string;
  availabilityLabel: string;
  costWarning: string;
};

export interface ProviderSettingsSurface {
  selectProvider(providerId: string): Promise<void>;
}

class DemoSecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  constructor(secrets: readonly [SecretReference, string][]) {
    for (const [reference, value] of secrets) {
      this.values.set(reference.id, value);
    }
  }

  read(reference: SecretReference): string | null {
    return this.values.get(reference.id) ?? null;
  }

  write(reference: SecretReference, value: string): void {
    this.values.set(reference.id, value);
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

const demoSecretStore = new DemoSecretStore([
  [openAiSecretReference, "present"],
  [anthropicSecretReference, "present"],
]);

const runtimeCatalog = createAgentEngineCatalogFromAdapters(
  new Map([
    [
      "codex_sdk",
      createCodexSdkAgentEngineAdapter({ runtimeAvailable: true }),
    ],
    [
      "claude_agent_sdk",
      createClaudeAgentSdkAgentEngineAdapter({ runtimeAvailable: true }),
    ],
  ]),
);

const providers: ProviderOption[] = [
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
    availabilityLabel: "Cloud provider available when the stored key is present.",
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
    availabilityLabel: "Cloud provider available when the stored key is present.",
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
      isAuthenticated: true,
      accountHint: "operator@example.com",
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
    localEndpoint: "http://localhost:11434",
    authState: {
      mode: "local_model_endpoint",
      endpoint: "http://localhost:11434",
    },
    authLabel: "Local model endpoint",
    availabilityLabel: "Local provider endpoint is configured on this machine.",
    costWarning:
      "Local providers can reduce API cost, but agent-engine task execution is unavailable until implemented.",
  },
];

export function renderProviderSettings(root: HTMLElement): ProviderSettingsSurface {
  let selectedProviderId = providers[0]?.id ?? "";
  let renderVersion = 0;

  async function render() {
    const currentRenderVersion = ++renderVersion;
    const selectedProvider =
      providers.find((provider) => provider.id === selectedProviderId) ??
      providers[0];

    if (!selectedProvider) {
      root.replaceChildren();
      return;
    }

    const [authSnapshot, engineResolution] = await Promise.all([
      selectedProvider.authState
        ? getProviderAuthAvailabilitySnapshot(
            selectedProvider.authState,
            demoSecretStore,
          )
        : Promise.resolve<ProviderAuthAvailabilitySnapshot>({
            mode: selectedProvider.authMode,
            availability: "not_configured",
            hasSecretReference: false,
          }),
      Promise.resolve(
        resolveAgentEngineForProvider(selectedProvider, runtimeCatalog),
      ),
    ]);

    if (currentRenderVersion !== renderVersion) {
      return;
    }

    root.replaceChildren(
      buildShell(selectedProvider, authSnapshot, engineResolution),
    );
  }

  function buildShell(
    selectedProvider: ProviderOption,
    authSnapshot: ProviderAuthAvailabilitySnapshot,
    engineResolution: EngineResolution,
  ) {
    const shell = element("section", "provider-settings");
    shell.append(
      buildHeader(),
      buildProviderTabs(selectedProvider.id),
      buildProviderPanel(selectedProvider, authSnapshot, engineResolution),
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

    for (const provider of providers) {
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
    engineResolution: EngineResolution,
  ) {
    const panel = element("article", "provider-settings__panel");
    const status = authStatusLabel(authSnapshot);
    const engineName =
      engineResolution.selectedEngine?.displayName ??
      fallbackEngineName(engineResolution);

    panel.append(
      buildSection("Provider", [
        ["Selected provider", provider.displayName],
        ["Auth type", provider.authLabel],
        ["Provider availability", provider.availabilityLabel],
        ["Auth status", status],
        [
          "Endpoint",
          authSnapshot.endpoint ?? provider.localEndpoint ?? "Not applicable",
        ],
      ]),
      buildSection("Agent Engine", [
        ["Selected engine", engineName],
        ["Engine state", engineStateLabel(engineResolution)],
        ["Reason", engineResolution.reason],
      ]),
      buildWarning(
        provider.costWarning,
        engineResolution.status === "no_engine_supported",
      ),
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
    if (!providers.some((provider) => provider.id === providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    selectedProviderId = providerId;
    await render();
  }

  void render();

  return {
    selectProvider,
  };
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
