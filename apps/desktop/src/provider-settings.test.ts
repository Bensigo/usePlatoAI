import { describe, expect, it } from "vitest";

import { renderProviderSettings } from "./provider-settings.js";

function renderSurface() {
  const root = document.createElement("main");
  document.body.replaceChildren(root);
  return renderProviderSettings(root);
}

describe("provider settings UI", () => {
  it("distinguishes provider auth modes and shows OpenAI with Codex SDK cost warnings", async () => {
    const settings = renderSurface();

    await settings.selectProvider("openai");

    expect(document.body.textContent).toContain("API key provider");
    expect(document.body.textContent).toContain("Codex SDK");
    expect(document.body.textContent).toContain("Available");
    expect(document.body.textContent).toContain("Auth ready");
    expect(document.body.textContent).toContain("Token and API usage may create spend");
  });

  it("switches Anthropic/Claude providers to Claude Agent SDK with local auth status", async () => {
    const settings = renderSurface();

    await settings.selectProvider("claude");

    expect(document.body.textContent).toContain("Local SDK auth");
    expect(document.body.textContent).toContain("Claude Agent SDK");
    expect(document.body.textContent).toContain("Available");
    expect(document.body.textContent).toContain("Signed in as operator@example.com");
    expect(document.body.textContent).toContain("Subscription-backed local auth is separate");
  });

  it("keeps subscription-backed local auth distinct from SDK auth and API keys", async () => {
    const settings = renderSurface();

    await settings.selectProvider("claude-pro");

    expect(document.body.textContent).toContain("Subscription-backed local auth");
    expect(document.body.textContent).toContain("Claude Agent SDK");
    expect(document.body.textContent).toContain("Auth missing");
    expect(document.body.textContent).toContain(
      "Subscription access does not equal API access unless the local SDK exposes supported auth.",
    );
  });

  it("shows local endpoint limits without implying Agent Engine support", async () => {
    const settings = renderSurface();

    await settings.selectProvider("local");

    expect(document.body.textContent).toContain("Local model endpoint");
    expect(document.body.textContent).toContain("http://localhost:11434");
    expect(document.body.textContent).toContain("No Agent Engine supported yet");
    expect(document.body.textContent).toContain(
      "Local providers can reduce API cost, but agent-engine task execution is unavailable until implemented.",
    );
  });
});
