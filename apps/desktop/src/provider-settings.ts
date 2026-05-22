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
import {
  assertCapabilityInvocationAllowed,
  evaluateBrowserAutomationActionGate,
  createDefaultCapabilityRegistryRepository,
  getCapabilityRegistrySnapshot,
  registerCustomSkill,
  setCapabilityEnabled,
  type BrowserAutomationActionKind,
  type CapabilityRecord,
  type CapabilityRegistryRepository,
  type CapabilityRegistrySnapshot,
  type CapabilityType,
  type CustomSkillRegistrationResult,
} from "@useplatoai/capabilities";

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
  ready: Promise<void>;
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

class MockedTaskSecretStore implements SecretStore {
  read(reference: SecretReference): string | null {
    if (reference.id.startsWith("provider:") && reference.id.endsWith(":api_key")) {
      return "mocked-provider-secret";
    }

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
const defaultMockedTaskSecretStore = new MockedTaskSecretStore();

const defaultRuntimeAdapters = [
  createCodexSdkAgentEngineAdapter({ runtimeAvailable: false }),
  createClaudeAgentSdkAgentEngineAdapter({ runtimeAvailable: false }),
] satisfies AgentEngineAdapter[];

const defaultMockedTaskAdapters = [
  createCodexSdkAgentEngineAdapter({ runtimeAvailable: true }),
  createClaudeAgentSdkAgentEngineAdapter({ runtimeAvailable: true }),
] satisfies AgentEngineAdapter[];

const highImpactBrowserActions = [
  "submit_form",
  "purchase",
  "destructive_action",
  "sensitive_logged_in_context",
] as const satisfies readonly BrowserAutomationActionKind[];

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
  mockedTaskAdapters?: readonly AgentEngineAdapter[];
  secretStore?: SecretStore;
  mockedTaskSecretStore?: SecretStore;
  repository?: LocalTaskRepository;
  capabilityRepository?: CapabilityRegistryRepository;
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
  const mockedTaskAdapters = createAgentEngineAdapterRegistry(
    options.mockedTaskAdapters ?? defaultMockedTaskAdapters,
  );
  const mockedTaskSecretStore =
    options.mockedTaskSecretStore ?? defaultMockedTaskSecretStore;
  const catalog = createAgentEngineCatalogFromAdapters(adapters);
  const mockedTaskCatalog = createAgentEngineCatalogFromAdapters(mockedTaskAdapters);
  const repository =
    options.repository ??
    createMemoryLocalTaskRepository({
      now: options.now,
    });
  const capabilityRepository =
    options.capabilityRepository ?? createDefaultCapabilityRegistryRepository();
  let selectedProviderId = providerOptions[0]?.id ?? "";
  let renderVersion = 0;
  let latestTask: LocalTaskRecord | null = null;
  let currentTaskPromise: Promise<LocalTaskRecord | null> = Promise.resolve(null);
  let customSkillRegistrationResult: CustomSkillRegistrationResult | null = null;
  let pendingBrowserAction: BrowserAutomationActionKind | null = null;
  let browserAutomationEnabled = false;

  async function render() {
    const currentRenderVersion = ++renderVersion;
    const selectedProvider =
      providerOptions.find((provider) => provider.id === selectedProviderId) ??
      providerOptions[0];

    if (!selectedProvider) {
      root.replaceChildren();
      return;
    }

    const [authSnapshot, engineDisplayState, capabilitySnapshot] =
      await Promise.all([
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
        getCapabilityRegistrySnapshot(capabilityRepository),
      ]);

    if (currentRenderVersion !== renderVersion) {
      return;
    }

    browserAutomationEnabled = isBrowserAutomationEnabled(capabilitySnapshot);
    root.replaceChildren(
      buildShell(
        selectedProvider,
        authSnapshot,
        engineDisplayState,
        capabilitySnapshot,
      ),
    );
  }

  function buildShell(
    selectedProvider: ProviderOption,
    authSnapshot: ProviderAuthAvailabilitySnapshot,
    engineDisplayState: EngineDisplayState,
    capabilitySnapshot: CapabilityRegistrySnapshot,
  ) {
    const shell = element("section", "provider-settings");
    shell.append(
      buildHeader(),
      buildProviderTabs(selectedProvider.id),
      buildProviderPanel(selectedProvider, authSnapshot, engineDisplayState),
      buildCapabilityRegistry(capabilitySnapshot),
      buildTaskTray(latestTask, browserAutomationEnabled),
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

  function buildCapabilityRegistry(snapshot: CapabilityRegistrySnapshot) {
    const registry = element("section", "capability-registry");
    registry.append(
      element("h2", "capability-registry__title", "Capability Registry"),
      buildCapabilitySummary(snapshot),
      buildCustomSkillRegistrationForm(),
    );

    const list = element("div", "capability-registry__list");
    for (const capability of snapshot.capabilities) {
      list.append(buildCapabilityCard(capability));
    }
    registry.append(list);

    return registry;
  }

  function buildCustomSkillRegistrationForm() {
    const form = element("form", "capability-registry__custom-skill-form");
    form.dataset.customSkillForm = "true";
    form.append(
      element("h3", "capability-registry__form-title", "Register custom skill"),
      buildCustomSkillInput(
        "custom-skill-id",
        "Stable id",
        "daily-planning-skill",
      ),
      buildCustomSkillInput(
        "custom-skill-display-name",
        "Display name",
        "Daily Planning Skill",
      ),
      buildCustomSkillTextArea(
        "custom-skill-description",
        "Description",
        "Turns a rough day plan into a sequenced task list.",
      ),
      buildCustomSkillInput(
        "custom-skill-source-reference",
        "Local source reference",
        "~/plato/skills/daily-planning/SKILL.md",
      ),
      buildCustomSkillRegistrationResult(),
    );

    const submit = element(
      "button",
      "capability-registry__custom-skill-submit",
      "Register skill",
    );
    submit.type = "submit";
    form.append(submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleCustomSkillRegistration(form);
    });
    return form;
  }

  function buildCustomSkillInput(
    name: string,
    labelText: string,
    placeholder: string,
  ) {
    const label = element("label", "capability-registry__field");
    const input = element("input", "capability-registry__input");
    input.name = name;
    input.placeholder = placeholder;
    label.append(
      element("span", "capability-registry__field-label", labelText),
      input,
    );
    return label;
  }

  function buildCustomSkillTextArea(
    name: string,
    labelText: string,
    placeholder: string,
  ) {
    const label = element("label", "capability-registry__field");
    const textarea = element("textarea", "capability-registry__textarea");
    textarea.name = name;
    textarea.placeholder = placeholder;
    label.append(
      element("span", "capability-registry__field-label", labelText),
      textarea,
    );
    return label;
  }

  function buildCustomSkillRegistrationResult() {
    const result = element("p", "capability-registry__form-result");
    result.dataset.customSkillRegistrationResult = "true";
    if (!customSkillRegistrationResult) {
      result.textContent = "No custom skill registered in this session.";
      return result;
    }

    result.textContent = customSkillRegistrationResult.message;
    result.dataset.resultState = customSkillRegistrationResult.ok
      ? "valid"
      : "invalid";
    return result;
  }

  function buildCapabilitySummary(snapshot: CapabilityRegistrySnapshot) {
    return buildSection("Capability state", [
      ["Enabled", String(snapshot.enabled.length)],
      ["Available", String(snapshot.available.length)],
      ["Disabled", String(snapshot.disabled.length)],
      ["Unavailable", String(snapshot.unavailable.length)],
    ]);
  }

  function buildCapabilityCard(capability: CapabilityRecord) {
    const card = element("article", "capability-registry__card");
    card.dataset.capabilityId = capability.id;
    card.append(
      element("h3", "capability-registry__card-title", capability.displayName),
      element(
        "p",
        "capability-registry__status",
        capabilityStatusLabel(capability),
      ),
      buildCapabilityDetails([
        ["Type", capabilityTypeLabel(capability.type)],
        ["Source", capabilitySourceLabel(capability)],
        ["Enabled state", capability.enabled ? "Enabled" : "Disabled"],
        [
          "Availability",
          capability.status === "available" ? "Available" : "Unavailable",
        ],
      ]),
    );

    if (capability.description) {
      card.append(
        element(
          "p",
          "capability-registry__description",
          capability.description,
        ),
      );
    }

    const controls = buildCapabilityControls(capability);
    if (controls) {
      card.append(controls);
    }

    return card;
  }

  function buildCapabilityControls(capability: CapabilityRecord) {
    if (!isControllableCapability(capability)) {
      return null;
    }

    const controls = element("div", "capability-registry__controls");
    const action = capability.enabled ? "disable" : "enable";
    const button = element(
      "button",
      "capability-registry__control",
      capability.enabled
        ? `Disable ${capabilityControlNoun(capability)}`
        : `Enable ${capabilityControlNoun(capability)}`,
    );
    button.type = "button";
    button.dataset.capabilityAction = action;
    button.dataset.capabilityId = capability.id;
    button.addEventListener("click", () => {
      void updateCapabilityEnabled(capability.id, !capability.enabled);
    });
    controls.append(button);
    return controls;
  }

  function buildCapabilityDetails(rows: readonly (readonly [string, string])[]) {
    const list = element("dl", "capability-registry__facts");
    for (const [label, value] of rows) {
      list.append(
        element("dt", "capability-registry__fact-label", label),
        element("dd", "capability-registry__fact-value", value),
      );
    }
    return list;
  }

  async function selectProvider(providerId: string) {
    if (!providerOptions.some((provider) => provider.id === providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    selectedProviderId = providerId;
    await render();
  }

  async function updateCapabilityEnabled(
    capabilityId: string,
    enabled: boolean,
  ) {
    await setCapabilityEnabled(capabilityRepository, capabilityId, enabled);
    if (capabilityId === "browser-automation" && !enabled) {
      const revoked = await revokeActiveBrowserAutomationTask();
      if (revoked) {
        return;
      }
    }
    await render();
  }

  async function handleCustomSkillRegistration(form: HTMLFormElement) {
    const data = new FormData(form);
    customSkillRegistrationResult = await registerCustomSkill(
      capabilityRepository,
      {
        id: stringFormValue(data, "custom-skill-id"),
        displayName: stringFormValue(data, "custom-skill-display-name"),
        description: stringFormValue(data, "custom-skill-description"),
        localSourceReference: stringFormValue(
          data,
          "custom-skill-source-reference",
        ),
      },
    );
    await render();
  }

  function buildTaskTray(
    task: LocalTaskRecord | null,
    browserAutomationEnabled: boolean,
  ) {
    const tray = element("section", "task-tray");
    tray.append(
      element("h2", "task-tray__title", "Task Tray"),
      buildMockedTaskLauncher(),
      buildBrowserAutomationLauncher(browserAutomationEnabled),
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

  function buildBrowserAutomationLauncher(browserAutomationEnabled: boolean) {
    const group = element("div", "task-tray__browser-automation");
    const button = element(
      "button",
      "task-tray__launch",
      "Start browser automation demo",
    );
    button.type = "button";
    button.dataset.action = "start-browser-automation";
    button.disabled = !browserAutomationEnabled;
    button.addEventListener("click", () => {
      void startBrowserAutomationTask();
    });
    group.append(button);

    if (!browserAutomationEnabled) {
      group.append(
        element(
          "p",
          "task-tray__hint",
          "Enable Browser Automation before starting a mocked browser task.",
        ),
      );
    }

    return group;
  }

  function buildTaskRecord(task: LocalTaskRecord) {
    const record = element("section", "task-tray__record");
    record.append(
      buildSection("Current task", [
        ["Task title", task.title],
        ["Task status", taskStatusLabel(task.status)],
        ["Task result", task.summary],
        ["Verification", task.metadata.verification],
        ["Cost", task.metadata.costAwareness],
      ]),
    );

    if (task.metadata.executionSource === "browser_automation") {
      record.append(buildBrowserAutomationTaskControls(task));
    }

    return record;
  }

  function buildBrowserAutomationTaskControls(task: LocalTaskRecord) {
    const controls = element("div", "task-tray__controls");

    if (task.status === "running") {
      controls.append(
        buildTaskActionButton(
          "Pause browser automation",
          "pause-browser-automation",
          () => {
            void pauseBrowserAutomationTask();
          },
        ),
      );

      for (const actionKind of highImpactBrowserActions) {
        controls.append(buildBrowserActionButton(actionKind));
      }
    }

    if (task.status === "paused") {
      controls.append(
        buildTaskActionButton(
          "Resume browser automation",
          "resume-browser-automation",
          () => {
            void resumeBrowserAutomationTask();
          },
        ),
      );
    }

    if (task.status === "waiting_for_approval") {
      controls.append(
        buildTaskActionButton(
          "Approve",
          "approve-browser-action",
          () => {
            void resolvePendingBrowserAction("approved");
          },
        ),
        buildTaskActionButton(
          "Reject",
          "reject-browser-action",
          () => {
            void resolvePendingBrowserAction("rejected");
          },
        ),
      );
    }

    return controls;
  }

  function buildBrowserActionButton(actionKind: BrowserAutomationActionKind) {
    const button = element(
      "button",
      "task-tray__control",
      browserActionLabel(actionKind),
    );
    button.type = "button";
    button.dataset.browserAction = actionKind;
    button.addEventListener("click", () => {
      void requestBrowserAction(actionKind);
    });
    return button;
  }

  function buildTaskActionButton(
    label: string,
    action: string,
    handler: () => void,
  ) {
    const button = element("button", "task-tray__control", label);
    button.type = "button";
    button.dataset.action = action;
    button.addEventListener("click", handler);
    return button;
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
    root
      .querySelector(".task-tray")
      ?.replaceWith(buildTaskTray(latestTask, browserAutomationEnabled));

    currentTaskPromise = runPolicyCheckedMockedTask(provider);

    const task = await currentTaskPromise;
    if (!task) {
      throw new Error("Mocked task did not return a task record.");
    }
    return task;
  }

  async function startBrowserAutomationTask(): Promise<LocalTaskRecord> {
    const now = currentTimestamp();
    pendingBrowserAction = null;

    try {
      await assertCapabilityInvocationAllowed(
        capabilityRepository,
        "browser-automation",
      );
    } catch (error) {
      const blockedTask: LocalTaskRecord = {
        id: `task-browser-${Date.now().toString(36)}`,
        title: "Browser automation demo",
        status: "blocked",
        summary:
          error instanceof Error
            ? error.message
            : "Browser automation capability blocked.",
        metadata: {
          executionSource: "capability_policy",
          verification:
            "Browser automation did not start because the capability policy blocked invocation.",
          costAwareness:
            "Mocked browser automation only; no browser page was changed.",
        },
        createdAt: now,
        updatedAt: now,
      };
      currentTaskPromise = Promise.resolve(blockedTask);
      return saveBrowserAutomationTask(blockedTask);
    }

    const task: LocalTaskRecord = {
      id: `task-browser-${Date.now().toString(36)}`,
      title: "Browser automation demo",
      status: "running",
      summary: "Mocked browser automation is running visibly in the task tray.",
      metadata: {
        executionSource: "browser_automation",
        verification:
          "Browser automation capability was enabled before the mocked browser task started.",
        costAwareness:
          "Mocked browser automation only; no browser page was changed.",
      },
      createdAt: now,
      updatedAt: now,
    };
    currentTaskPromise = Promise.resolve(task);
    return saveBrowserAutomationTask(task);
  }

  async function pauseBrowserAutomationTask() {
    if (
      !latestTask ||
      latestTask.metadata.executionSource !== "browser_automation"
    ) {
      return;
    }

    await saveBrowserAutomationTask({
      ...latestTask,
      status: "paused",
      summary: "Mocked browser automation is paused by the user.",
      metadata: {
        ...latestTask.metadata,
        verification:
          "User paused the visible mocked browser automation task before further browser action.",
      },
      updatedAt: currentTimestamp(),
    });
  }

  async function resumeBrowserAutomationTask() {
    if (
      !latestTask ||
      latestTask.metadata.executionSource !== "browser_automation"
    ) {
      return;
    }

    await saveBrowserAutomationTask({
      ...latestTask,
      status: "running",
      summary: "Mocked browser automation resumed and is visible in the task tray.",
      metadata: {
        ...latestTask.metadata,
        verification: "User resumed the visible mocked browser automation task.",
      },
      updatedAt: currentTimestamp(),
    });
  }

  async function requestBrowserAction(actionKind: BrowserAutomationActionKind) {
    if (
      !latestTask ||
      latestTask.metadata.executionSource !== "browser_automation" ||
      latestTask.status !== "running"
    ) {
      return;
    }

    const gate = evaluateBrowserAutomationActionGate({
      kind: actionKind,
      label: browserActionLabel(actionKind),
    });

    if (gate.decision === "waiting_for_approval") {
      pendingBrowserAction = actionKind;
      await saveBrowserAutomationTask({
        ...latestTask,
        status: "waiting_for_approval",
        summary: gate.reason,
        metadata: {
          ...latestTask.metadata,
          verification: gate.verification,
        },
        updatedAt: currentTimestamp(),
      });
      return;
    }

    await saveBrowserAutomationTask({
      ...latestTask,
      status: "completed",
      summary: `${browserActionLabel(actionKind)} completed without approval.`,
      metadata: {
        ...latestTask.metadata,
        verification: gate.verification,
      },
      updatedAt: currentTimestamp(),
      completedAt: currentTimestamp(),
    });
  }

  async function resolvePendingBrowserAction(
    decision: "approved" | "rejected",
  ) {
    if (
      !latestTask ||
      latestTask.metadata.executionSource !== "browser_automation" ||
      latestTask.status !== "waiting_for_approval" ||
      !pendingBrowserAction
    ) {
      return;
    }

    const actionLabel = browserActionLabel(pendingBrowserAction);
    pendingBrowserAction = null;
    const now = currentTimestamp();

    if (decision === "approved") {
      try {
        await assertCapabilityInvocationAllowed(
          capabilityRepository,
          "browser-automation",
        );
      } catch {
        await saveBrowserAutomationTask({
          ...latestTask,
          status: "blocked",
          summary:
            "Browser Automation was disabled before the mocked browser action could execute.",
          metadata: {
            ...latestTask.metadata,
            verification:
              "Pending browser action was blocked because Browser Automation was disabled before approval.",
          },
          updatedAt: now,
          completedAt: now,
        });
        return;
      }
    }

    await saveBrowserAutomationTask({
      ...latestTask,
      status: decision === "approved" ? "completed" : "blocked",
      summary:
        decision === "approved"
          ? `Approved ${actionLabel}. Mocked browser action completed.`
          : `Rejected ${actionLabel}. Mocked browser action did not execute.`,
      metadata: {
        ...latestTask.metadata,
        verification:
          decision === "approved"
            ? "User approved the high-impact mocked browser action before execution."
            : "User rejected the high-impact mocked browser action; no browser change occurred.",
      },
      updatedAt: now,
      completedAt: now,
    });
  }

  async function revokeActiveBrowserAutomationTask(): Promise<boolean> {
    if (
      !latestTask ||
      latestTask.metadata.executionSource !== "browser_automation" ||
      (latestTask.status !== "running" &&
        latestTask.status !== "paused" &&
        latestTask.status !== "waiting_for_approval")
    ) {
      return false;
    }

    pendingBrowserAction = null;
    const now = currentTimestamp();
    await saveBrowserAutomationTask({
      ...latestTask,
      status: "blocked",
      summary:
        "Browser Automation was disabled before the mocked browser action could execute.",
      metadata: {
        ...latestTask.metadata,
        verification:
          "Active browser automation task was cancelled because Browser Automation was disabled.",
      },
      updatedAt: now,
      completedAt: now,
    });
    return true;
  }

  async function saveBrowserAutomationTask(task: LocalTaskRecord) {
    latestTask = task;
    await repository.save(task);
    await render();
    return task;
  }

  function currentTimestamp() {
    return (options.now ?? (() => new Date()))().toISOString();
  }

  async function runPolicyCheckedMockedTask(provider: ProviderOption) {
    try {
      await assertCapabilityInvocationAllowed(
        capabilityRepository,
        "project-context-skill",
      );
    } catch (error) {
      const now = (options.now ?? (() => new Date()))().toISOString();
      const blockedTask: LocalTaskRecord = {
        id: latestTask?.id ?? `task-${Date.now().toString(36)}`,
        title: "Summarize the current issue.",
        status: "blocked",
        summary: error instanceof Error ? error.message : "Capability blocked.",
        metadata: {
          executionSource: "capability_policy",
          verification:
            "Default skill invocation was blocked by the Capability Registry policy.",
          costAwareness:
            "No provider API call or token spend occurred because execution was blocked before engine launch.",
        },
        createdAt: latestTask?.createdAt ?? now,
        updatedAt: now,
      };
      latestTask = blockedTask;
      await repository.save(blockedTask);
      await render();
      return blockedTask;
    }

    return runMockedEngineBackedTask({
      provider,
      instruction: "Summarize the current issue.",
      authorityMode: "ask_first",
      requiredCapabilities: ["project-context-skill"],
      adapters: mockedTaskAdapters,
      catalog: mockedTaskCatalog,
      secretStore: mockedTaskSecretStore,
      repository,
      now: options.now,
      onTaskChanged: async (task) => {
        latestTask = task;
        await render();
      },
    });
  }

  const ready = render();

  return {
    root,
    ready,
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

  if (status === "paused") {
    return "Paused";
  }

  if (status === "waiting_for_approval") {
    return "Waiting for approval";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Running";
}

function isBrowserAutomationEnabled(
  snapshot: CapabilityRegistrySnapshot,
): boolean {
  return snapshot.enabled.some(
    (capability) => capability.id === "browser-automation",
  );
}

function capabilityStatusLabel(capability: CapabilityRecord): string {
  if (capability.status !== "available") {
    return "Unavailable";
  }

  return capability.enabled
    ? "Available and enabled"
    : "Available, disabled until enabled";
}

function capabilitySourceLabel(capability: CapabilityRecord): string {
  if (capability.source?.kind === "local") {
    return `Local skill: ${capability.source.reference}`;
  }

  if (capability.type === "skill" && capability.isDefault) {
    return "Default skill";
  }

  return "User or system capability";
}

function isControllableCapability(capability: CapabilityRecord): boolean {
  if (capability.status !== "available") {
    return false;
  }

  if (capability.type === "browser_automation") {
    return true;
  }

  return (
    capability.type === "skill" &&
    (Boolean(capability.isDefault) || capability.source?.kind === "local")
  );
}

function capabilityControlNoun(capability: CapabilityRecord): string {
  if (capability.type === "browser_automation") {
    return "Browser Automation";
  }

  return "skill";
}

function browserActionLabel(actionKind: BrowserAutomationActionKind): string {
  if (actionKind === "submit_form") {
    return "Submit form";
  }

  if (actionKind === "purchase") {
    return "Purchase";
  }

  if (actionKind === "destructive_action") {
    return "Destructive action";
  }

  if (actionKind === "sensitive_logged_in_context") {
    return "Sensitive logged-in context";
  }

  if (actionKind === "navigate_page") {
    return "Navigate page";
  }

  if (actionKind === "summarize_page") {
    return "Summarize page";
  }

  return "Inspect page";
}

function stringFormValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

function capabilityTypeLabel(type: CapabilityType): string {
  if (type === "mcp_server") {
    return "MCP server";
  }

  if (type === "provider_adapter") {
    return "Provider adapter";
  }

  if (type === "browser_automation") {
    return "Browser automation";
  }

  return type[0].toUpperCase() + type.slice(1);
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
