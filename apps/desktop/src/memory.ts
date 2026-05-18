export type LocalMemoryKind = "summary" | "preference" | "correction";

export type LocalMemoryInput = {
  memoryId: string;
  memoryKind: LocalMemoryKind;
  summary: string;
  preferenceKey?: string | null;
  preferenceValue?: unknown;
  sourceKind: string;
  metadata: unknown;
};

export type LocalMemoryRecord = LocalMemoryInput & {
  createdAt: string;
  updatedAt: string;
};

export type SensitiveMemoryApprovalEvidence = {
  approvalId: string;
  approvalToken: string;
};

export type SensitiveMemoryApprovalRequest = {
  metadata: unknown;
};

export type LocalMemoryRetrievalQuery = {
  query?: string | null;
  memoryKind?: LocalMemoryKind | null;
  limit?: number | null;
};

export type MemoryStore = {
  remember: (memory: LocalMemoryInput) => Promise<LocalMemoryRecord>;
  approveSensitiveMemoryWrite: (
    request: SensitiveMemoryApprovalRequest,
  ) => Promise<SensitiveMemoryApprovalEvidence>;
  rememberApprovedSensitive: (
    memory: LocalMemoryInput,
    approvalEvidence: SensitiveMemoryApprovalEvidence,
  ) => Promise<LocalMemoryRecord>;
  read: (memoryId: string) => Promise<LocalMemoryRecord | null>;
  readPreference: (preferenceKey: string) => Promise<LocalMemoryRecord | null>;
  retrieve: (query: LocalMemoryRetrievalQuery) => Promise<LocalMemoryRecord[]>;
  delete: (memoryId: string) => Promise<boolean>;
  setMemoryEnabled: (isEnabled: boolean) => void;
};

export type UserCorrectionInput = {
  correctionId: string;
  correction: string;
  appliesTo?: string | null;
  metadata?: Record<string, unknown>;
};

const sensitiveJsonKeyFragments = [
  "secret",
  "credential",
  "password",
  "passcode",
  "api_key",
  "apikey",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "token",
  "bearer",
  "creditcard",
  "credit_card",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "ssn",
  "socialsecurity",
  "private_message",
  "privatemessage",
  "confidential",
];

const sensitiveTextPatterns = [
  /\b(?:sk|pk|rk|pat|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_=-]{12,}\b/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passcode)\s*[:=]\s*\S{6,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\b(?:\d[ -]?){13,19}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

const sensitiveApprovalMetadataKeys = ["surface", "reason"];

export function containsSensitiveMemoryData(memory: LocalMemoryInput): boolean {
  return (
    containsSensitiveText(memory.summary) ||
    containsSensitiveValue(memory.metadata) ||
    containsSensitiveValue(memory.preferenceValue ?? null)
  );
}

export async function rememberExtractedMemory(
  store: MemoryStore,
  memory: LocalMemoryInput,
): Promise<LocalMemoryRecord | null> {
  if (containsSensitiveMemoryData(memory)) {
    return null;
  }

  return store.remember(memory);
}

export async function rememberApprovedSensitiveMemory(
  store: MemoryStore,
  memory: LocalMemoryInput,
  approvalEvidence: SensitiveMemoryApprovalEvidence,
): Promise<LocalMemoryRecord> {
  return store.rememberApprovedSensitive(memory, approvalEvidence);
}

export async function saveUserCorrectionMemory(
  store: MemoryStore,
  correction: UserCorrectionInput,
): Promise<LocalMemoryRecord> {
  return store.remember({
    memoryId: correction.correctionId,
    memoryKind: "correction",
    summary: correction.correction,
    sourceKind: "user-correction",
    metadata: {
      ...(correction.metadata ?? {}),
      appliesTo: correction.appliesTo ?? null,
    },
  });
}

export async function retrieveUserCorrections(
  store: MemoryStore,
  query: string,
  limit = 5,
): Promise<LocalMemoryRecord[]> {
  const matchingCorrections = await store.retrieve({
    query,
    memoryKind: "correction",
    limit,
  });

  if (matchingCorrections.length > 0) {
    return matchingCorrections;
  }

  return store.retrieve({
    memoryKind: "correction",
    limit,
  });
}

export function createMemoryStore(
  initialRecords: LocalMemoryRecord[] = [],
  initialEnabled = true,
): MemoryStore {
  const records = new Map(initialRecords.map((record) => [record.memoryId, record]));
  const approvals = new Map<string, SensitiveMemoryApprovalEvidence>();
  let approvalSequence = 0;
  let isMemoryEnabled = initialEnabled;

  async function rememberMemory(
    memory: LocalMemoryInput,
    options: { allowSensitiveData: boolean },
  ) {
    const now = new Date(0).toISOString();
    const existing = records.get(memory.memoryId);

    if (!existing && !isMemoryEnabled) {
      throw new Error("memory is disabled; new memory writes are paused");
    }

    if (
      containsSensitiveMemoryData(memory) &&
      !options.allowSensitiveData
    ) {
      throw new Error(
        "memory payload contains sensitive data; trusted approval is required",
      );
    }

    const record: LocalMemoryRecord = {
      ...memory,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    records.set(record.memoryId, record);
    return record;
  }

  return {
    async remember(memory) {
      return rememberMemory(memory, { allowSensitiveData: false });
    },
    async approveSensitiveMemoryWrite(request) {
      validateSensitiveMemoryApprovalMetadata(request.metadata);
      approvalSequence += 1;
      const approvalEvidence = {
        approvalId: `approval-sensitive-memory-${approvalSequence}`,
        approvalToken: `trusted-token-${approvalSequence}`,
      };
      approvals.set(approvalEvidence.approvalId, approvalEvidence);
      return approvalEvidence;
    },
    async rememberApprovedSensitive(memory, approvalEvidence) {
      if (!approvalEvidence.approvalId.trim() || !approvalEvidence.approvalToken.trim()) {
        throw new Error("trusted approval evidence is required");
      }
      const storedApproval = approvals.get(approvalEvidence.approvalId);
      if (!storedApproval) {
        throw new Error("trusted sensitive memory approval was not found");
      }
      if (storedApproval.approvalToken !== approvalEvidence.approvalToken) {
        throw new Error("trusted sensitive memory approval token is invalid");
      }
      approvals.delete(approvalEvidence.approvalId);

      return rememberMemory(memory, { allowSensitiveData: true });
    },
    async read(memoryId) {
      return records.get(memoryId) ?? null;
    },
    async readPreference(preferenceKey) {
      return (
        [...records.values()].find(
          (record) =>
            record.memoryKind === "preference" &&
            record.preferenceKey === preferenceKey,
        ) ?? null
      );
    },
    async retrieve(query) {
      const textQuery = query.query?.trim().toLocaleLowerCase();
      return [...records.values()]
        .filter((record) => !query.memoryKind || record.memoryKind === query.memoryKind)
        .filter((record) => {
          if (!textQuery) {
            return true;
          }

          return [
            record.summary,
            record.preferenceKey ?? "",
            JSON.stringify(record.preferenceValue ?? null),
          ].some((value) => value.toLocaleLowerCase().includes(textQuery));
        })
        .slice(0, query.limit ?? 10);
    },
    async delete(memoryId) {
      return records.delete(memoryId);
    },
    setMemoryEnabled(nextEnabled) {
      isMemoryEnabled = nextEnabled;
    },
  };
}

export function createTauriMemoryStore(): MemoryStore {
  const fallbackStore = createMemoryStore();

  return {
    async remember(memory) {
      if (!isTauriRuntime()) {
        return fallbackStore.remember(memory);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord>("remember_local_memory", { memory });
    },
    async approveSensitiveMemoryWrite(request) {
      if (!isTauriRuntime()) {
        return fallbackStore.approveSensitiveMemoryWrite(request);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<SensitiveMemoryApprovalEvidence>("approve_sensitive_memory_write", {
        request,
      });
    },
    async rememberApprovedSensitive(memory, approvalEvidence) {
      if (!isTauriRuntime()) {
        return fallbackStore.rememberApprovedSensitive(memory, approvalEvidence);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord>("remember_approved_sensitive_local_memory", {
        memory,
        approvalEvidence,
      });
    },
    async read(memoryId) {
      if (!isTauriRuntime()) {
        return fallbackStore.read(memoryId);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord | null>("read_local_memory", { memoryId });
    },
    async readPreference(preferenceKey) {
      if (!isTauriRuntime()) {
        return fallbackStore.readPreference(preferenceKey);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord | null>("read_local_memory_preference", {
        preferenceKey,
      });
    },
    async retrieve(query) {
      if (!isTauriRuntime()) {
        return fallbackStore.retrieve(query);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LocalMemoryRecord[]>("retrieve_local_memories", { query });
    },
    async delete(memoryId) {
      if (!isTauriRuntime()) {
        return fallbackStore.delete(memoryId);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<boolean>("delete_local_memory", { memoryId });
    },
    setMemoryEnabled(isEnabled) {
      fallbackStore.setMemoryEnabled(isEnabled);
    },
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function validateSensitiveMemoryApprovalMetadata(value: unknown) {
  rejectRawTranscriptMaterial(value);
  if (containsSensitiveValue(value)) {
    throw new Error(
      "sensitive memory approval metadata must not include sensitive values",
    );
  }

  if (!isRecord(value)) {
    throw new Error("sensitive memory approval metadata must be an object");
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (!sensitiveApprovalMetadataKeys.includes(key)) {
      throw new Error(
        `sensitive memory approval metadata must not include \`${key}\``,
      );
    }

    if (nestedValue === null) {
      continue;
    }

    if (typeof nestedValue !== "string") {
      throw new Error(
        `sensitive memory approval metadata \`${key}\` must be a string`,
      );
    }

    if (!nestedValue.trim()) {
      throw new Error(
        `sensitive memory approval metadata \`${key}\` must not be empty`,
      );
    }

    if (nestedValue.length > 240) {
      throw new Error(
        `sensitive memory approval metadata \`${key}\` is too long`,
      );
    }
  }
}

function rejectRawTranscriptMaterial(value: unknown) {
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      rejectRawTranscriptMaterial(nestedValue);
    }
    return;
  }

  if (isRecord(value)) {
    if (isMessageTurnObject(value)) {
      throw new Error(
        "memory payload must not include raw transcript message objects",
      );
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isRawTranscriptFieldName(key)) {
        throw new Error(
          `memory payload must not include raw transcript material in \`${key}\``,
        );
      }
      rejectRawTranscriptMaterial(nestedValue);
    }
    return;
  }

  if (typeof value === "string" && looksLikeRawTranscriptText(value)) {
    throw new Error(
      "memory payload must not include raw transcript material in `value`",
    );
  }
}

function containsSensitiveValue(value: unknown): boolean {
  if (typeof value === "string") {
    return containsSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsSensitiveValue);
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, nestedValue]) => {
      return (
        containsSensitiveJsonKey(key) || containsSensitiveValue(nestedValue)
      );
    });
  }

  return false;
}

function containsSensitiveJsonKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase();
  return sensitiveJsonKeyFragments.some((fragment) =>
    normalizedKey.includes(fragment.replace(/[^a-z0-9]/gi, "")),
  );
}

function containsSensitiveText(value: string): boolean {
  return sensitiveTextPatterns.some((pattern) => pattern.test(value));
}

function isMessageTurnObject(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  return (
    keys.some(isMessageParticipantFieldName) &&
    keys.some(isMessageTextFieldName)
  );
}

function isMessageParticipantFieldName(key: string) {
  return ["role", "speaker"].includes(normalizeJsonKey(key));
}

function isMessageTextFieldName(key: string) {
  return ["text", "message", "body", "utterance"].includes(
    normalizeJsonKey(key),
  );
}

function isRawTranscriptFieldName(key: string) {
  return [
    "transcript",
    "rawtranscript",
    "conversation",
    "conversationlog",
    "fullconversation",
    "messages",
    "rawmessages",
    "messagelog",
    "turns",
    "content",
  ].includes(normalizeJsonKey(key));
}

function normalizeJsonKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase();
}

function looksLikeRawTranscriptText(value: string) {
  const lowerValue = value.trim().toLocaleLowerCase();
  if (!lowerValue) {
    return false;
  }

  return (
    /\b(user|assistant|plato|system)\s*:/.test(lowerValue) ||
    /\n\s*(user|assistant|plato|system)\s*:/.test(lowerValue)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
