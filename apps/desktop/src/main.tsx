import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { avatarPresenceStateFrom } from "./avatarSurface";
import { defaultCompanionSettings } from "./settings";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

const searchParams = new URLSearchParams(window.location.search);
const urlPresenceState = searchParams.get("presenceState");
const initialPresenceState = avatarPresenceStateFrom(urlPresenceState);
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
      initialPresenceState={initialPresenceState}
      initialSettings={initialSettings}
    />
  </StrictMode>,
);
