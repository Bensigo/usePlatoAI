import { describe, expect, it } from "vitest";

import {
  createApiKeyProviderAuthState,
  createCodexSdkAgentEngineAdapter,
  type SecretReference,
  type SecretStore,
} from "@useplatoai/agent-engine";

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

describe("provider settings UI", () => {
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
