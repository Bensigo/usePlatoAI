import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import {
  TaskTrayPanel,
  applyLocalTaskTransition,
  advanceMockTask,
  createApprovalGatedMockTask,
  createMemoryTaskStore,
  createMockTask,
  createTauriTaskStore,
  localTaskControlsFor,
  listActiveTasks,
  resolveMockTaskApproval,
  type LocalTaskRecord,
  waitForMockTaskApproval,
} from "../src/tasks";
import { defaultCompanionSettings } from "../src/settings";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  invokeMock.mockReset();
});

describe("task tray and local mock tasks", () => {
  it("persists two mock tasks and exposes active progress for the tray", async () => {
    const store = createMemoryTaskStore();
    const researchTask = createMockTask("task-research", "Research OAuth flow");
    const codingTask = createMockTask("task-coding", "Patch task tray");

    await store.save(researchTask);
    await store.save(codingTask);

    await store.save(advanceMockTask(researchTask));
    await store.save({
      ...advanceMockTask(codingTask),
      status: "failed",
      progress: 52,
      statusMessage: "Mock dependency failed",
    });

    const activeTasks = listActiveTasks(await store.list());

    expect(activeTasks.map((task) => task.taskId)).toEqual([
      "task-research",
      "task-coding",
    ]);
    expect(activeTasks[0]).toMatchObject({
      title: "Research OAuth flow",
      status: "running",
      progress: 25,
    });
    expect(activeTasks[1]).toMatchObject({
      title: "Patch task tray",
      status: "failed",
      progress: 52,
      statusMessage: "Mock dependency failed",
    });
  });

  it("renders multiple tasks plus an inspectable task detail view", () => {
    const tasks = [
      {
        ...createMockTask("task-research", "Research OAuth flow"),
        progress: 45,
      },
      {
        ...createMockTask("task-coding", "Patch task tray"),
        status: "completed" as const,
        progress: 100,
        statusMessage: "Mock task completed",
        summary: "Patched the visible task tray.",
      },
    ];
    const markup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={tasks}
        selectedTaskId="task-coding"
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );

    expect(markup).toContain("Task tray");
    expect(markup).toContain("Start two mock tasks");
    expect(markup).toContain("Research OAuth flow");
    expect(markup).toContain("Patch task tray");
    expect(markup).toContain("45%");
    expect(markup).toContain("completed");
    expect(markup).toContain("Task detail");
    expect(markup).toContain("Patched the visible task tray.");
  });

  it("persists approval wait, approval decisions, and audit history", async () => {
    const store = createMemoryTaskStore();
    const gatedTask = createApprovalGatedMockTask(
      "task-approval",
      "Submit browser form",
    );

    await store.save(gatedTask);
    const waitingTask = await store.save(waitForMockTaskApproval(gatedTask));
    const approvedTask = await store.save(
      resolveMockTaskApproval(waitingTask, "approved"),
    );
    const rejectedTask = await store.save(
      resolveMockTaskApproval(waitingTask, "rejected"),
    );
    const dismissedTask = await store.save(
      resolveMockTaskApproval(waitingTask, "dismissed"),
    );

    expect(waitingTask).toMatchObject({
      status: "waiting_for_approval",
      progress: 40,
      approvalRequest: {
        prompt: "Approve mock browser form submission?",
      },
    });
    expect(approvedTask).toMatchObject({
      status: "running",
      progress: 65,
      statusMessage: "Approval granted; mock task is continuing.",
      approvalDecision: "approved",
      approvedArtifacts: [
        expect.objectContaining({
          artifactId: "task-approval-approved-decision",
          label: "Submit mock browser form",
          kind: "decision",
          approvalDecision: "approved",
        }),
      ],
    });
    expect(rejectedTask).toMatchObject({
      status: "cancelled",
      statusMessage: "Approval rejected; gated mock action did not run.",
      approvalDecision: "rejected",
    });
    expect(dismissedTask).toMatchObject({
      status: "cancelled",
      statusMessage: "Approval dismissed; gated mock action did not run.",
      approvalDecision: "dismissed",
    });

    await expect(store.list()).resolves.toContainEqual(
      expect.objectContaining({
        taskId: "task-approval",
        approvalDecision: "dismissed",
      }),
    );
    await expect(store.audit()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task-approval",
          decision: "approved",
          artifactIds: ["task-approval-approved-decision"],
        }),
        expect.objectContaining({
          taskId: "task-approval",
          decision: "rejected",
        }),
        expect.objectContaining({
          taskId: "task-approval",
          decision: "dismissed",
        }),
      ]),
    );
  });

  it("maps approved artifact IDs from Tauri task audit metadata", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invokeMock.mockResolvedValueOnce([
      {
        category: "task_metadata",
        action: "task.completed",
        metadata: {
          taskId: "task-approval",
          status: "completed",
          approvalDecision: "approved",
          approvedArtifactIds: ["task-approval-approved-decision"],
        },
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      {
        category: "settings",
        action: "settings.updated",
        metadata: {
          taskId: "ignored",
          approvalDecision: "approved",
          approvedArtifactIds: ["ignored-artifact"],
        },
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ]);

    await expect(createTauriTaskStore().audit()).resolves.toEqual([
      {
        taskId: "task-approval",
        decision: "approved",
        artifactIds: ["task-approval-approved-decision"],
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ]);
    expect(invokeMock).toHaveBeenCalledWith("read_recent_audit_history", {
      limit: 50,
    });
  });

  it("retains terminal summaries and strips raw execution logs from durable task snapshots", async () => {
    const store = createMemoryTaskStore();
    const rawExecutionLog = "tool call stdout that should not be durable";

    await store.save({
      ...createMockTask("task-completed", "Summarize local work"),
      status: "completed",
      progress: 100,
      statusMessage: "Mock task completed",
      summary: "Completed local work and retained the concise summary.",
      rawExecutionLog,
    } as LocalTaskRecord & { rawExecutionLog: string });
    await store.save({
      ...createMockTask("task-failed", "Patch dependency"),
      status: "failed",
      progress: 40,
      statusMessage: "Dependency install failed",
    });
    await store.save({
      ...createMockTask("task-cancelled", "Draft browser action"),
      status: "cancelled",
      progress: 10,
      statusMessage: "Mock task cancelled",
    });

    const tasks = await store.list();

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task-completed",
          summary: "Completed local work and retained the concise summary.",
        }),
        expect.objectContaining({
          taskId: "task-failed",
          summary: "Failed Patch dependency: Dependency install failed.",
        }),
        expect.objectContaining({
          taskId: "task-cancelled",
          summary: "Cancelled Draft browser action.",
        }),
      ]),
    );
    expect(JSON.stringify(tasks)).not.toContain(rawExecutionLog);
    expect(JSON.stringify(tasks)).not.toContain("rawExecutionLog");
  });

  it("renders completed approval summaries and approved artifact references", () => {
    const approvedTask = {
      ...resolveMockTaskApproval(
        waitForMockTaskApproval(
          createApprovalGatedMockTask("task-approval", "Submit browser form"),
        ),
        "approved",
      ),
      status: "completed" as const,
      progress: 100,
      statusMessage: "Mock task completed after approval.",
      summary:
        "Completed Submit browser form after approval; retained the approved decision reference.",
    };

    const markup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[approvedTask]}
        selectedTaskId={approvedTask.taskId}
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );

    expect(markup).toContain("completed");
    expect(markup).toContain(
      "Completed Submit browser form after approval; retained the approved decision reference.",
    );
    expect(markup).toContain("Approved references");
    expect(markup).toContain("Submit mock browser form");
    expect(markup).toContain("decision");
  });

  it("renders approval waiting state in the tray, detail view, and near Plato", () => {
    const waitingTask = waitForMockTaskApproval(
      createApprovalGatedMockTask("task-approval", "Submit browser form"),
    );
    const trayMarkup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[waitingTask]}
        selectedTaskId="task-approval"
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onApproveTask={() => undefined}
        onRejectTask={() => undefined}
        onDismissApproval={() => undefined}
        onTaskAction={() => undefined}
      />,
    );
    const appMarkup = renderToStaticMarkup(
      <App
        initialSettings={{
          ...defaultCompanionSettings,
          onboardingComplete: true,
        }}
        initialTasks={[waitingTask]}
        initialSelectedTaskId="task-approval"
      />,
    );

    expect(trayMarkup).toContain("waiting_for_approval");
    expect(trayMarkup).toContain("Approve mock browser form submission?");
    expect(trayMarkup).toContain("Approve");
    expect(trayMarkup).toContain("Reject");
    expect(trayMarkup).toContain("Dismiss");
    expect(appMarkup).toContain("Open current task controls");
    expect(appMarkup).toContain("Approval needed");
  });

  it("pauses, resumes, completes, fails, and rejects invalid task transitions", () => {
    const runningTask = {
      ...createMockTask("task-coding", "Patch task tray"),
      progress: 25,
    };

    const pausedTask = applyLocalTaskTransition(runningTask, "pause");
    expect(pausedTask).toMatchObject({
      status: "paused",
      progress: 25,
      statusMessage: "Mock task paused",
    });

    expect(() => applyLocalTaskTransition(pausedTask, "advance")).toThrow(
      "Cannot advance a paused local task",
    );

    const resumedTask = applyLocalTaskTransition(pausedTask, "resume");
    expect(resumedTask).toMatchObject({
      status: "running",
      progress: 25,
      statusMessage: "Mock task resumed",
    });

    expect(applyLocalTaskTransition(resumedTask, "complete")).toMatchObject({
      status: "completed",
      progress: 100,
      summary: "Completed Patch task tray with mock local progress.",
    });

    expect(applyLocalTaskTransition(resumedTask, "fail")).toMatchObject({
      status: "failed",
      progress: 25,
      statusMessage: "Mock task failed",
    });

    expect(() => applyLocalTaskTransition(pausedTask, "pause")).toThrow(
      "Cannot pause a paused local task",
    );
  });

  it("keeps cancelled tasks inspectable and prevents resuming them", () => {
    const cancelledTask = applyLocalTaskTransition(
      {
        ...createMockTask("task-coding", "Patch task tray"),
        progress: 58,
      },
      "cancel",
    );

    expect(cancelledTask).toMatchObject({
      status: "cancelled",
      progress: 58,
      statusMessage: "Mock task cancelled",
      summary: "Cancelled Patch task tray at 58%.",
    });
    expect(listActiveTasks([cancelledTask])).toEqual([]);

    const markup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[cancelledTask]}
        selectedTaskId={cancelledTask.taskId}
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );

    expect(markup).toContain("cancelled");
    expect(markup).toContain("Cancelled Patch task tray at 58%.");
    expect(() => applyLocalTaskTransition(cancelledTask, "resume")).toThrow(
      "Cannot resume a cancelled local task",
    );
  });

  it("renders pause, resume, and cancel controls for the selected task state", () => {
    const runningTask = {
      ...createMockTask("task-coding", "Patch task tray"),
      progress: 58,
    };
    const pausedTask = applyLocalTaskTransition(runningTask, "pause");

    const runningMarkup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[runningTask]}
        selectedTaskId={runningTask.taskId}
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );
    const pausedMarkup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[pausedTask]}
        selectedTaskId={pausedTask.taskId}
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );

    expect(localTaskControlsFor(runningTask)).toEqual(["pause", "cancel"]);
    expect(runningMarkup).toContain("Pause task");
    expect(runningMarkup).toContain("Cancel task");
    expect(localTaskControlsFor(pausedTask)).toEqual(["resume", "cancel"]);
    expect(pausedMarkup).toContain("Resume task");
    expect(pausedMarkup).toContain("Cancel task");
  });

  it("renders only cancellable controls for approval-waiting tasks", () => {
    const waitingTask = {
      ...createMockTask("task-approval", "Approve browser submission"),
      status: "waiting_for_approval" as const,
      progress: 64,
      statusMessage: "Mock browser action is waiting for approval.",
    };

    const markup = renderToStaticMarkup(
      <TaskTrayPanel
        tasks={[waitingTask]}
        selectedTaskId={waitingTask.taskId}
        onStartMockTasks={() => undefined}
        onSelectTask={() => undefined}
        onTaskAction={() => undefined}
      />,
    );

    expect(localTaskControlsFor(waitingTask)).toEqual(["cancel"]);
    expect(markup).not.toContain("Pause task");
    expect(markup).toContain("Cancel task");
    expect(() => applyLocalTaskTransition(waitingTask, "pause")).toThrow(
      "Cannot pause a waiting_for_approval local task",
    );
    expect(applyLocalTaskTransition(waitingTask, "cancel")).toMatchObject({
      status: "cancelled",
      progress: 64,
      statusMessage: "Mock task cancelled",
      summary: "Cancelled Approve browser submission at 64%.",
    });
  });
});
