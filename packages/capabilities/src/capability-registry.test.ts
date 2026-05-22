import { describe, expect, it } from "vitest";

import {
  assertCapabilityInvocationAllowed,
  createDefaultCapabilityRegistryRepository,
  createMemoryCapabilityRegistryRepository,
  defaultCapabilities,
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

  it("represents default skills as controllable capabilities", async () => {
    const repository = createDefaultCapabilityRegistryRepository();

    const snapshot = await getCapabilityRegistrySnapshot(repository);

    const defaultSkills = snapshot.available.filter(
      (capability) => capability.type === "skill" && capability.isDefault,
    );
    expect(defaultSkills.map((capability) => capability.id)).toEqual(
      expect.arrayContaining(["project-context-skill", "issue-tracker-skill"]),
    );
    expect(
      defaultCapabilities.find(
        (capability) => capability.id === "project-context-skill",
      ),
    ).toMatchObject({
      type: "skill",
      isDefault: true,
      status: "available",
      enabled: true,
    });
  });

  it("disables and re-enables a default skill through the registry boundary", async () => {
    const repository = createDefaultCapabilityRegistryRepository();

    await setCapabilityEnabled(repository, "project-context-skill", false);
    let snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.disabled.map((capability) => capability.id)).toContain(
      "project-context-skill",
    );
    expect(snapshot.enabled.map((capability) => capability.id)).not.toContain(
      "project-context-skill",
    );

    await setCapabilityEnabled(repository, "project-context-skill", true);
    snapshot = await getCapabilityRegistrySnapshot(repository);

    expect(snapshot.enabled.map((capability) => capability.id)).toContain(
      "project-context-skill",
    );
    expect(snapshot.disabled.map((capability) => capability.id)).not.toContain(
      "project-context-skill",
    );
  });

  it("blocks disabled skill invocation through policy", async () => {
    const projectContextSkill = defaultCapabilities.find(
      (capability) => capability.id === "project-context-skill",
    );
    if (!projectContextSkill) {
      throw new Error("Project Context Skill default capability is missing.");
    }
    const repository = createMemoryCapabilityRegistryRepository({
      capabilities: [{ ...projectContextSkill, enabled: false }],
    });

    await expect(
      assertCapabilityInvocationAllowed(repository, "project-context-skill"),
    ).rejects.toThrow(
      "Capability is disabled and cannot be invoked: project-context-skill",
    );
  });

  it("allows enabled skill invocation through policy", async () => {
    const repository = createDefaultCapabilityRegistryRepository();

    await expect(
      assertCapabilityInvocationAllowed(repository, "project-context-skill"),
    ).resolves.toMatchObject({
      id: "project-context-skill",
      type: "skill",
      enabled: true,
    });
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
