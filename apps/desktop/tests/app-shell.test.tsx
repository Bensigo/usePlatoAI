import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

describe("desktop app shell", () => {
  it("renders the floating Plato presence controls", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("Idle presence");
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
  });
});
