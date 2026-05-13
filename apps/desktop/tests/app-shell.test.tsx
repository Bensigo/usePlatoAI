import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App, DismissedPresence } from "../src/App";

describe("desktop app shell", () => {
  it("renders the floating Plato presence controls", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("Idle presence");
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
    expect(markup).not.toContain("Plato is hidden");
  });

  it("renders a restore path for the dismissed presence state", () => {
    const markup = renderToStaticMarkup(
      <DismissedPresence onRestore={() => undefined} />,
    );

    expect(markup).toContain("Plato presence hidden");
    expect(markup).toContain("Plato is hidden");
    expect(markup).toContain("Show Plato presence");
  });
});
