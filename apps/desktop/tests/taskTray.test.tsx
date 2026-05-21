import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";
import {
  TaskTrayPanel,
  advanceMockTask,
  createApprovalGatedMockTask,
  createMemoryTaskStore,
  createMockTask,
  listActiveTasks,
  resolveMockTaskApproval,
  waitForMockTaskApproval,
} from "../src/tasks";
import { defaultCompanionSettings } from "../src/settings";

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
});
