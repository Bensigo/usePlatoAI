import { describe, expect, it } from "vitest";

import {
  createApiKeyProviderAuthState,
  createCodexSdkAgentEngineAdapter,
  type SecretReference,
  type SecretStore,
} from "@useplatoai/agent-engine";
import {
  defaultCapabilities,
  createMemoryCapabilityRegistryRepository,
  type CapabilityRecord,
} from "@useplatoai/capabilities";

import { renderProviderSettings } from "./provider-settings.js";

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  write(reference: SecretReference, value: string): void {
    this.values.set(reference.id, value);
  }

  read(reference: SecretReference): string | null {
    return this.values.get(reference.id) ?? null;
  }
}

function renderSurface() {
  const root = document.createElement("main");
  document.body.replaceChildren(root);
  return renderProviderSettings(root);
}

function factValue(label: string) {
  const labels = [...document.querySelectorAll("dt")];
  const match = labels.find((node) => node.textContent === label);
  return match?.nextElementSibling?.textContent ?? "";
}

function capabilityCard(capabilityId: string) {
  const card = document.querySelector<HTMLElement>(
    `[data-capability-id='${capabilityId}']`,
  );
  if (!card) {
    throw new Error(`Capability card not found: ${capabilityId}`);
  }
  return card;
}

function deferredRender() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("provider settings UI", () => {
  it("shows enabled and available capabilities in the settings surface", async () => {
    const capabilities: CapabilityRecord[] = [
      {
        id: "project-context-skill",
        type: "skill",
        displayName: "Project Context Skill",
        status: "available",
        enabled: true,
      },
      {
        id: "browser-automation",
        type: "browser_automation",
        displayName: "Browser Automation",
        status: "available",
        enabled: false,
      },
    ];
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities,
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    expect(document.body.textContent).toContain("Capability Registry");
    expect(document.body.textContent).toContain("Project Context Skill");
    expect(document.body.textContent).toContain("Skill");
    expect(document.body.textContent).toContain("Enabled");
    expect(document.body.textContent).toContain("Browser Automation");
    expect(document.body.textContent).toContain("Browser automation");
    expect(document.body.textContent).toContain("Available, disabled until enabled");
  });

  it("lets the user disable and re-enable a default skill from the settings surface", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities,
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    expect(capabilityCard("project-context-skill").textContent).toContain(
      "Default skill",
    );
    expect(capabilityCard("project-context-skill").textContent).toContain(
      "Available and enabled",
    );

    capabilityCard("project-context-skill")
      .querySelector<HTMLButtonElement>("[data-capability-action='disable']")
      ?.click();
    await deferredRender();

    expect(capabilityCard("project-context-skill").textContent).toContain(
      "Available, disabled until enabled",
    );

    capabilityCard("project-context-skill")
      .querySelector<HTMLButtonElement>("[data-capability-action='enable']")
      ?.click();
    await deferredRender();

    expect(capabilityCard("project-context-skill").textContent).toContain(
      "Available and enabled",
    );
  });

  it("registers a custom local skill and lets the user enable and disable it from the settings surface", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities,
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    document.querySelector<HTMLInputElement>("[name='custom-skill-id']")!.value =
      "daily-planning-skill";
    document.querySelector<HTMLInputElement>(
      "[name='custom-skill-display-name']",
    )!.value = "Daily Planning Skill";
    document.querySelector<HTMLTextAreaElement>(
      "[name='custom-skill-description']",
    )!.value = "Turns a rough day plan into a sequenced task list.";
    document.querySelector<HTMLInputElement>(
      "[name='custom-skill-source-reference']",
    )!.value = "~/plato/skills/daily-planning/SKILL.md";

    document.querySelector<HTMLFormElement>("[data-custom-skill-form]")!.requestSubmit();
    await deferredRender();

    expect(
      document.querySelector("[data-custom-skill-registration-result]")?.textContent,
    ).toContain("Registered custom skill: Daily Planning Skill");
    expect(capabilityCard("daily-planning-skill").textContent).toContain(
      "Daily Planning Skill",
    );
    expect(capabilityCard("daily-planning-skill").textContent).toContain(
      "Local skill: ~/plato/skills/daily-planning/SKILL.md",
    );
    expect(capabilityCard("daily-planning-skill").textContent).toContain(
      "Available, disabled until enabled",
    );

    capabilityCard("daily-planning-skill")
      .querySelector<HTMLButtonElement>("[data-capability-action='enable']")
      ?.click();
    await deferredRender();

    expect(capabilityCard("daily-planning-skill").textContent).toContain(
      "Available and enabled",
    );

    capabilityCard("daily-planning-skill")
      .querySelector<HTMLButtonElement>("[data-capability-action='disable']")
      ?.click();
    await deferredRender();

    expect(capabilityCard("daily-planning-skill").textContent).toContain(
      "Available, disabled until enabled",
    );
  });

  it("shows local validation when custom skill registration is duplicate or invalid", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities,
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    document.querySelector<HTMLInputElement>("[name='custom-skill-id']")!.value =
      "project-context-skill";
    document.querySelector<HTMLInputElement>(
      "[name='custom-skill-display-name']",
    )!.value = "Duplicate Project Context Skill";
    document.querySelector<HTMLTextAreaElement>(
      "[name='custom-skill-description']",
    )!.value = "Should be rejected.";
    document.querySelector<HTMLInputElement>(
      "[name='custom-skill-source-reference']",
    )!.value = "~/plato/skills/project-context/SKILL.md";

    document.querySelector<HTMLFormElement>("[data-custom-skill-form]")!.requestSubmit();
    await deferredRender();

    expect(
      document.querySelector("[data-custom-skill-registration-result]")?.textContent,
    ).toContain("A capability is already registered with id: project-context-skill");

    document.querySelector<HTMLInputElement>("[name='custom-skill-id']")!.value =
      "Not Stable";
    document.querySelector<HTMLFormElement>("[data-custom-skill-form]")!.requestSubmit();
    await deferredRender();

    expect(
      document.querySelector("[data-custom-skill-registration-result]")?.textContent,
    ).toContain(
      "Custom skill id must use lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  });

  it("blocks mocked task launch when its required default skill is disabled", async () => {
    const projectContextSkill = defaultCapabilities.find(
      (capability) => capability.id === "project-context-skill",
    );
    if (!projectContextSkill) {
      throw new Error("Project Context Skill default capability is missing.");
    }
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: [{ ...projectContextSkill, enabled: false }],
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.selectProvider("openai");

    const task = await settings.launchMockedTask();

    expect(task.status).toBe("blocked");
    expect(factValue("Task status")).toBe("Blocked");
    expect(factValue("Task result")).toContain(
      "Capability is disabled and cannot be invoked: project-context-skill",
    );
  });

  it("requires browser automation capability enablement before starting the mocked browser task", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities,
      }),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    const startButton = document.querySelector<HTMLButtonElement>(
      "[data-action='start-browser-automation']",
    );
    expect(startButton?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "Enable Browser Automation before starting a mocked browser task.",
    );

    capabilityCard("browser-automation")
      .querySelector<HTMLButtonElement>("[data-capability-action='enable']")
      ?.click();
    await deferredRender();

    document
      .querySelector<HTMLButtonElement>("[data-action='start-browser-automation']")
      ?.click();
    await deferredRender();

    expect(factValue("Task title")).toBe("Browser automation demo");
    expect(factValue("Task status")).toBe("Running");

    document
      .querySelector<HTMLButtonElement>("[data-action='pause-browser-automation']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Paused");

    document
      .querySelector<HTMLButtonElement>("[data-action='resume-browser-automation']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Running");
  });

  it("shows approval gates and approval metadata for high-impact mocked browser actions", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities.map((capability) =>
          capability.id === "browser-automation"
            ? { ...capability, enabled: true }
            : capability,
        ),
      }),
      now: () => new Date("2026-05-22T10:00:00.000Z"),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    document
      .querySelector<HTMLButtonElement>("[data-action='start-browser-automation']")
      ?.click();
    await deferredRender();

    document
      .querySelector<HTMLButtonElement>("[data-browser-action='submit_form']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Waiting for approval");
    expect(factValue("Task result")).toContain(
      "Submit form requires explicit approval before browser execution.",
    );
    expect(factValue("Verification")).toBe(
      "Mocked browser automation stopped before the high-impact action executed.",
    );

    document
      .querySelector<HTMLButtonElement>("[data-action='approve-browser-action']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Completed");
    expect(factValue("Task result")).toBe(
      "Approved Submit form. Mocked browser action completed.",
    );
    expect(factValue("Verification")).toBe(
      "User approved the high-impact mocked browser action before execution.",
    );

    document
      .querySelector<HTMLButtonElement>("[data-action='start-browser-automation']")
      ?.click();
    await deferredRender();
    document
      .querySelector<HTMLButtonElement>("[data-browser-action='purchase']")
      ?.click();
    await deferredRender();
    document
      .querySelector<HTMLButtonElement>("[data-action='reject-browser-action']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Blocked");
    expect(factValue("Task result")).toBe(
      "Rejected Purchase. Mocked browser action did not execute.",
    );
    expect(factValue("Verification")).toBe(
      "User rejected the high-impact mocked browser action; no browser change occurred.",
    );
  });

  it("blocks pending browser approvals when Browser Automation is disabled", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      capabilityRepository: createMemoryCapabilityRegistryRepository({
        capabilities: defaultCapabilities.map((capability) =>
          capability.id === "browser-automation"
            ? { ...capability, enabled: true }
            : capability,
        ),
      }),
      now: () => new Date("2026-05-22T10:00:00.000Z"),
    });

    document.body.replaceChildren(settings.root);
    await settings.ready;

    document
      .querySelector<HTMLButtonElement>("[data-action='start-browser-automation']")
      ?.click();
    await deferredRender();
    document
      .querySelector<HTMLButtonElement>("[data-browser-action='submit_form']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Waiting for approval");

    capabilityCard("browser-automation")
      .querySelector<HTMLButtonElement>("[data-capability-action='disable']")
      ?.click();
    await deferredRender();

    expect(factValue("Task status")).toBe("Blocked");
    expect(factValue("Task result")).toBe(
      "Browser Automation was disabled before the mocked browser action could execute.",
    );
    expect(factValue("Verification")).toBe(
      "Active browser automation task was cancelled because Browser Automation was disabled.",
    );
    expect(
      document.querySelector("[data-action='approve-browser-action']"),
    ).toBeNull();
  });

  it("distinguishes provider auth modes and shows OpenAI with Codex SDK cost warnings", async () => {
    const settings = renderSurface();

    await settings.selectProvider("openai");

    expect(document.body.textContent).toContain("API key provider");
    expect(factValue("Selected engine")).toBe("Codex SDK");
    expect(factValue("Engine state")).toBe("Unavailable");
    expect(factValue("Auth status")).toBe(
      "Auth missing: stored secret is not available",
    );
    expect(factValue("Reason")).toContain("mapped Agent Engine is not available");
    expect(document.body.textContent).toContain("Token and API usage may create spend");
  });

  it("switches Anthropic/Claude providers to Claude Agent SDK with local auth requirements", async () => {
    const settings = renderSurface();

    await settings.selectProvider("claude");

    expect(document.body.textContent).toContain("Local SDK auth");
    expect(factValue("Selected engine")).toBe("Claude Agent SDK");
    expect(factValue("Engine state")).toBe("Unavailable");
    expect(factValue("Auth status")).toBe(
      "Auth missing: local login is not available",
    );
    expect(document.body.textContent).toContain("Subscription-backed local auth is separate");
  });

  it("keeps subscription-backed local auth distinct from SDK auth and API keys", async () => {
    const settings = renderSurface();

    await settings.selectProvider("claude-pro");

    expect(document.body.textContent).toContain("Subscription-backed local auth");
    expect(factValue("Selected engine")).toBe("Claude Agent SDK");
    expect(factValue("Engine state")).toBe("Unavailable");
    expect(factValue("Reason")).toContain("mapped Agent Engine is not available");
    expect(factValue("Auth status")).toContain("Auth missing");
    expect(document.body.textContent).toContain(
      "Subscription access does not equal API access unless the local SDK exposes supported auth.",
    );
  });

  it("shows local endpoint limits without implying Agent Engine support", async () => {
    const settings = renderSurface();

    await settings.selectProvider("local");

    expect(document.body.textContent).toContain("Local model endpoint");
    expect(factValue("Endpoint")).toBe("Not applicable");
    expect(factValue("Auth status")).toBe(
      "Auth missing: local endpoint is not configured",
    );
    expect(factValue("Engine state")).toBe("No Agent Engine supported yet");
    expect(document.body.textContent).toContain(
      "Local providers can reduce API cost, but agent-engine task execution is unavailable until implemented.",
    );
  });

  it("runs a mocked engine-backed task through the task tray", async () => {
    const settings = renderSurface();

    await settings.selectProvider("openai");
    document
      .querySelector<HTMLButtonElement>("[data-action='launch-mocked-task']")
      ?.click();

    expect(document.body.textContent).toContain("Running");

    const task = await settings.currentTask;

    expect(task?.status).toBe("completed");
    expect(factValue("Task status")).toBe("Completed");
    expect(factValue("Task result")).toContain("Mocked Codex SDK completed");
    expect(factValue("Cost")).toBe(
      "Mocked execution only; no provider API call or token spend occurred.",
    );
    expect(JSON.stringify(task)).not.toContain("codex_sdk");
  });

  it("can run a mocked engine-backed task through injected provider configuration", async () => {
    const secretStore = new MemorySecretStore();
    const authState = await createApiKeyProviderAuthState({
      providerId: "openai",
      providerDisplayName: "OpenAI",
      apiKey: "sk-test",
      secretStore,
    });
    const settings = renderProviderSettings(document.createElement("main"), {
      providers: [
        {
          id: "openai",
          displayName: "OpenAI",
          kind: "openai",
          authMode: "api_key",
          authState,
          authLabel: "API key provider",
          availabilityLabel: "Ready for mocked engine work.",
          costWarning: "Mocked execution records cost metadata without spend.",
        },
      ],
      mockedTaskAdapters: [
        createCodexSdkAgentEngineAdapter({
          runtimeAvailable: true,
          now: () => new Date("2026-05-21T13:00:00.000Z"),
        }),
      ],
      mockedTaskSecretStore: secretStore,
      now: () => new Date("2026-05-21T13:00:00.000Z"),
    });

    document.body.replaceChildren(settings.root);
    await settings.selectProvider("openai");

    const launch = document.querySelector<HTMLButtonElement>(
      "[data-action='launch-mocked-task']",
    );
    launch?.click();

    expect(document.body.textContent).toContain("Running");

    const task = await settings.currentTask;

    expect(task?.status).toBe("completed");
    expect(factValue("Task status")).toBe("Completed");
    expect(factValue("Task result")).toContain("Mocked Codex SDK completed");
    expect(factValue("Cost")).toBe(
      "Mocked execution only; no provider API call or token spend occurred.",
    );
    expect(JSON.stringify(task)).not.toContain("codex_sdk");
  });

  it("surfaces unavailable engines in the task tray instead of doing nothing", async () => {
    const settings = renderProviderSettings(document.createElement("main"), {
      mockedTaskAdapters: [
        createCodexSdkAgentEngineAdapter({
          runtimeAvailable: false,
        }),
      ],
    });

    document.body.replaceChildren(settings.root);
    await settings.selectProvider("openai");
    document
      .querySelector<HTMLButtonElement>("[data-action='launch-mocked-task']")
      ?.click();

    const task = await settings.currentTask;

    expect(task?.status).toBe("failed");
    expect(factValue("Task status")).toBe("Failed");
    expect(factValue("Task result")).toContain(
      "The mapped Agent Engine is not available for OpenAI.",
    );
  });
});
