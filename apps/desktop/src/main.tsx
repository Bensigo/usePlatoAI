import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { isAvatarPresenceState } from "./avatarSurface";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

const urlPresenceState = new URLSearchParams(window.location.search).get(
  "presenceState",
);
const initialPresenceState = isAvatarPresenceState(urlPresenceState)
  ? urlPresenceState
  : undefined;

createRoot(root).render(
  <StrictMode>
    <App initialPresenceState={initialPresenceState} />
  </StrictMode>,
);
