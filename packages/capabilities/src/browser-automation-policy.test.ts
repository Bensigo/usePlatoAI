import { describe, expect, it } from "vitest";

import {
  assertCapabilityInvocationAllowed,
  browserAutomationActionRequiresApproval,
  createDefaultCapabilityRegistryRepository,
  evaluateBrowserAutomationActionGate,
  setCapabilityEnabled,
} from "./index.js";

describe("browser automation policy", () => {
  it("requires browser automation to be enabled before invocation", async () => {
    const repository = createDefaultCapabilityRegistryRepository();

    await expect(
      assertCapabilityInvocationAllowed(repository, "browser-automation"),
    ).rejects.toThrow(
      "Capability is disabled and cannot be invoked: browser-automation",
    );

    await setCapabilityEnabled(repository, "browser-automation", true);

    await expect(
      assertCapabilityInvocationAllowed(repository, "browser-automation"),
    ).resolves.toMatchObject({
      id: "browser-automation",
      type: "browser_automation",
      enabled: true,
    });
  });

  it("approval-gates high-impact mocked browser actions", () => {
    expect(
      browserAutomationActionRequiresApproval("submit_form"),
    ).toBe(true);
    expect(browserAutomationActionRequiresApproval("purchase")).toBe(true);
    expect(
      browserAutomationActionRequiresApproval("destructive_action"),
    ).toBe(true);
    expect(
      browserAutomationActionRequiresApproval("sensitive_logged_in_context"),
    ).toBe(true);
    expect(browserAutomationActionRequiresApproval("inspect_page")).toBe(false);

    expect(
      evaluateBrowserAutomationActionGate({
        kind: "purchase",
        label: "Confirm checkout",
      }),
    ).toEqual({
      decision: "waiting_for_approval",
      reason: "Purchase requires explicit approval before browser execution.",
      verification:
        "Mocked browser automation stopped before the high-impact action executed.",
    });
  });
});
