import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { audioActivationStateFrom } from "./audioActivation";
import { isControlSurfaceId } from "./controlSurface";
import { normalizePresenceState } from "./presenceState";
import { defaultCompanionSettings } from "./settings";
import { mockTaskTrayApprovalTasks, mockTaskTrayVisualTasks } from "./tasks";
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
const initialTasks =
  !("__TAURI_INTERNALS__" in window)
    ? searchParams.get("mockTasks") === "approval"
      ? mockTaskTrayApprovalTasks()
      : searchParams.get("mockTasks") === "two"
        ? mockTaskTrayVisualTasks()
        : []
    : [];
const initialSelectedTaskId =
  searchParams.get("selectedTaskId") ?? initialTasks[1]?.taskId ?? null;

createRoot(root).render(
  <StrictMode>
    <App
      initialActiveEntry={initialActiveEntry}
      initialControlsExpanded={initialControlsExpanded}
      initialAudioActivationState={initialAudioActivationState}
      initialPresenceState={initialPresenceState}
      initialVoiceSessionState={initialVoiceSessionState}
      initialSettings={initialSettings}
      initialTasks={initialTasks}
      initialSelectedTaskId={initialSelectedTaskId}
    />
  </StrictMode>,
);
