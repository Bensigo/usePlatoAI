import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TaskTrayPanel,
  applyLocalTaskTransition,
  advanceMockTask,
  createMemoryTaskStore,
  createMockTask,
  localTaskControlsFor,
  listActiveTasks,
} from "../src/tasks";

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
});
