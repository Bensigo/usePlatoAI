import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { audioActivationStateFrom } from "./audioActivation";
import { avatarPresenceStateFrom } from "./avatarSurface";
import { isControlSurfaceId } from "./controlSurface";
import { defaultCompanionSettings } from "./settings";
import { voiceSessionStateFrom } from "./voiceInteraction";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

const searchParams = new URLSearchParams(window.location.search);
const urlPresenceState = searchParams.get("presenceState");
const initialPresenceState = avatarPresenceStateFrom(urlPresenceState);
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

createRoot(root).render(
  <StrictMode>
    <App
      initialActiveEntry={initialActiveEntry}
      initialAudioActivationState={initialAudioActivationState}
      initialPresenceState={initialPresenceState}
      initialVoiceSessionState={initialVoiceSessionState}
      initialSettings={initialSettings}
    />
  </StrictMode>,
);
