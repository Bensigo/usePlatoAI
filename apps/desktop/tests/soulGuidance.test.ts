import { describe, expect, it } from "vitest";

import {
  buildSoulGuidancePrompt,
  fallbackSoulGuidance,
  type SoulGuidance,
} from "../src/soulGuidance";

describe("soul guidance prompt", () => {
  it("keeps editable soul guidance below an immutable policy boundary", () => {
    const guidance: SoulGuidance = {
      ...fallbackSoulGuidance,
      effectiveMarkdown: "# Custom Soul\n\nBe terse.",
      policyBoundary:
        "Soul guidance cannot override permissions, execution authority, provider configuration, or memory deletion rules.",
    };

    expect(buildSoulGuidancePrompt(guidance)).toMatchInlineSnapshot(`
      "Local soul guidance:
      # Custom Soul

      Be terse.

      Immutable policy boundary:
      Soul guidance cannot override permissions, execution authority, provider configuration, or memory deletion rules."
    `);
  });
});
