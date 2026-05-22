import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { audioActivationStateFrom } from "./audioActivation";
import {
  avatarCompanionStateFromTestCommand,
  type AvatarTestAnimationCommand,
} from "./avatarSurface";
import { isControlSurfaceId } from "./controlSurface";
import { normalizePresenceState } from "./presenceState";
import { defaultCompanionSettings } from "./settings";
import {
  mockApprovalTaskVisualTasks,
  mockTaskTrayVisualTasks,
} from "./tasks";
import { voiceSessionStateFrom } from "./voiceInteraction";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

const searchParams = new URLSearchParams(window.location.search);
const urlPresenceState = searchParams.get("presenceState");
const initialPresenceState = normalizePresenceState(urlPresenceState);
const urlControlSurface = searchParams.get("controlSurface");
const initialActiveEntry = isControlSurfaceId(urlControlSurface)
  ? urlControlSurface
  : undefined;
const initialAudioActivationState = audioActivationStateFrom(
  searchParams.get("audioState"),
);
const initialVoiceSessionState = voiceSessionStateFrom(
  searchParams.get("voiceState"),
);
const avatarTestCommand = searchParams.get("avatarTestCommand");
const initialAvatarTestCommand =
  avatarCompanionStateFromTestCommand(avatarTestCommand) === null
    ? undefined
    : (avatarTestCommand as AvatarTestAnimationCommand);
const initialSettings =
  !("__TAURI_INTERNALS__" in window) &&
  searchParams.get("onboardingComplete") === "true"
    ? {
        ...defaultCompanionSettings,
        onboardingComplete: true,
      }
    : undefined;
const initialControlsExpanded =
  !("__TAURI_INTERNALS__" in window) &&
  searchParams.get("controlsExpanded") === "true";
const mockTasksMode = searchParams.get("mockTasks");
const initialTasks =
  !("__TAURI_INTERNALS__" in window) && mockTasksMode === "two"
    ? mockTaskTrayVisualTasks()
    : !("__TAURI_INTERNALS__" in window) && mockTasksMode === "approval"
      ? mockApprovalTaskVisualTasks("waiting")
      : !("__TAURI_INTERNALS__" in window) &&
          mockTasksMode === "approval-approved"
        ? mockApprovalTaskVisualTasks("approved")
        : [];
const initialSelectedTaskId =
  searchParams.get("selectedTaskId") ?? initialTasks[1]?.taskId ?? null;

createRoot(root).render(
  <StrictMode>
    <App
      initialActiveEntry={initialActiveEntry}
      initialControlsExpanded={initialControlsExpanded}
      initialAudioActivationState={initialAudioActivationState}
      initialAvatarTestCommand={initialAvatarTestCommand}
      initialPresenceState={initialPresenceState}
      initialVoiceSessionState={initialVoiceSessionState}
      initialSettings={initialSettings}
      initialTasks={initialTasks}
      initialSelectedTaskId={initialSelectedTaskId}
    />
  </StrictMode>,
);
