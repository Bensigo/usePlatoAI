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

export type TaskArtifactReference = {
  artifactId: string;
  label: string;
  kind: "decision" | "file" | "browser_action" | "note";
  approvedAt: string;
  approvalDecision: "approved";
  uri?: string | null;
};

export type LocalTaskRecord = {
  taskId: string;
  title: string;
  status: LocalTaskStatus;
  progress: number;
  statusMessage: string;
  approvalRequest?: TaskApprovalRequest | null;
  approvalDecision?: TaskApprovalDecision | null;
  approvedArtifacts?: TaskArtifactReference[];
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalTaskAction =
  | "pause"
  | "resume"
  | "cancel"
  | "advance"
  | "complete"
  | "fail";

export type TaskNotificationTier = "quiet" | "attention" | "urgent";

export type TaskNotificationPolicy = {
  tier: TaskNotificationTier;
  label: string;
  detail: string;
  surfacesInTaskTray: boolean;
  surfacesNearCompanion: boolean;
  interruptsCompanionInteraction: boolean;
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
  artifactIds: string[];
  status: LocalTaskStatus;
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
    approvedArtifacts: [],
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
    approvedArtifacts: approved
      ? [
          ...(task.approvedArtifacts ?? []),
          approvedArtifactForTask(task, new Date(0).toISOString()),
        ]
      : task.approvedArtifacts ?? [],
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
      summary:
        "Failed Patch task tray after mock dependency failure; no raw execution log retained.",
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
          status: "completed",
          progress: 100,
          statusMessage: "Mock task completed after approval.",
          summary:
            "Completed Submit browser form after approval; retained the approved decision reference.",
        }
      : gatedTask,
  ];
}

export function advanceMockTask(task: LocalTaskRecord): LocalTaskRecord {
  return applyLocalTaskTransition(task, "advance");
}

export function applyLocalTaskTransition(
  task: LocalTaskRecord,
  action: LocalTaskAction,
): LocalTaskRecord {
  const updatedAt = new Date(0).toISOString();

  if (action === "pause") {
    assertTaskStatus(task, ["running"], action);

    return {
      ...task,
      status: "paused",
      statusMessage: "Mock task paused",
      updatedAt,
    };
  }

  if (action === "resume") {
    assertTaskStatus(task, ["paused"], action);

    return {
      ...task,
      status: "running",
      statusMessage: "Mock task resumed",
      updatedAt,
    };
  }

  if (action === "cancel") {
    assertTaskStatus(task, ["running", "paused", "waiting_for_approval"], action);

    return {
      ...task,
      status: "cancelled",
      statusMessage: "Mock task cancelled",
      summary: `Cancelled ${task.title} at ${task.progress}%.`,
      updatedAt,
    };
  }

  if (action === "advance") {
    assertTaskStatus(task, ["running"], action);
    return advancedTask(task, updatedAt);
  }

  if (action === "complete") {
    assertTaskStatus(task, ["running"], action);

    return {
      ...task,
      progress: 100,
      status: "completed",
      statusMessage: "Mock task completed",
      summary: `Completed ${task.title} with mock local progress.`,
      updatedAt,
    };
  }

  assertTaskStatus(task, ["running", "waiting_for_approval"], action);

  return {
    ...task,
    status: "failed",
    statusMessage: "Mock task failed",
    summary: `Failed ${task.title} at ${task.progress}%.`,
    updatedAt,
  };
}

export function localTaskControlsFor(task: LocalTaskRecord): LocalTaskAction[] {
  if (task.status === "running") {
    return ["pause", "cancel"];
  }

  if (task.status === "waiting_for_approval") {
    return ["cancel"];
  }

  if (task.status === "paused") {
    return ["resume", "cancel"];
  }

  return [];
}

export function taskNotificationPolicyFor(
  task: LocalTaskRecord,
): TaskNotificationPolicy {
  if (task.status === "waiting_for_approval") {
    return {
      tier: "urgent",
      label: "Approval needed",
      detail: task.approvalRequest?.actionLabel ?? task.statusMessage,
      surfacesInTaskTray: true,
      surfacesNearCompanion: true,
      interruptsCompanionInteraction: true,
    };
  }

  if (task.status === "failed") {
    return {
      tier: "attention",
      label: "Needs repair",
      detail: task.statusMessage,
      surfacesInTaskTray: true,
      surfacesNearCompanion: true,
      interruptsCompanionInteraction: false,
    };
  }

  return {
    tier: "quiet",
    label: task.status === "completed" ? "Completed quietly" : "Quiet update",
    detail: task.statusMessage,
    surfacesInTaskTray: true,
    surfacesNearCompanion: false,
    interruptsCompanionInteraction: false,
  };
}

export function companionTaskNotificationFor(
  tasks: LocalTaskRecord[],
): TaskNotificationPolicy | null {
  const notifications = tasks
    .map(taskNotificationPolicyFor)
    .filter((notification) => notification.surfacesNearCompanion);

  return (
    notifications.find((notification) => notification.tier === "urgent") ??
    notifications.find((notification) => notification.tier === "attention") ??
    null
  );
}

function advancedTask(
  task: LocalTaskRecord,
  updatedAt: string,
): LocalTaskRecord {
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
    updatedAt,
  };
}

function assertTaskStatus(
  task: LocalTaskRecord,
  allowedStatuses: LocalTaskStatus[],
  action: LocalTaskAction,
) {
  if (!allowedStatuses.includes(task.status)) {
    throw new Error(`Cannot ${action} a ${task.status} local task`);
  }
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
      const record = retainedTaskSnapshot({
        ...task,
        createdAt: existing?.createdAt ?? task.createdAt,
        updatedAt: task.updatedAt,
      });
      tasks.set(task.taskId, record);
      if (record.approvalDecision) {
        audit.push({
          taskId: record.taskId,
          decision: record.approvalDecision,
          artifactIds: record.approvedArtifacts?.map((artifact) => artifact.artifactId) ?? [],
          status: record.status,
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
            artifactIds: taskAuditArtifactIdsFrom(metadata),
            status: localTaskStatusFrom(stringFrom(metadata.status, "running")),
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
  onTaskAction,
}: {
  tasks: LocalTaskRecord[];
  selectedTaskId?: string | null;
  onStartMockTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onApproveTask?: (taskId: string) => void;
  onRejectTask?: (taskId: string) => void;
  onDismissApproval?: (taskId: string) => void;
  onTaskAction: (taskId: string, action: LocalTaskAction) => void;
}) {
  const selectedTask =
    tasks.find((task) => task.taskId === selectedTaskId) ?? tasks[0] ?? null;
  const surfacedNotifications = tasks
    .map((task) => ({
      task,
      notification: taskNotificationPolicyFor(task),
    }))
    .filter(({ notification }) => notification.tier !== "quiet");

  return (
    <section
      className="task-tray"
      aria-label="Task tray"
      data-native-hit-region="capture"
    >
      <header className="task-tray-header">
        <div>
          <p className="status-label">Task tray</p>
          <h2>Parallel work</h2>
        </div>
        <button type="button" onClick={onStartMockTasks}>
          Start two mock tasks
        </button>
      </header>

      {surfacedNotifications.length > 0 ? (
        <div className="task-notification-stack" aria-label="Task notifications">
          {surfacedNotifications.map(({ task, notification }) => (
            <div
              key={`${task.taskId}-${notification.tier}`}
              className="task-notification"
              data-notification-tier={notification.tier}
            >
              <strong>{notification.label}</strong>
              <span>{task.title}</span>
              <small>{notification.detail}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="task-list" role="list" aria-label="Local tasks">
        {tasks.length > 0 ? (
          tasks.map((task) => {
            const notification = taskNotificationPolicyFor(task);

            return (
              <button
                key={task.taskId}
                type="button"
                role="listitem"
                className={
                  task.taskId === selectedTask?.taskId ? "active" : undefined
                }
                data-notification-tier={notification.tier}
                onClick={() => onSelectTask(task.taskId)}
              >
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {task.status} · {notification.label}
                  </small>
                </span>
                <span
                  className="task-progress"
                  aria-label={`${task.progress}% complete`}
                >
                  <span style={{ width: `${task.progress}%` }} />
                </span>
                <em>{task.progress}%</em>
              </button>
            );
          })
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
          {selectedTask.approvedArtifacts?.length ? (
            <section className="task-artifacts" aria-label="Approved artifacts">
              <p className="status-label">Approved references</p>
              <ul>
                {selectedTask.approvedArtifacts.map((artifact) => (
                  <li key={artifact.artifactId}>
                    <strong>{artifact.label}</strong>
                    <span>{artifact.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="task-detail-actions">
            {localTaskControlsFor(selectedTask).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onTaskAction(selectedTask.taskId, action)}
              >
                {taskActionLabel(action)}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function taskActionLabel(action: LocalTaskAction) {
  if (action === "pause") {
    return "Pause task";
  }

  if (action === "resume") {
    return "Resume task";
  }

  return "Cancel task";
}

function taskRecordToMetadata(task: LocalTaskRecord): TaskMetadata {
  const retainedTask = retainedTaskSnapshot(task);

  return {
    taskId: retainedTask.taskId,
    title: retainedTask.title,
    status: retainedTask.status,
    metadata: {
      progress: retainedTask.progress,
      statusMessage: retainedTask.statusMessage,
      approvalRequest: retainedTask.approvalRequest ?? null,
      approvalDecision: retainedTask.approvalDecision ?? null,
      approvedArtifacts: retainedTask.approvedArtifacts ?? [],
      summary: retainedTask.summary ?? null,
      createdAt: retainedTask.createdAt,
      updatedAt: retainedTask.updatedAt,
    },
  };
}

function taskRecordFromMetadata(task: TaskMetadata): LocalTaskRecord {
  const metadata = isRecord(task.metadata) ? task.metadata : {};

  return retainedTaskSnapshot({
    taskId: task.taskId,
    title: task.title,
    status: localTaskStatusFrom(task.status),
    progress: numberFrom(metadata.progress, 0),
    statusMessage: stringFrom(metadata.statusMessage, "Task status unavailable"),
    approvalRequest: approvalRequestFrom(metadata.approvalRequest),
    approvalDecision: approvalDecisionFrom(metadata.approvalDecision),
    approvedArtifacts: artifactReferencesFrom(metadata.approvedArtifacts),
    summary: nullableStringFrom(metadata.summary),
    createdAt: stringFrom(metadata.createdAt, new Date(0).toISOString()),
    updatedAt: stringFrom(metadata.updatedAt, new Date(0).toISOString()),
  });
}

function retainedTaskSnapshot(task: LocalTaskRecord): LocalTaskRecord {
  return {
    taskId: task.taskId,
    title: task.title,
    status: task.status,
    progress: task.progress,
    statusMessage: task.statusMessage,
    approvalRequest: task.approvalRequest ?? null,
    approvalDecision: task.approvalDecision ?? null,
    approvedArtifacts: task.approvedArtifacts ?? [],
    summary: task.summary ?? terminalTaskSummary(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function terminalTaskSummary(task: LocalTaskRecord) {
  if (task.status === "completed") {
    return `Completed ${task.title}.`;
  }

  if (task.status === "failed") {
    return `Failed ${task.title}: ${task.statusMessage}.`;
  }

  if (task.status === "cancelled") {
    return `Cancelled ${task.title}.`;
  }

  return null;
}

function approvedArtifactForTask(
  task: LocalTaskRecord,
  approvedAt: string,
): TaskArtifactReference {
  return {
    artifactId: `${task.taskId}-approved-decision`,
    label: task.approvalRequest?.actionLabel ?? `${task.title} approval`,
    kind: "decision",
    approvedAt,
    approvalDecision: "approved",
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

function artifactReferencesFrom(value: unknown): TaskArtifactReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((artifact) => {
    if (!isRecord(artifact)) {
      return [];
    }

    const artifactId = stringFrom(artifact.artifactId, "");
    const label = stringFrom(artifact.label, "");
    const approvedAt = stringFrom(artifact.approvedAt, "");
    const kind = artifactKindFrom(artifact.kind);

    return artifactId && label && approvedAt && kind
      ? [
          {
            artifactId,
            label,
            kind,
            approvedAt,
            approvalDecision: "approved",
            uri: nullableStringFrom(artifact.uri),
          },
        ]
      : [];
  });
}

function taskAuditArtifactIdsFrom(metadata: Record<string, unknown>) {
  const artifactIds = stringArrayFrom(metadata.approvedArtifactIds);

  return artifactIds.length > 0
    ? artifactIds
    : artifactReferencesFrom(metadata.approvedArtifacts).map(
        (artifact) => artifact.artifactId,
      );
}

function stringArrayFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function artifactKindFrom(value: unknown): TaskArtifactReference["kind"] | null {
  return value === "decision" ||
    value === "file" ||
    value === "browser_action" ||
    value === "note"
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
