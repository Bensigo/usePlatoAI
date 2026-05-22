export type CapabilityType =
  | "skill"
  | "mcp_server"
  | "tool"
  | "provider_adapter"
  | "browser_automation";

export type CapabilityStatus = "available" | "unavailable";

export interface CapabilityRecord {
  id: string;
  type: CapabilityType;
  displayName: string;
  status: CapabilityStatus;
  enabled: boolean;
  isDefault?: boolean;
  description?: string;
}

export interface CapabilityRegistrySnapshot {
  capabilities: CapabilityRecord[];
  available: CapabilityRecord[];
  enabled: CapabilityRecord[];
  disabled: CapabilityRecord[];
  unavailable: CapabilityRecord[];
}

export interface CapabilityRegistryRepository {
  list(): CapabilityRecord[] | Promise<CapabilityRecord[]>;
  save(capability: CapabilityRecord): void | Promise<void>;
}

export const defaultCapabilities = [
  {
    id: "project-context-skill",
    type: "skill",
    displayName: "Project Context Skill",
    status: "available",
    enabled: true,
    isDefault: true,
    description: "Reads project context, architecture docs, and workflow rules.",
  },
  {
    id: "issue-tracker-skill",
    type: "skill",
    displayName: "Issue Tracker Skill",
    status: "available",
    enabled: true,
    isDefault: true,
    description: "Reads GitHub issues and pull requests.",
  },
  {
    id: "browser-automation",
    type: "browser_automation",
    displayName: "Browser Automation",
    status: "available",
    enabled: false,
    description:
      "Can inspect and act in browser pages only after explicit enablement and approval gates.",
  },
  {
    id: "custom-skills",
    type: "skill",
    displayName: "Custom Skills",
    status: "available",
    enabled: false,
    description:
      "Allows user-owned local skills to be registered in the capability registry.",
  },
] as const satisfies readonly CapabilityRecord[];

export function createDefaultCapabilityRegistryRepository(): CapabilityRegistryRepository {
  return createMemoryCapabilityRegistryRepository({
    capabilities: defaultCapabilities,
  });
}

export function createMemoryCapabilityRegistryRepository(input?: {
  capabilities?: readonly CapabilityRecord[];
}): CapabilityRegistryRepository {
  const capabilities = new Map<string, CapabilityRecord>(
    (input?.capabilities ?? []).map((capability) => [
      capability.id,
      { ...capability },
    ]),
  );

  return {
    list() {
      return [...capabilities.values()].map((capability) => ({
        ...capability,
      }));
    },
    save(capability) {
      capabilities.set(capability.id, { ...capability });
    },
  };
}

export async function getCapabilityRegistrySnapshot(
  repository: CapabilityRegistryRepository,
): Promise<CapabilityRegistrySnapshot> {
  const capabilities = await repository.list();
  const available = capabilities.filter(
    (capability) => capability.status === "available",
  );

  return {
    capabilities,
    available,
    enabled: available.filter((capability) => capability.enabled),
    disabled: available.filter((capability) => !capability.enabled),
    unavailable: capabilities.filter(
      (capability) => capability.status === "unavailable",
    ),
  };
}

export async function setCapabilityEnabled(
  repository: CapabilityRegistryRepository,
  capabilityId: string,
  enabled: boolean,
): Promise<CapabilityRecord> {
  const capabilities = await repository.list();
  const capability = capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );

  if (!capability) {
    throw new Error(`Unknown capability: ${capabilityId}`);
  }

  if (enabled && capability.status !== "available") {
    throw new Error(`Unavailable capability cannot be enabled: ${capabilityId}`);
  }

  const updated = {
    ...capability,
    enabled,
  };
  await repository.save(updated);
  return updated;
}

export async function assertCapabilityInvocationAllowed(
  repository: CapabilityRegistryRepository,
  capabilityId: string,
): Promise<CapabilityRecord> {
  const capabilities = await repository.list();
  const capability = capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );

  if (!capability) {
    throw new Error(`Unknown capability: ${capabilityId}`);
  }

  if (capability.status !== "available") {
    throw new Error(`Capability is unavailable: ${capabilityId}`);
  }

  if (!capability.enabled) {
    throw new Error(
      `Capability is disabled and cannot be invoked: ${capabilityId}`,
    );
  }

  return capability;
}
