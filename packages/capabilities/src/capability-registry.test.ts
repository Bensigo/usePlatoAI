import { describe, expect, it } from "vitest";

import {
  createDefaultCapabilityRegistryRepository,
  createMemoryCapabilityRegistryRepository,
  getCapabilityRegistrySnapshot,
  setCapabilityEnabled,
  type CapabilityRecord,
} from "./index.js";

describe("capability registry", () => {
  it("lists default capabilities without silently enabling every available capability", async () => {
    const repository = createDefaultCapabilityRegistryRepository();

    const snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.available.map((capability) => capability.id)).toContain(
      "browser-automation",
    );
    expect(snapshot.enabled.map((capability) => capability.id)).toContain(
      "project-context-skill",
    );
    expect(snapshot.disabled.map((capability) => capability.id)).toContain(
      "browser-automation",
    );
    expect(
      snapshot.available.find(
        (capability) => capability.id === "browser-automation",
      ),
    ).toMatchObject({
      type: "browser_automation",
      displayName: "Browser Automation",
      status: "available",
      enabled: false,
    });
  });

  it("persists enabled and disabled state through the repository boundary", async () => {
    const repository = createMemoryCapabilityRegistryRepository({
      capabilities: [
        {
          id: "custom-skill",
          type: "skill",
          displayName: "Custom Skill",
          status: "available",
          enabled: false,
        },
      ],
    });

    await setCapabilityEnabled(repository, "custom-skill", true);
    let snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.enabled.map((capability) => capability.id)).toEqual([
      "custom-skill",
    ]);
    expect(snapshot.disabled).toEqual([]);

    await setCapabilityEnabled(repository, "custom-skill", false);
    snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.enabled).toEqual([]);
    expect(snapshot.disabled.map((capability) => capability.id)).toEqual([
      "custom-skill",
    ]);
  });

  it("separates unavailable capabilities from available disabled capabilities", async () => {
    const unavailableCapability: CapabilityRecord = {
      id: "missing-mcp-server",
      type: "mcp_server",
      displayName: "Missing MCP Server",
      status: "unavailable",
      enabled: false,
    };
    const repository = createMemoryCapabilityRegistryRepository({
      capabilities: [unavailableCapability],
    });

    const snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.available).toEqual([]);
    expect(snapshot.enabled).toEqual([]);
    expect(snapshot.disabled).toEqual([]);
    expect(snapshot.unavailable).toEqual([unavailableCapability]);
  });
});
