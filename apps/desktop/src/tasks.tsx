export type LocalTaskStatus =
  | "running"
  | "waiting_for_approval"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled";

export type LocalTaskRecord = {
  taskId: string;
  title: string;
  status: LocalTaskStatus;
  progress: number;
  statusMessage: string;
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
    summary: null,
    createdAt: now,
    updatedAt: now,
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

  return {
    async save(task) {
      const existing = tasks.get(task.taskId);
      const record = {
        ...task,
        createdAt: existing?.createdAt ?? task.createdAt,
        updatedAt: task.updatedAt,
      };
      tasks.set(task.taskId, record);
      return record;
    },
    async list() {
      return [...tasks.values()];
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
  };
}

export function TaskTrayPanel({
  tasks,
  selectedTaskId,
  onStartMockTasks,
  onSelectTask,
}: {
  tasks: LocalTaskRecord[];
  selectedTaskId?: string | null;
  onStartMockTasks: () => void;
  onSelectTask: (taskId: string) => void;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
