export type LocalTaskStatus =
  | "running"
  | "waiting_for_approval"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled";

export type TaskApprovalDecision = "approved" | "rejected" | "dismissed";

export type TaskApprovalRequest = {
  prompt: string;
  actionLabel: string;
};

export type LocalTaskRecord = {
  taskId: string;
  title: string;
  status: LocalTaskStatus;
  progress: number;
  statusMessage: string;
  approvalRequest?: TaskApprovalRequest | null;
  approvalDecision?: TaskApprovalDecision | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaskMetadata = {
  taskId: string;
  title: string;
  status: string;
  metadata: unknown;
};

export type TaskStore = {
  save: (task: LocalTaskRecord) => Promise<LocalTaskRecord>;
  list: () => Promise<LocalTaskRecord[]>;
  audit: () => Promise<TaskAuditEntry[]>;
};

export type TaskAuditEntry = {
  taskId: string;
  decision: TaskApprovalDecision;
  createdAt: string;
};

const activeTaskStatuses: LocalTaskStatus[] = [
  "running",
  "waiting_for_approval",
  "paused",
  "failed",
];

export function createMockTask(taskId: string, title: string): LocalTaskRecord {
  const now = new Date(0).toISOString();

  return {
    taskId,
    title,
    status: "running",
    progress: 0,
    statusMessage: "Mock task started",
    approvalRequest: null,
    approvalDecision: null,
    summary: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createApprovalGatedMockTask(
  taskId: string,
  title: string,
): LocalTaskRecord {
  return {
    ...createMockTask(taskId, title),
    statusMessage: "Mock task started; approval gate is pending.",
  };
}

export function waitForMockTaskApproval(
  task: LocalTaskRecord,
): LocalTaskRecord {
  return {
    ...task,
    status: "waiting_for_approval",
    progress: Math.max(task.progress, 40),
    statusMessage: "Waiting for approval before mock browser submission.",
    approvalRequest: {
      prompt: "Approve mock browser form submission?",
      actionLabel: "Submit mock browser form",
    },
    approvalDecision: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function resolveMockTaskApproval(
  task: LocalTaskRecord,
  decision: TaskApprovalDecision,
): LocalTaskRecord {
  const approved = decision === "approved";

  return {
    ...task,
    status: approved ? "running" : "cancelled",
    progress: approved ? Math.max(task.progress, 65) : task.progress,
    statusMessage: approved
      ? "Approval granted; mock task is continuing."
      : `Approval ${decision}; gated mock action did not run.`,
    approvalRequest: null,
    approvalDecision: decision,
    summary: approved
      ? task.summary
      : `Stopped ${task.title} after approval was ${decision}.`,
    updatedAt: new Date(0).toISOString(),
  };
}

export function mockTaskTrayVisualTasks(): LocalTaskRecord[] {
  return [
    {
      ...createMockTask("mock-visual-research", "Research OAuth flow"),
      progress: 42,
      statusMessage: "Mock research is collecting local context",
    },
    {
      ...createMockTask("mock-visual-coding", "Patch task tray"),
      status: "failed",
      progress: 58,
      statusMessage: "Mock dependency failed; inspect detail for repair.",
      summary: "Task detail is open for the failed mock coding task.",
    },
  ];
}

export function mockApprovalTaskVisualTasks(
  state: "waiting" | "approved",
): LocalTaskRecord[] {
  const gatedTask = waitForMockTaskApproval(
    createApprovalGatedMockTask("mock-visual-approval", "Submit browser form"),
  );

  return [
    state === "approved"
      ? {
          ...resolveMockTaskApproval(gatedTask, "approved"),
          statusMessage: "Approval granted; mock task is continuing.",
        }
      : gatedTask,
  ];
}

export function advanceMockTask(task: LocalTaskRecord): LocalTaskRecord {
  const nextProgress = Math.min(100, task.progress + 25);

  return {
    ...task,
    progress: nextProgress,
    status: nextProgress >= 100 ? "completed" : "running",
    statusMessage:
      nextProgress >= 100 ? "Mock task completed" : "Mock task running",
    summary:
      nextProgress >= 100
        ? `Completed ${task.title} with mock local progress.`
        : task.summary,
    updatedAt: new Date(0).toISOString(),
  };
}

export function listActiveTasks(tasks: LocalTaskRecord[]) {
  return tasks.filter((task) => activeTaskStatuses.includes(task.status));
}

export function createMemoryTaskStore(
  initialTasks: LocalTaskRecord[] = [],
): TaskStore {
  const tasks = new Map(initialTasks.map((task) => [task.taskId, task]));
  const audit: TaskAuditEntry[] = [];

  return {
    async save(task) {
      const existing = tasks.get(task.taskId);
      const record = {
        ...task,
        createdAt: existing?.createdAt ?? task.createdAt,
        updatedAt: task.updatedAt,
      };
      tasks.set(task.taskId, record);
      if (record.approvalDecision) {
        audit.push({
          taskId: record.taskId,
          decision: record.approvalDecision,
          createdAt: record.updatedAt,
        });
      }
      return record;
    },
    async list() {
      return [...tasks.values()];
    },
    async audit() {
      return [...audit];
    },
  };
}

export function createTauriTaskStore(): TaskStore {
  const fallbackStore = createMemoryTaskStore();

  return {
    async save(task) {
      if (!isTauriRuntime()) {
        return fallbackStore.save(task);
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const metadata = taskRecordToMetadata(task);
      const saved = await invoke<TaskMetadata>("save_local_task", { task: metadata });
      return taskRecordFromMetadata(saved);
    },
    async list() {
      if (!isTauriRuntime()) {
        return fallbackStore.list();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const tasks = await invoke<TaskMetadata[]>("retrieve_local_tasks");
      return tasks.map(taskRecordFromMetadata);
    },
    async audit() {
      if (!isTauriRuntime()) {
        return fallbackStore.audit();
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<
        {
          category: string;
          action: string;
          metadata: unknown;
          createdAt: string;
        }[]
      >("read_recent_audit_history", { limit: 50 });

      return entries
        .filter((entry) => entry.category === "task_metadata")
        .map((entry) => {
          const metadata = isRecord(entry.metadata) ? entry.metadata : {};
          return {
            taskId: stringFrom(metadata.taskId, ""),
            decision: approvalDecisionFrom(metadata.approvalDecision),
            createdAt: entry.createdAt,
          };
        })
        .filter((entry): entry is TaskAuditEntry => Boolean(entry.decision));
    },
  };
}

export function TaskTrayPanel({
  tasks,
  selectedTaskId,
  onStartMockTasks,
  onSelectTask,
  onApproveTask,
  onRejectTask,
  onDismissApproval,
}: {
  tasks: LocalTaskRecord[];
  selectedTaskId?: string | null;
  onStartMockTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onApproveTask?: (taskId: string) => void;
  onRejectTask?: (taskId: string) => void;
  onDismissApproval?: (taskId: string) => void;
}) {
  const selectedTask =
    tasks.find((task) => task.taskId === selectedTaskId) ?? tasks[0] ?? null;

  return (
    <section className="task-tray" aria-label="Task tray">
      <header className="task-tray-header">
        <div>
          <p className="status-label">Task tray</p>
          <h2>Parallel work</h2>
        </div>
        <button type="button" onClick={onStartMockTasks}>
          Start two mock tasks
        </button>
      </header>

      <div className="task-list" role="list" aria-label="Local tasks">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              role="listitem"
              className={task.taskId === selectedTask?.taskId ? "active" : undefined}
              onClick={() => onSelectTask(task.taskId)}
            >
              <span>
                <strong>{task.title}</strong>
                <small>{task.status}</small>
              </span>
              <span className="task-progress" aria-label={`${task.progress}% complete`}>
                <span style={{ width: `${task.progress}%` }} />
              </span>
              <em>{task.progress}%</em>
            </button>
          ))
        ) : (
          <p className="empty-state">No local tasks yet</p>
        )}
      </div>

      {selectedTask ? (
        <section className="task-detail" aria-label="Task detail">
          <p className="status-label">Task detail</p>
          <h3>{selectedTask.title}</h3>
          <dl className="compact-facts">
            <div>
              <dt>Status</dt>
              <dd>{selectedTask.status}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{selectedTask.progress}%</dd>
            </div>
          </dl>
          <p>{selectedTask.statusMessage}</p>
          {selectedTask.status === "waiting_for_approval" &&
          selectedTask.approvalRequest ? (
            <div className="task-approval-detail">
              <strong>{selectedTask.approvalRequest.prompt}</strong>
              <p>{selectedTask.approvalRequest.actionLabel}</p>
              <div className="task-approval-actions">
                <button
                  type="button"
                  onClick={() => onApproveTask?.(selectedTask.taskId)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onRejectTask?.(selectedTask.taskId)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => onDismissApproval?.(selectedTask.taskId)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {selectedTask.summary ? <p>{selectedTask.summary}</p> : null}
        </section>
      ) : null}
    </section>
  );
}

function taskRecordToMetadata(task: LocalTaskRecord): TaskMetadata {
  return {
    taskId: task.taskId,
    title: task.title,
    status: task.status,
    metadata: {
      progress: task.progress,
      statusMessage: task.statusMessage,
      approvalRequest: task.approvalRequest ?? null,
      approvalDecision: task.approvalDecision ?? null,
      summary: task.summary ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
  };
}

function taskRecordFromMetadata(task: TaskMetadata): LocalTaskRecord {
  const metadata = isRecord(task.metadata) ? task.metadata : {};

  return {
    taskId: task.taskId,
    title: task.title,
    status: localTaskStatusFrom(task.status),
    progress: numberFrom(metadata.progress, 0),
    statusMessage: stringFrom(metadata.statusMessage, "Task status unavailable"),
    approvalRequest: approvalRequestFrom(metadata.approvalRequest),
    approvalDecision: approvalDecisionFrom(metadata.approvalDecision),
    summary: nullableStringFrom(metadata.summary),
    createdAt: stringFrom(metadata.createdAt, new Date(0).toISOString()),
    updatedAt: stringFrom(metadata.updatedAt, new Date(0).toISOString()),
  };
}

function localTaskStatusFrom(value: string): LocalTaskStatus {
  return activeTaskStatuses.includes(value as LocalTaskStatus) ||
    ["completed", "cancelled"].includes(value)
    ? (value as LocalTaskStatus)
    : "running";
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nullableStringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function approvalRequestFrom(value: unknown): TaskApprovalRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const prompt = stringFrom(value.prompt, "");
  const actionLabel = stringFrom(value.actionLabel, "");
  return prompt && actionLabel ? { prompt, actionLabel } : null;
}

function approvalDecisionFrom(value: unknown): TaskApprovalDecision | null {
  return value === "approved" || value === "rejected" || value === "dismissed"
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
