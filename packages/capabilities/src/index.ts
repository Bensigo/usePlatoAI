export type CapabilityType =
  | "skill"
  | "mcp_server"
  | "tool"
  | "provider_adapter"
  | "browser_automation";

export type CapabilityStatus = "available" | "unavailable";

export type BrowserAutomationActionKind =
  | "inspect_page"
  | "navigate_page"
  | "summarize_page"
  | "submit_form"
  | "purchase"
  | "destructive_action"
  | "sensitive_logged_in_context";

export type BrowserAutomationActionGateDecision =
  | "allowed"
  | "waiting_for_approval";

export interface BrowserAutomationActionGateInput {
  kind: BrowserAutomationActionKind;
  label: string;
}

export interface BrowserAutomationActionGateResult {
  decision: BrowserAutomationActionGateDecision;
  reason: string;
  verification: string;
}

export interface CapabilityRecord {
  id: string;
  type: CapabilityType;
  displayName: string;
  status: CapabilityStatus;
  enabled: boolean;
  isDefault?: boolean;
  description?: string;
  source?: CapabilitySourceReference;
}

export type CapabilitySourceReference =
  | {
      kind: "default";
      reference: string;
    }
  | {
      kind: "local";
      reference: string;
    };

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

export interface CustomSkillRegistrationInput {
  id: string;
  displayName: string;
  description: string;
  localSourceReference: string;
}

export type CustomSkillRegistrationResult =
  | {
      ok: true;
      capability: CapabilityRecord;
      message: string;
    }
  | {
      ok: false;
      reason:
        | "invalid_id"
        | "missing_display_name"
        | "missing_source_reference"
        | "duplicate_id";
      message: string;
    };

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

export async function registerCustomSkill(
  repository: CapabilityRegistryRepository,
  input: CustomSkillRegistrationInput,
): Promise<CustomSkillRegistrationResult> {
  const id = input.id.trim();
  const displayName = input.displayName.trim();
  const description = input.description.trim();
  const localSourceReference = input.localSourceReference.trim();

  if (!isStableCapabilityId(id)) {
    return {
      ok: false,
      reason: "invalid_id",
      message:
        "Custom skill id must use lowercase letters, numbers, dots, underscores, or hyphens.",
    };
  }

  if (!displayName) {
    return {
      ok: false,
      reason: "missing_display_name",
      message: "Custom skill display name is required.",
    };
  }

  if (!localSourceReference) {
    return {
      ok: false,
      reason: "missing_source_reference",
      message: "Custom skill local source reference is required.",
    };
  }

  const capabilities = await repository.list();
  if (capabilities.some((capability) => capability.id === id)) {
    return {
      ok: false,
      reason: "duplicate_id",
      message: `A capability is already registered with id: ${id}`,
    };
  }

  const capability: CapabilityRecord = {
    id,
    type: "skill",
    displayName,
    description,
    status: "available",
    enabled: false,
    source: {
      kind: "local",
      reference: localSourceReference,
    },
  };

  await repository.save(capability);

  return {
    ok: true,
    capability,
    message: `Registered custom skill: ${displayName}`,
  };
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

export function browserAutomationActionRequiresApproval(
  actionKind: BrowserAutomationActionKind,
): boolean {
  return (
    actionKind === "submit_form" ||
    actionKind === "purchase" ||
    actionKind === "destructive_action" ||
    actionKind === "sensitive_logged_in_context"
  );
}

export function evaluateBrowserAutomationActionGate(
  input: BrowserAutomationActionGateInput,
): BrowserAutomationActionGateResult {
  if (browserAutomationActionRequiresApproval(input.kind)) {
    return {
      decision: "waiting_for_approval",
      reason: `${browserAutomationActionPolicyLabel(input.kind)} requires explicit approval before browser execution.`,
      verification:
        "Mocked browser automation stopped before the high-impact action executed.",
    };
  }

  return {
    decision: "allowed",
    reason: `${input.label} is a low-impact mocked browser action.`,
    verification:
      "Mocked browser automation policy allowed the browser action without an approval gate.",
  };
}

function browserAutomationActionPolicyLabel(
  actionKind: BrowserAutomationActionKind,
): string {
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

function isStableCapabilityId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(id);
}
