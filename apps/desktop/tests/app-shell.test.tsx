import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

describe("desktop app shell", () => {
  it("renders the minimal Plato first-window shell", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("First run shell");
    expect(markup).toContain("Ready for local setup");
  });
});
