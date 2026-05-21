import "./styles.css";

import { renderProviderSettings } from "./provider-settings.js";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Missing desktop app root");
}

renderProviderSettings(app);
