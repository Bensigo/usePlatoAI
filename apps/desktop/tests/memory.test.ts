import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../src/memory";

describe("fallback memory store sensitive approval provenance", () => {
  it("rejects approvals without complete provenance metadata", async () => {
    const memoryStore = createMemoryStore();

    for (const metadata of [
      null,
      {},
      { surface: "human-approval-prompt" },
      { reason: "User approved remembering sensitive data." },
      {
        surface: null,
        reason: "User approved remembering sensitive data.",
      },
      {
        surface: "human-approval-prompt",
        reason: null,
      },
      {
        surface: " ",
        reason: "User approved remembering sensitive data.",
      },
      {
        surface: "human-approval-prompt",
        reason: " ",
      },
      {
        surface: "human-approval-prompt",
        reason: "User approved remembering sensitive data.",
        extra: "not allowed",
      },
    ]) {
      await expect(
        memoryStore.approveSensitiveMemoryWrite({ metadata }),
      ).rejects.toThrow("sensitive memory approval metadata");
    }
  });

  it("mints approval evidence for valid provenance metadata", async () => {
    const memoryStore = createMemoryStore();

    await expect(
      memoryStore.approveSensitiveMemoryWrite({
        metadata: {
          surface: "human-approval-prompt",
          reason: "User approved remembering sensitive data.",
        },
      }),
    ).resolves.toMatchObject({
      approvalId: "approval-sensitive-memory-1",
      approvalToken: "trusted-token-1",
    });
  });
});
