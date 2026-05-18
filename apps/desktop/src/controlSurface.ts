export type ControlSurfaceId =
  | "voice"
  | "settings"
  | "config"
  | "memory"
  | "soul"
  | "trust";

export const controlSurfaceEntries: {
  id: ControlSurfaceId;
  label: string;
  description: string;
  state: "ready" | "loading" | "empty" | "offline";
}[] = [
  {
    id: "voice",
    label: "Voice",
    description:
      "Start a local mock voice interaction, mute output, and use text fallback without provider credentials.",
    state: "ready",
  },
  {
    id: "settings",
    label: "Settings",
    description:
      "Review the saved companion name, wake name, memory mode, launch behavior, and authority.",
    state: "ready",
  },
  {
    id: "config",
    label: "Config",
    description:
      "Inspect first-run configuration choices without introducing future task or capability surfaces.",
    state: "ready",
  },
  {
    id: "memory",
    label: "Memory",
    description:
      "View, edit, delete, and disable local summary and preference memory records.",
    state: "empty",
  },
  {
    id: "soul",
    label: "Soul",
    description:
      "View and edit the local soul markdown that shapes the Plato companion identity.",
    state: "loading",
  },
  {
    id: "trust",
    label: "Provider/trust",
    description:
      "Manage provider credentials, local data boundaries, and execution authority.",
    state: "offline",
  },
];

export function isControlSurfaceId(value: unknown): value is ControlSurfaceId {
  return (
    typeof value === "string" &&
    controlSurfaceEntries.some((entry) => entry.id === value)
  );
}
