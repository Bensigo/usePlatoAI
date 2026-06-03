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
import { wakeNameActivationStateFrom } from "./wakeNameActivation";

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
  searchParams.get("voiceState") ??
    import.meta.env.VITE_PLATO_INITIAL_VOICE_STATE,
);
const initialWakeNameActivationState = wakeNameActivationStateFrom(
  searchParams.get("wakeNameState") ??
    import.meta.env.VITE_PLATO_WAKE_NAME_VISUAL_STATE,
);
const avatarTestCommand =
  searchParams.get("avatarTestCommand") ??
  import.meta.env.VITE_PLATO_AVATAR_TEST_COMMAND;
const initialAvatarTestCommand =
  avatarCompanionStateFromTestCommand(avatarTestCommand) === null
    ? undefined
    : (avatarTestCommand as AvatarTestAnimationCommand);
const initialSettings =
  initialWakeNameActivationState
    ? {
        ...defaultCompanionSettings,
        wakeNameActivationEnabled: initialWakeNameActivationState !== "disabled",
        wakeNameDetectorModelPath:
          initialWakeNameActivationState === "disabled" ? "" : "/visual/vosk",
        onboardingComplete: true,
      }
    : !("__TAURI_INTERNALS__" in window) &&
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
      initialWakeNameActivationState={initialWakeNameActivationState}
      initialSettings={initialSettings}
      initialTasks={initialTasks}
      initialSelectedTaskId={initialSelectedTaskId}
    />
  </StrictMode>,
);
