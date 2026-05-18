export type ControlSurfaceId =
  | "voice"
  | "settings"
  | "tasks"
  | "memory"
  | "permissions"
  | "providers"
  | "soul";

export const controlSurfaceEntries: {
  id: ControlSurfaceId;
  label: string;
  description: string;
}[] = [
  {
    id: "voice",
    label: "Voice",
    description:
      "Start a local mock voice interaction, mute output, and use text fallback without provider credentials.",
  },
  {
    id: "settings",
    label: "Settings",
    description:
      "Placeholder for companion name, wake name, launch behavior, and quiet mode settings.",
  },
  {
    id: "tasks",
    label: "Tasks",
    description:
      "Placeholder for the task tray that will show active work, approvals, failures, and controls.",
  },
  {
    id: "memory",
    label: "Memory",
    description:
      "Placeholder for viewing, editing, deleting, and disabling local memory records.",
  },
  {
    id: "permissions",
    label: "Permissions",
    description:
      "Placeholder for execution authority, screen understanding, and approval rules.",
  },
  {
    id: "providers",
    label: "Providers",
    description:
      "Placeholder for API keys, local SDK auth, subscription-backed auth, and local models.",
  },
  {
    id: "soul",
    label: "Soul editing",
    description:
      "Placeholder for editing the local soul markdown that shapes the Plato companion identity.",
  },
];

export function isControlSurfaceId(value: unknown): value is ControlSurfaceId {
  return (
    typeof value === "string" &&
    controlSurfaceEntries.some((entry) => entry.id === value)
  );
}
