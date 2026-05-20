import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TaskTrayPanel,
  advanceMockTask,
  createMemoryTaskStore,
  createMockTask,
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
});
