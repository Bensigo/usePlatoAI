import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App, ControlSurfacePanel } from "../src/App";
import { controlSurfaceEntries } from "../src/controlSurface";

describe("desktop app shell", () => {
  it("renders the minimal Plato first-window shell", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("First run shell");
    expect(markup).toContain("Ready for local setup");
  });

  it("renders every menu bar placeholder entry", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(controlSurfaceEntries.map((entry) => entry.id)).toEqual([
      "settings",
      "tasks",
      "memory",
      "permissions",
      "providers",
      "soul",
    ]);

    for (const entry of controlSurfaceEntries) {
      expect(markup).toContain(entry.label);
    }

    expect(markup).toContain(controlSurfaceEntries[0].description);
    expect(markup).toContain("This area is reachable from the macOS menu bar");
  });

  it("renders a placeholder panel for every menu bar entry", () => {
    for (const entry of controlSurfaceEntries) {
      const markup = renderToStaticMarkup(
        <ControlSurfacePanel activeEntry={entry.id} />,
      );

      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.description);
    }
  });
});
