import { describe, expect, it } from "vitest";

import {
  createMemoryStore,
  createSensitiveMemoryApprovalRecord,
  type LocalMemoryInput,
  type SensitiveMemoryApprovalEvidence,
} from "../src/memory";

const approvalEvidence: SensitiveMemoryApprovalEvidence = {
  approvalId: "approval-sensitive-memory",
  approvalToken: "trusted-token-from-approval-flow",
};

const approvedMemory: LocalMemoryInput = {
  memoryId: "memory-approved-api-key",
  memoryKind: "summary",
  summary: "User API key = sk_test_1234567890abcdef",
  preferenceKey: null,
  preferenceValue: null,
  sourceKind: "user-approved-sensitive-memory",
  metadata: { extractor: "local-test-boundary" },
};

describe("memory store sensitive approval fallback", () => {
  it("rejects approved-sensitive writes without a registered trusted approval", async () => {
    const store = createMemoryStore();

    await expect(
      store.rememberApprovedSensitive(approvedMemory, approvalEvidence),
    ).rejects.toThrow("approval was not found");
    await expect(store.read(approvedMemory.memoryId)).resolves.toBeNull();
  });

  it("allows the exact approved sensitive memory payload once", async () => {
    const store = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedMemory,
          approvalEvidence,
        ),
      ],
    );

    await expect(
      store.rememberApprovedSensitive(approvedMemory, approvalEvidence),
    ).resolves.toMatchObject({
      memoryId: approvedMemory.memoryId,
      summary: approvedMemory.summary,
    });
    await expect(
      store.rememberApprovedSensitive(approvedMemory, approvalEvidence),
    ).rejects.toThrow("already been used");
  });

  it("rejects approval evidence bound to a different sensitive memory payload", async () => {
    const store = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedMemory,
          approvalEvidence,
        ),
      ],
    );
    const changedPayload = {
      ...approvedMemory,
      summary: "User API key = sk_test_fedcba0987654321",
    };

    await expect(
      store.rememberApprovedSensitive(changedPayload, approvalEvidence),
    ).rejects.toThrow("memory payload");
    await expect(store.read(approvedMemory.memoryId)).resolves.toBeNull();
  });

  it("rejects approval evidence bound to a different memory id", async () => {
    const store = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedMemory,
          approvalEvidence,
        ),
      ],
    );
    const changedMemoryId = {
      ...approvedMemory,
      memoryId: "memory-approved-api-key-other",
    };

    await expect(
      store.rememberApprovedSensitive(changedMemoryId, approvalEvidence),
    ).rejects.toThrow("memory id");
    await expect(store.read(approvedMemory.memoryId)).resolves.toBeNull();
    await expect(store.read(changedMemoryId.memoryId)).resolves.toBeNull();
  });

  it("rejects approval evidence bound to a different source kind", async () => {
    const store = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedMemory,
          approvalEvidence,
        ),
      ],
    );
    const changedSourceKind = {
      ...approvedMemory,
      sourceKind: "conversation-summary",
    };

    await expect(
      store.rememberApprovedSensitive(changedSourceKind, approvalEvidence),
    ).rejects.toThrow("memory source");
    await expect(store.read(approvedMemory.memoryId)).resolves.toBeNull();
  });
});
