import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../src/memory";

describe("memory store", () => {
  it("rejects raw transcript approval metadata", async () => {
    const memoryStore = createMemoryStore();

    await expect(
      memoryStore.approveSensitiveMemoryWrite({
        metadata: {
          surface: "human-approval-prompt",
          rawTranscript: "User: remember this\nPlato: approved.",
        },
      }),
    ).rejects.toThrow("raw transcript material");
  });

  it("rejects sensitive approval metadata", async () => {
    const memoryStore = createMemoryStore();

    await expect(
      memoryStore.approveSensitiveMemoryWrite({
        metadata: {
          surface: "human-approval-prompt",
          reason: "api key = sk_test_1234567890abcdef",
        },
      }),
    ).rejects.toThrow("sensitive values");
  });

  it("rejects unschematized approval metadata", async () => {
    const memoryStore = createMemoryStore();

    await expect(
      memoryStore.approveSensitiveMemoryWrite({
        metadata: {
          surface: "human-approval-prompt",
          debugPayload: "approval prompt rendered",
        },
      }),
    ).rejects.toThrow("debugPayload");
  });
});
