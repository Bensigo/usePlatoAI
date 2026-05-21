import { describe, expect, it } from "vitest";

import { renderProviderSettings } from "./provider-settings.js";

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
});
