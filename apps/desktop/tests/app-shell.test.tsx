import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  App,
  AudioActivationStatus,
  CenteredChatPanel,
  ConfigPanel,
  ControlSurfacePanel,
  DismissedPresence,
  FirstRunOnboarding,
  MemoryBrowserPanel,
  PresenceListeningBubble,
  SoulEditorPanel,
  VoiceInteractionPanel,
  currentTaskPresenceStateForAction,
  currentTaskPresenceStateForLocalTasks,
  avatarEyeTrackingClientPointFromDesktopCursor,
  isActiveCorrectionPromptTransition,
  isActionableCurrentTaskState,
  loadPersistedLocalTasks,
  loadPersistedPresencePosition,
  openControlSurfaceEntryFromEvent,
  renderedPresenceStateFor,
  shouldSurfaceTaskStateNearCompanion,
  shouldShowCenteredChatPanelOpener,
} from "../src/App";
import {
  agentOutputAvatarCueForText,
  agentOutputAvatarReactionForText,
  completeAgentOutputAvatar,
  progressAgentOutputAvatar,
  runtimeControlsForAgentOutputFrame,
  startAgentOutputAvatar,
} from "../src/agentOutputAvatar";
import {
  audioActivationSnapshotForState,
  audioActivationStateFrom,
  audioActivationStateLabel,
  canStartVoiceInteractionWithAudio,
  createAudioActivationSnapshot,
  markAudioActivationResult,
  playComingOnlineSound,
  setAudioActivationMuted,
} from "../src/audioActivation";
import {
  Live2DAvatarSurface,
  avatarIdleWavePolicy,
  avatarStartupSound,
  avatarCompanionStateFromTestCommand,
  avatarCompanionStateForClickReaction,
  avatarEyeDirectionFromCursor,
  avatarEyeDirectionNeutral,
  avatarPresenceStateFrom,
  avatarPresenceStates,
  fallbackRendererFor,
  getAvatarRendererConfig,
  getLive2DAvatarSurfaceHook,
  isAvatarPresenceState,
  type AvatarPresenceState,
} from "../src/avatarSurface";
import { controlSurfaceEntries } from "../src/controlSurface";
import {
  createMemoryStore,
  createSensitiveMemoryApprovalRecord,
  rememberApprovedSensitiveMemory,
  rememberExtractedMemory,
  retrieveUserCorrections,
  saveUserCorrectionMemory,
} from "../src/memory";
import {
  createMemoryPresenceStateSource,
  normalizePresenceState,
  presenceStateSnapshot,
} from "../src/presenceState";
import {
  createMemoryPresencePositionStore,
  presenceDragIdleTimeoutMs,
  presenceDragModeAfterDoubleClick,
  presenceDragModeAfterIdle,
  shouldStartPresenceWindowDrag,
} from "../src/presencePosition";
import {
  isPointInsideAvatarVisibleHitArea,
  shouldCapturePresenceCursor,
} from "../src/presenceHitTest";
import {
  type CompanionSettings,
  createMemorySettingsStore,
  defaultCompanionSettings,
  defaultExecutionAuthorityPolicy,
  decisionForActionImpact,
} from "../src/settings";
import {
  createMemoryTaskStore,
  createMockTask,
  waitForMockTaskApproval,
  type LocalTaskRecord,
} from "../src/tasks";
import {
  createVoiceOutputSession,
  mockVoiceResponse,
  setVoiceOutputMuted,
  startMockSpeech,
  stopMockSpeech,
} from "../src/voiceOutput";
import {
  createMemorySoulGuidanceStore,
  fallbackSoulGuidance,
  type SoulGuidanceStore,
} from "../src/soulGuidance";
import {
  companionPresenceForVoiceState,
  companionPromptForInputWithCorrections,
  companionPromptForInput,
  defaultVoiceInteractionSnapshot,
  nextMockVoiceSnapshot,
  presenceLabelForState,
  textFallbackResponseSnapshot,
  textFallbackThinkingSnapshot,
  voiceSessionStateFrom,
} from "../src/voiceInteraction";
import {
  componentStateRules,
  experienceTokenCss,
  experienceTokens,
} from "../src/experienceTokens";
import {
  hasStartupSoundAttempted,
  millisecondsUntilNextStartupIdleWave,
  nextStartupIdleWaveIntervalMs,
  resetStartupSoundReplayGuardForTests,
  runStartupCompanionSequence,
  startupCompanionStateForPresenceState,
  startupPresenceReleaseDelayMs,
  startupPresenceTimeline,
  startupSoundReplayStorageKey,
  type StartupPresenceState,
} from "../src/startupSequence";

const completedSettings: CompanionSettings = {
  ...defaultCompanionSettings,
  onboardingComplete: true,
};

function createStartupSequenceStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeText).join("");
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return nodeText(element.props.children);
  }

  return "";
}

function findButtonClickHandler(
  node: ReactNode,
  label: string,
): (() => void) | undefined {
  if (node === null || node === undefined || typeof node === "boolean") {
    return undefined;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const handler = findButtonClickHandler(child, label);
      if (handler) {
        return handler;
      }
    }
    return undefined;
  }

  if (!isValidElement(node)) {
    return undefined;
  }

  const element = node as ReactElement<{
    children?: ReactNode;
    onClick?: () => void;
  }>;

  if (element.type === "button" && nodeText(element.props.children) === label) {
    return element.props.onClick;
  }

  return findButtonClickHandler(element.props.children, label);
}

describe("desktop app shell", () => {
  it("renders a companion-only default desktop presence with collapsed controls", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("usePlatoAI");
    expect(markup).toContain("Plato");
    expect(markup).toContain("Wake name: Plato");
    expect(markup).toContain("Idle presence");
    expect(markup).toContain("data-avatar-motion-group=\"idle\"");
    expect(markup).toContain("data-avatar-expression=\"idle\"");
    expect(markup).toContain("React with Plato");
    expect(markup).toContain("Open Plato controls");
    expect(markup).toContain("Drag Plato presence");
    expect(markup).toContain("Hide Plato presence");
    expect(markup).not.toContain("Top Plato control surface");
    expect(markup).not.toContain("Voice output controls");
    expect(markup).not.toContain("Audio waits for activation");
    expect(markup).not.toContain("No passive listening.");
    expect(markup).not.toContain("Voice ready");
    expect(markup).not.toContain("Mute");
    expect(markup).not.toContain("Stop speech");
    expect(markup).not.toContain("Plato is hidden");
    expect(markup).not.toContain('aria-label="Task tray"');
    expect(markup).not.toContain("Parallel work");
    expect(markup).not.toContain("Start two mock tasks");
  });

  it("runs the launch startup sound and automatic greet-to-idle sequence", async () => {
    vi.useFakeTimers();
    resetStartupSoundReplayGuardForTests();

    const storage = createStartupSequenceStorage();
    const states: StartupPresenceState[] = [];
    let audioActivation = createAudioActivationSnapshot();
    const playSound = vi.fn().mockResolvedValue({ ok: true });

    try {
      const cleanup = runStartupCompanionSequence({
        setPresenceState: (state) => states.push(state),
        setAudioActivationSnapshot: (updater) => {
          audioActivation = updater(audioActivation);
        },
        playSound,
        storage,
      });

      expect(startupPresenceTimeline.map((step) => step.state)).toEqual([
        "appearing",
        "listening",
        "idle",
      ]);
      expect(startupCompanionStateForPresenceState("listening")).toBe("greeting");
      expect(states).toEqual(["appearing"]);
      expect(playSound).toHaveBeenCalledTimes(1);
      expect(storage.getItem(startupSoundReplayStorageKey)).toBe("true");

      await Promise.resolve();
      expect(audioActivation.startupSoundPlayed).toBe(true);
      expect(audioActivation.state).toBe("active");

      vi.advanceTimersByTime(560);
      expect(states).toEqual(["appearing", "listening"]);

      vi.advanceTimersByTime(960);
      expect(states).toEqual(["appearing", "listening", "idle"]);

      vi.advanceTimersByTime(startupPresenceReleaseDelayMs - 1520);
      expect(states).toEqual(["appearing", "listening", "idle", null]);

      cleanup();
    } finally {
      resetStartupSoundReplayGuardForTests();
      vi.useRealTimers();
    }
  });

  it("plays the avatar-owned bundled startup sound asset", async () => {
    const audioInstances: Array<{
      src: string;
      preload: string;
      volume: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
    }> = [];

    class MockAudioElement {
      src: string;
      preload = "";
      volume = 1;
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();

      constructor(src?: string) {
        this.src = src ?? "";
        audioInstances.push(this);
      }
    }

    const result = await playComingOnlineSound({
      AudioElementConstructor: MockAudioElement,
      setTimeoutFn: (callback: () => void) => {
        callback();
        return 0;
      },
    });

    expect(result).toEqual({ ok: true });
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe(avatarStartupSound.publicPath);
    expect(audioInstances[0].preload).toBe("auto");
    expect(audioInstances[0].volume).toBeLessThan(0.5);
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1);
  });

  it("rate-limits occasional idle waves and backs off during active states", () => {
    expect(
      millisecondsUntilNextStartupIdleWave({
        renderedPresenceState: "idle",
        nowMs: 1_000,
        lastWaveAtMs: null,
      }),
    ).toBe(avatarIdleWavePolicy.initialDelayMs);
    expect(
      millisecondsUntilNextStartupIdleWave({
        renderedPresenceState: "idle",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
        scheduledIntervalMs: 78_000,
      }),
    ).toBe(69_000);
    expect(nextStartupIdleWaveIntervalMs({ random: () => 0 })).toBe(60_000);
    expect(nextStartupIdleWaveIntervalMs({ random: () => 1 })).toBe(120_000);
    expect(
      millisecondsUntilNextStartupIdleWave({
        renderedPresenceState: "focused",
        nowMs: 10_000,
        lastWaveAtMs: 1_000,
      }),
    ).toBe(avatarIdleWavePolicy.activeStateBackoffMs);
    expect(
      millisecondsUntilNextStartupIdleWave({
        renderedPresenceState: "task_running",
        nowMs: 25_000,
        lastWaveAtMs: 1_000,
      }),
    ).toBe(avatarIdleWavePolicy.activeStateBackoffMs);
  });

  it("prevents startup sound replay across renderer remounts", async () => {
    resetStartupSoundReplayGuardForTests();

    const storage = createStartupSequenceStorage();
    const playSound = vi.fn().mockResolvedValue({
      ok: false,
      state: "unavailable",
      message: "This runtime does not expose Web Audio.",
    });
    let firstAudioActivation = createAudioActivationSnapshot();
    let secondAudioActivation = createAudioActivationSnapshot();

    try {
      const firstCleanup = runStartupCompanionSequence({
        setPresenceState: () => undefined,
        setAudioActivationSnapshot: (updater) => {
          firstAudioActivation = updater(firstAudioActivation);
        },
        playSound,
        storage,
      });

      await Promise.resolve();
      expect(firstAudioActivation.state).toBe("unavailable");
      expect(hasStartupSoundAttempted({ storage })).toBe(true);

      firstCleanup();
      resetStartupSoundReplayGuardForTests();

      const secondCleanup = runStartupCompanionSequence({
        setPresenceState: () => undefined,
        setAudioActivationSnapshot: (updater) => {
          secondAudioActivation = updater(secondAudioActivation);
        },
        playSound,
        storage,
      });

      await Promise.resolve();
      expect(playSound).toHaveBeenCalledTimes(1);
      expect(secondAudioActivation.state).toBe("inactive");

      secondCleanup();
    } finally {
      resetStartupSoundReplayGuardForTests();
    }
  });

  it("keeps persisted tasks out of the normal companion-only desktop window", () => {
    const approvalTask = waitForMockTaskApproval(
      createMockTask("task-waiting", "Patch task tray"),
    );
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialTasks={[approvalTask]} />,
    );

    expect(markup).toContain("Open current task controls: Approval needed");
    expect(markup).not.toContain('aria-label="Task tray"');
    expect(markup).not.toContain("Parallel work");
    expect(markup).not.toContain("Patch task tray");
  });

  it("keeps the default desktop background transparent for the floating companion window", () => {
    const styles = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

    expect(styles).toMatch(/:root\s*{[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/body\s*{[^}]*background:\s*transparent;/s);
  });

  it("allows the native presence window to ignore transparent cursor regions", () => {
    const tauriCapabilities = JSON.parse(
      readFileSync(
        resolve(__dirname, "../src-tauri/capabilities/default.json"),
        "utf8",
      ),
    ) as { permissions: string[] };
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(tauriCapabilities.permissions).toContain(
      "core:window:allow-set-ignore-cursor-events",
    );
    expect(appSource).toContain("setIgnoreCursorEvents");
    expect(markup).toContain('data-native-hit-region="avatar"');
    expect(markup).toContain('data-native-hit-region="capture"');
  });

  it("hit-tests the visible avatar separately from transparent canvas pixels", () => {
    const avatarRect = { left: 0, top: 0, width: 500, height: 690 };
    const transparentCorner = { x: 26, y: 34 };
    const visibleHead = { x: 250, y: 110 };
    const raisedWaveForearm = { x: 110, y: 195 };
    const raisedWaveHand = { x: 90, y: 95 };
    const oppositeTransparentForearm = { x: 390, y: 195 };
    const oppositeTransparentHand = { x: 410, y: 95 };

    expect(
      isPointInsideAvatarVisibleHitArea(visibleHead, avatarRect),
    ).toBe(true);
    expect(
      isPointInsideAvatarVisibleHitArea(raisedWaveForearm, avatarRect),
    ).toBe(true);
    expect(
      isPointInsideAvatarVisibleHitArea(raisedWaveHand, avatarRect),
    ).toBe(true);
    expect(
      isPointInsideAvatarVisibleHitArea(oppositeTransparentForearm, avatarRect),
    ).toBe(false);
    expect(
      isPointInsideAvatarVisibleHitArea(oppositeTransparentHand, avatarRect),
    ).toBe(false);
    expect(
      isPointInsideAvatarVisibleHitArea(transparentCorner, avatarRect),
    ).toBe(false);
    expect(
      shouldCapturePresenceCursor({
        point: oppositeTransparentHand,
        avatarRect,
        isPresenceDraggable: false,
      }),
    ).toBe(false);
    expect(
      shouldCapturePresenceCursor({
        point: transparentCorner,
        avatarRect,
        isPresenceDraggable: false,
      }),
    ).toBe(false);
    expect(
      shouldCapturePresenceCursor({
        point: transparentCorner,
        avatarRect,
        isPresenceDraggable: true,
      }),
    ).toBe(true);
    expect(
      shouldCapturePresenceCursor({
        point: transparentCorner,
        avatarRect,
        capturedElementRect: { left: 0, top: 0, width: 44, height: 44 },
      }),
    ).toBe(true);
  });

  it("configures the default Tauri window as a companion-sized floating presence", () => {
    const tauriConfig = JSON.parse(
      readFileSync(resolve(__dirname, "../src-tauri/tauri.conf.json"), "utf8"),
    ) as {
      app: {
        windows: Array<{
          width: number;
          height: number;
          minWidth?: number;
          minHeight?: number;
          decorations?: boolean;
          transparent?: boolean;
          alwaysOnTop?: boolean;
          resizable?: boolean;
          skipTaskbar?: boolean;
        }>;
      };
    };
    const mainWindow = tauriConfig.app.windows[0];

    expect(mainWindow).toMatchObject({
      width: 520,
      height: 720,
      minWidth: 520,
      minHeight: 720,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
    });
  });

  it("renders the expanded Plato controls when the compact opener is active", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(markup).toContain('aria-label="Top Plato control surface"');
    expect(markup).toContain("Collapse Plato controls");
    expect(markup).toContain("Voice output controls");
    expect(markup).toContain("Audio waits for activation");
    expect(markup).toContain("No passive listening.");
    expect(markup).toContain("Voice ready");
    expect(markup).toContain("Mute");
    expect(markup).toContain("Stop speech");
  });

  it("injects reusable experience tokens into the visible shell", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    expect(markup).toContain("data-plato-experience-tokens=\"true\"");
    expect(markup).toContain("--plato-color-companion: #0f766e");
    expect(markup).toContain(experienceTokens.stateColor.listening);
  });

  it("keeps component state rules explicit for future surfaces", () => {
    expect(Object.keys(componentStateRules).sort()).toEqual([
      "active",
      "disabled",
      "empty",
      "error",
      "hover",
      "loading",
      "offline",
    ]);
    expect(componentStateRules.error).toContain("repair-oriented");
  });

  it("consumes experience tokens from shell CSS rather than leaving them unused", () => {
    const css = readFileSync(
      resolve(__dirname, "../src/styles.css"),
      "utf8",
    );

    expect(experienceTokenCss).toContain("--plato-motion-waiting-approval");
    expect(css).toContain("var(--plato-color-companion)");
    expect(css).toContain("var(--plato-state-listening)");
    expect(css).toContain("var(--plato-elevation-avatar)");
  });

  it("scopes greet wave animation away from normal listening presence", () => {
    const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

    expect(css).toMatch(
      /\.live2d-avatar-surface\[data-presence-state="listening"\]\s+\.live2d-avatar-stage\s*{[^}]*animation-duration:\s*var\(--plato-motion-listening\);/s,
    );
    expect(css).toMatch(
      /\.live2d-avatar-surface\s+\.live2d-avatar-stage\[data-avatar-command="expression\.greeting"\]\s*{[^}]*animation:\s*avatar-greet-wave/s,
    );
    expect(css).not.toMatch(
      /\.live2d-avatar-surface\[data-presence-state="listening"\]\s+\.live2d-avatar-stage\s*{[^}]*avatar-greet-wave/s,
    );
  });

  it("maps renderer-independent presence states to Live2D surface hooks", () => {
    expect(avatarPresenceStates).toEqual([
      "appearing",
      "idle",
      "listening",
      "thinking",
      "speaking",
      "waitingApproval",
      "muted",
      "error",
    ]);

    const expectedMappings: Array<{
      state: AvatarPresenceState;
      statusText: string;
      motionGroup: string;
      expression: string;
    }> = [
      {
        state: "appearing",
        statusText: "Coming online",
        motionGroup: "appear",
        expression: "startup",
      },
      {
        state: "idle",
        statusText: "Idle presence",
        motionGroup: "idle",
        expression: "idle",
      },
      {
        state: "listening",
        statusText: "Listening now",
        motionGroup: "tap_body",
        expression: "listening",
      },
      {
        state: "thinking",
        statusText: "Thinking through it",
        motionGroup: "thinking",
        expression: "thinking",
      },
      {
        state: "speaking",
        statusText: "Speaking",
        motionGroup: "speak",
        expression: "speaking",
      },
      {
        state: "waitingApproval",
        statusText: "Waiting for approval",
        motionGroup: "approval",
        expression: "sad",
      },
      {
        state: "muted",
        statusText: "Muted",
        motionGroup: "quiet",
        expression: "idle",
      },
      {
        state: "error",
        statusText: "Needs repair",
        motionGroup: "error",
        expression: "error",
      },
    ];

    for (const mapping of expectedMappings) {
      const hook = getLive2DAvatarSurfaceHook(mapping.state);
      const markup = renderToStaticMarkup(
        <Live2DAvatarSurface presenceState={mapping.state} />,
      );
      const assetFile = resolve(
        __dirname,
        `../public${hook.avatarAssetPath}`,
      );

      expect(hook.statusText).toBe(mapping.statusText);
      expect(hook.avatarAssetPath).toBe("/avatar/plato/vrm/plato.vrm");
      expect(existsSync(assetFile)).toBe(true);
      expect(hook.motionGroup).toBe(mapping.motionGroup);
      expect(hook.expression).toBe(mapping.expression);
      expect(markup).toContain(`data-presence-state="${mapping.state}"`);
      expect(markup).toContain(`data-avatar-renderer="three-vrm"`);
      expect(markup).toContain("/avatar/plato/vrm/plato.vrm");
      expect(markup).toContain(`data-vrm-src="${hook.avatarAssetPath}"`);
      expect(markup).toContain(`data-avatar-motion-group="${mapping.motionGroup}"`);
      expect(markup).toContain(`data-avatar-expression="${mapping.expression}"`);
      expect(markup).toContain("data-avatar-fallback-surface");
      expect(markup).toContain(mapping.statusText);
      expect(markup).not.toContain("live2d-avatar-head");
      expect(markup).not.toContain("live2d-avatar-body");
    }
  });

  it("renders the visible avatar with the Plato VRM asset as the primary surface", () => {
    const markup = renderToStaticMarkup(
      <Live2DAvatarSurface presenceState="listening" />,
    );

    expect(markup).toContain("<canvas");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain("plato-vrm-avatar");
    expect(markup).toContain("plato-three-vrm-canvas");
    expect(markup).toContain('data-avatar-renderer="three-vrm"');
    expect(markup).toContain('data-avatar-companion-state="listening"');
    expect(markup).toContain('data-avatar-command="expression.listening"');
    expect(markup).toContain('data-vrm-loader="@pixiv/three-vrm"');
    expect(markup).toContain('data-three-alpha="true"');
    expect(markup).toContain('data-avatar-control-mouth-open="0.05"');
    expect(markup).toContain('data-avatar-control-smile="0"');
    expect(markup).not.toContain('data-avatar-command="expression.greeting"');
    expect(markup).toContain("live2d-presence-mark");
    expect(markup).toContain("live2d-presence-core");
    expect(markup).toContain("live2d-presence-meter");
    expect(markup).not.toContain("plato-wise-owl");
    expect(markup).not.toContain("plato-rive");
    expect(markup).not.toContain('data-fallback-renderer="svg"');
    expect(markup).not.toContain("live2d-avatar-hair");
    expect(markup).not.toContain("live2d-avatar-head");
    expect(markup).not.toContain("live2d-avatar-eye");
    expect(markup).not.toContain("live2d-avatar-mouth");
    expect(markup).not.toContain("live2d-avatar-body");
  });

  it("passes avatar-package eye tracking into the normalized VRM controls", () => {
    const markup = renderToStaticMarkup(
      <Live2DAvatarSurface
        presenceState="idle"
        eyeDirection={{ x: 0.25, y: -0.5 }}
      />,
    );
    const styles = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

    expect(
      avatarEyeDirectionFromCursor({
        cursorX: 200,
        cursorY: 200,
        avatarBounds: {
          left: 126,
          top: 99.2,
          width: 148,
          height: 240,
        },
      }),
    ).toEqual(avatarEyeDirectionNeutral);
    expect(markup).toContain('data-avatar-control-eye-x="0.25"');
    expect(markup).toContain('data-avatar-control-eye-y="-0.5"');
    expect(markup).toContain('data-vrm-loader="@pixiv/three-vrm"');
    expect(markup).not.toContain('data-avatar-eye-tracking="source-svg-pupils"');
    expect(markup).not.toContain('data-avatar-eye-tracking="fallback-overlay"');
    expect(markup).not.toContain("plato-avatar-eye-left");
    expect(markup).not.toContain("plato-avatar-eye-right");
    expect(styles).not.toContain(".plato-avatar-eye-tracking");
    expect(styles).toContain(".plato-three-vrm-canvas");
    expect(styles).not.toContain(".plato-rive-eye-tracking-overlay");
    expect(styles).not.toContain(".plato-rive-eye-pupil");
  });

  it("maps native desktop cursor coordinates into avatar client coordinates", () => {
    expect(
      avatarEyeTrackingClientPointFromDesktopCursor({
        cursorPosition: { x: 920, y: 560 },
        windowPosition: { x: 720, y: 320 },
        scaleFactor: 2,
      }),
    ).toEqual({ x: 100, y: 120 });
  });

  it("keeps avatar renderer fallback behavior explicit without an owl or Rive fallback", () => {
    const idleSurface = Live2DAvatarSurface({ presenceState: "idle" });
    const speakingSurface = Live2DAvatarSurface({ presenceState: "speaking" });
    const idleStage = idleSurface.props.children[0];
    const speakingStage = speakingSurface.props.children[0];

    expect(idleStage.key).toBe("/avatar/plato/vrm/plato.vrm");
    expect(speakingStage.key).toBe("/avatar/plato/vrm/plato.vrm");
    expect(fallbackRendererFor("missing-vrm-asset")).toEqual({
      renderer: "none",
      reason: "missing-vrm-asset",
      src: null,
    });
  });

  it("uses a transparent Three.js canvas without the removed SVG/Rive fallback CSS", () => {
    const styles = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

    expect(styles).not.toContain("opacity: 0.001");
    expect(styles).toContain(".plato-three-vrm-canvas");
    expect(styles).toContain("background: transparent");
    expect(styles).not.toContain(".plato-rive-canvas");
    expect(styles).not.toContain(".plato-avatar-source-svg-asset");
    expect(styles).not.toContain(".plato-avatar-fallback-asset");
    expect(styles).not.toContain(".plato-avatar-eye-tracking");
  });

  it("renders the floating presence from an injected presence state", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waitingApproval"
      />,
    );

    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain('data-presence-state="waitingApproval"');
    expect(markup).toContain('data-avatar-motion-group="approval"');
    expect(markup).toContain('data-avatar-expression="sad"');
  });

  it("recognizes valid URL presence states for visual smoke checks", () => {
    expect(isAvatarPresenceState("appearing")).toBe(true);
    expect(isAvatarPresenceState("speaking")).toBe(true);
    expect(isAvatarPresenceState("waitingApproval")).toBe(true);
    expect(isAvatarPresenceState("muted")).toBe(true);
    expect(isAvatarPresenceState("error")).toBe(true);
    expect(isAvatarPresenceState("unknown")).toBe(false);
    expect(isAvatarPresenceState(null)).toBe(false);
    expect(avatarPresenceStateFrom("waiting_for_approval")).toBe(
      "waitingApproval",
    );
    expect(avatarPresenceStateFrom("unknown")).toBeUndefined();
  });

  it("routes a visible mascot click to a character reaction without opening controls", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );

    const clickReactionConfig = getAvatarRendererConfig(
      avatarCompanionStateForClickReaction(),
    );

    expect(clickReactionConfig.controls.smile).toBeGreaterThan(0);
    expect(clickReactionConfig.controls.wave).toBeGreaterThan(0);
    expect(markup).toContain("React with Plato");
    expect(markup).toContain("avatar-action");
    expect(markup).not.toContain('aria-label="Top Plato control surface"');
    expect(markup).not.toContain("Voice output controls");
  });

  it("toggles mascot draggable mode by double-click and exits after drag idle", () => {
    expect(presenceDragModeAfterDoubleClick("locked")).toBe("draggable");
    expect(presenceDragModeAfterDoubleClick("draggable")).toBe("locked");
    expect(shouldStartPresenceWindowDrag("locked", 0)).toBe(false);
    expect(shouldStartPresenceWindowDrag("draggable", 0)).toBe(true);
    expect(shouldStartPresenceWindowDrag("draggable", 2)).toBe(false);
    expect(
      presenceDragModeAfterIdle({
        mode: "draggable",
        dragStoppedAt: 1_000,
        now: 1_000 + presenceDragIdleTimeoutMs - 1,
      }),
    ).toBe("draggable");
    expect(
      presenceDragModeAfterIdle({
        mode: "draggable",
        dragStoppedAt: 1_000,
        now: 1_000 + presenceDragIdleTimeoutMs,
      }),
    ).toBe("locked");
  });

  it("persists the dragged companion window position through the position store", async () => {
    const positionStore = createMemoryPresencePositionStore();

    await expect(positionStore.read()).resolves.toBeNull();
    await positionStore.save({ x: 420, y: 260 });
    await expect(positionStore.read()).resolves.toEqual({ x: 420, y: 260 });
  });

  it("loads a saved offscreen companion position for UI state without moving the startup window", async () => {
    const positionStore = createMemoryPresencePositionStore({
      x: 4_000,
      y: -200,
      displayId: "disconnected",
    });
    let appliedPosition: Awaited<ReturnType<typeof positionStore.read>> = null;

    const didApply = await loadPersistedPresencePosition({
      positionStore,
      setPresencePosition: (nextPosition) => {
        appliedPosition =
          typeof nextPosition === "function"
            ? nextPosition(appliedPosition)
            : nextPosition;
      },
    });

    expect(didApply).toBe(true);
    expect(appliedPosition).toEqual({
      x: 4_000,
      y: -200,
      displayId: "disconnected",
    });
  });

  it("renders the mascot drag-mode contract and subtle visual cue without a settings panel", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} />,
    );
    const styles = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

    expect(markup).toContain('data-presence-drag-mode="locked"');
    expect(markup).toContain('data-presence-draggable="false"');
    expect(markup).toContain("React with Plato");
    expect(markup).not.toContain("position control");
    expect(markup).not.toContain("Position settings");
    expect(styles).toMatch(
      /\.presence-card\[data-presence-drag-mode="draggable"\]\s+\.live2d-avatar-stage\s*{[^}]*box-shadow:/s,
    );
    expect(styles).toMatch(
      /\.avatar-action\[data-presence-draggable="true"\]\s*{[^}]*cursor:\s*grab;/s,
    );
  });

  it("maps hidden avatar test commands to product companion states", () => {
    expect(avatarCompanionStateFromTestCommand("greeting")).toBe("greeting");
    expect(avatarCompanionStateFromTestCommand("happy")).toBe("smile");
    expect(avatarCompanionStateFromTestCommand("smile")).toBe("smile");
    expect(avatarCompanionStateFromTestCommand("laugh")).toBe("laugh");
    expect(avatarCompanionStateFromTestCommand("sad")).toBe("sad");
    expect(avatarCompanionStateFromTestCommand("error")).toBe("error");
    expect(avatarCompanionStateFromTestCommand("thinking")).toBe("thinking");
    expect(avatarCompanionStateFromTestCommand("talking")).toBe("speaking");
    expect(avatarCompanionStateFromTestCommand("dance")).toBe("celebrating");
    expect(avatarCompanionStateFromTestCommand("celebration")).toBe(
      "celebrating",
    );
    expect(avatarCompanionStateFromTestCommand("asset-specific-happy")).toBeNull();
  });

  it("renders hidden avatar test commands without exposing normal UI controls", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAvatarTestCommand="dance"
      />,
    );

    expect(markup).toContain('data-avatar-companion-state="celebrating"');
    expect(markup).toContain('data-avatar-command="expression.celebrating"');
    expect(markup).toContain('data-avatar-expression="celebrating"');
    expect(markup).toContain("VRM: expression.celebrating / celebrating");
    expect(markup).toContain('data-avatar-control-laugh="0.75"');
    expect(markup).toContain('data-avatar-control-wave="0.85"');
    expect(markup).not.toContain("avatarTestCommand");
    expect(markup).not.toContain("Hidden avatar test");
    expect(markup).not.toContain('aria-label="Top Plato control surface"');
  });

  it("reports overridden avatar expression metadata from the renderer command", () => {
    const markup = renderToStaticMarkup(
      <Live2DAvatarSurface
        presenceState="idle"
        companionStateOverride="laugh"
      />,
    );

    expect(markup).toContain('data-presence-state="idle"');
    expect(markup).toContain('data-avatar-companion-state="laugh"');
    expect(markup).toContain('data-avatar-command="expression.laugh"');
    expect(markup).toContain('data-avatar-expression="laugh"');
    expect(markup).toContain("VRM: expression.laugh / laugh");
    expect(markup).not.toContain('data-avatar-expression="idle"');
    expect(markup).not.toContain("VRM: expression.laugh / idle");
  });

  it("renders presence state through the shared source boundary", () => {
    const presenceStateSource = createMemoryPresenceStateSource("listening");
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        presenceStateSource={presenceStateSource}
      />,
    );

    expect(markup).toContain("Listening");
    expect(markup).toContain('data-presence-state="listening"');
    expect(markup).toContain('data-avatar-command="expression.listening"');
    expect(markup).toContain('data-avatar-motion-group="tap_body"');
    expect(markup).toContain('data-avatar-expression="listening"');
  });

  it("does not let passive mute hide active product presence states", () => {
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "waiting_for_approval",
      }),
    ).toBe("waiting_for_approval");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "task_running",
      }),
    ).toBe("task_running");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "muted",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("muted");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "inactive",
        voiceOutputPresenceState: "speaking",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "waiting_for_approval",
      }),
    ).toBe("speaking");
  });

  it("does not animate muted or text-fallback agent output as active speech", () => {
    expect(
      renderedPresenceStateFor({
        audioActivationState: "active",
        voiceOutputPresenceState: "idle",
        voiceInteractionSessionState: "speaking",
        voiceInteractionIsMuted: true,
        sharedPresenceState: "idle",
      }),
    ).toBe("muted");
    expect(
      renderedPresenceStateFor({
        audioActivationState: "active",
        voiceOutputPresenceState: "idle",
        voiceInteractionSessionState: "speaking",
        voiceInteractionActivationSource: "text",
        sharedPresenceState: "idle",
      }),
    ).toBe("idle");
  });

  it("maps explicit audio activation errors into avatar error presence", () => {
    expect(
      renderedPresenceStateFor({
        audioActivationState: "error",
        voiceOutputPresenceState: "idle",
        voiceInteractionSessionState: "idle",
        sharedPresenceState: "idle",
      }),
    ).toBe("error");
  });

  it("falls back to idle presence for invalid state input", () => {
    expect(normalizePresenceState("renderer-owned-state")).toBe("idle");
    expect(presenceStateSnapshot("renderer-owned-state")).toEqual({
      state: "idle",
      label: "Idle presence",
      rendererHint: "resting",
    });
  });

  it("maps milestone presence states to renderer-independent labels", () => {
    expect(presenceStateSnapshot("idle").label).toBe("Idle presence");
    expect(presenceStateSnapshot("listening").label).toBe("Listening");
    expect(presenceStateSnapshot("thinking").label).toBe("Thinking");
    expect(presenceStateSnapshot("speaking").label).toBe("Speaking");
    expect(presenceStateSnapshot("waiting_for_approval").label).toBe(
      "Waiting for approval",
    );
    expect(presenceStateSnapshot("task_running").label).toBe("Task running");
    expect(presenceStateSnapshot("task_paused").label).toBe("Task paused");
  });

  it("renders a restore path for the dismissed presence state", () => {
    const markup = renderToStaticMarkup(
      <DismissedPresence onRestore={() => undefined} />,
    );

    expect(markup).toContain("Plato presence hidden");
    expect(markup).toContain("Plato is hidden");
    expect(markup).toContain("Show Plato presence");
  });

  it("renders the expanded top Plato control entries", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(controlSurfaceEntries.map((entry) => entry.id)).toEqual([
      "voice",
      "settings",
      "config",
      "memory",
      "soul",
      "trust",
    ]);

    for (const entry of controlSurfaceEntries) {
      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.state);
    }

    expect(markup).toContain("Top Plato control surface");
    expect(markup).toContain("Bottom Plato presence area");
    expect(markup).toContain(controlSurfaceEntries[0].description);
    expect(markup).toContain("Start listening");
    expect(markup).not.toContain("Tasks");
  });

  it("renders explicit voice controls and text fallback without credentials", () => {
    const markup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialControlsExpanded />,
    );

    expect(markup).toContain("Voice surface states");
    expect(markup).toContain("Local voice");
    expect(markup).toContain("configured");
    expect(markup).toContain("Cloud voice");
    expect(markup).toContain("missing");
    expect(markup).toContain("unavailable until enabled");
    expect(markup).toContain("Start listening");
    expect(markup).toContain("Mute voice output");
    expect(markup).toContain("Muted");
    expect(markup).toContain("Active");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Error");
    expect(markup).toContain("Text fallback");
    expect(markup).toContain("Ready for voice or text.");
    expect(markup).not.toContain("OpenAI credential");
  });

  it("renders audio activation states as explicit UI states", () => {
    const activeSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      { ok: true },
    );
    const unavailableSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      {
        ok: false,
        state: "unavailable",
        message: "This runtime does not expose Web Audio.",
      },
    );
    const errorSnapshot = markAudioActivationResult(
      createAudioActivationSnapshot(),
      {
        ok: false,
        state: "error",
        message: "Audio activation failed before playback.",
      },
    );

    expect(
      renderToStaticMarkup(
        <AudioActivationStatus
          audioActivation={setAudioActivationMuted(activeSnapshot, true)}
        />,
      ),
    ).toContain('data-audio-activation-state="muted"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={activeSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="active"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={unavailableSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="unavailable"');
    expect(
      renderToStaticMarkup(
        <AudioActivationStatus audioActivation={errorSnapshot} />,
      ),
    ).toContain('data-audio-activation-state="error"');
    expect(audioActivationStateLabel("inactive")).toBe("Inactive");
    expect(audioActivationStateFrom("active")).toBe("active");
    expect(audioActivationStateFrom("offline")).toBeUndefined();
    expect(audioActivationSnapshotForState("error").state).toBe("error");
    expect(canStartVoiceInteractionWithAudio(activeSnapshot)).toBe(true);
    expect(canStartVoiceInteractionWithAudio(unavailableSnapshot)).toBe(false);
    expect(canStartVoiceInteractionWithAudio(errorSnapshot)).toBe(false);
  });

  it("routes the visible voice start control through audio activation", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(source).toContain("function activateVoiceListening()");
    expect(source).toContain("onStartVoiceInteraction={activateVoiceListening}");
    expect(source).toContain("canStartVoiceInteractionWithAudio(nextSnapshot)");
    expect(source).not.toContain("onStartVoiceInteraction={startVoiceInteraction}");
    expect(source).not.toContain("startupSoundAttempted");
  });

  it("can render initial audio state for visual smoke captures", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="unavailable"
        initialControlsExpanded
      />,
    );

    expect(markup).toContain('data-audio-activation-state="unavailable"');
    expect(markup).toContain("Audio unavailable");
  });

  it("reports unavailable startup audio without throwing when bundled playback is missing", async () => {
    await expect(
      playComingOnlineSound({ AudioElementConstructor: undefined }),
    ).resolves.toEqual({
      ok: false,
      state: "unavailable",
      message: "This runtime does not expose bundled audio playback.",
    });
  });

  it("can open a specific top control for visual smoke captures", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialActiveEntry="config"
        initialControlsExpanded
      />,
    );

    expect(markup).toContain("Local config");
    expect(markup).toContain("Local configuration status");
    expect(markup).toContain('data-control-state="active"');
  });

  it("expands the control surface when a Tauri menu event opens a valid control", () => {
    let activeEntry = "voice";
    let areControlsExpanded = false;

    const didOpen = openControlSurfaceEntryFromEvent({
      payload: "memory",
      setActiveEntry: (nextActiveEntry) => {
        activeEntry = nextActiveEntry;
      },
      setAreControlsExpanded: (nextControlsExpanded) => {
        areControlsExpanded = nextControlsExpanded;
      },
    });

    expect(didOpen).toBe(true);
    expect(activeEntry).toBe("memory");
    expect(areControlsExpanded).toBe(true);
  });

  it("ignores invalid Tauri menu control events", () => {
    let activeEntry = "voice";
    let areControlsExpanded = false;

    const didOpen = openControlSurfaceEntryFromEvent({
      payload: "unknown",
      setActiveEntry: (nextActiveEntry) => {
        activeEntry = nextActiveEntry;
      },
      setAreControlsExpanded: (nextControlsExpanded) => {
        areControlsExpanded = nextControlsExpanded;
      },
    });

    expect(didOpen).toBe(false);
    expect(activeEntry).toBe("voice");
    expect(areControlsExpanded).toBe(false);
  });

  it("persists, edits, deletes, and disables local memory through the app store boundary", async () => {
    const memoryStore = createMemoryStore();

    await memoryStore.remember({
      memoryId: "memory-summary-1",
      memoryKind: "summary",
      summary: "User prefers direct implementation notes.",
      sourceKind: "conversation-summary",
      metadata: { extractor: "local-test-boundary" },
    });
    await memoryStore.remember({
      memoryId: "memory-preference-1",
      memoryKind: "preference",
      summary: "User wants verification notes in implementation PRs.",
      preferenceKey: "pr.verification_notes",
      preferenceValue: true,
      sourceKind: "user-approved-preference",
      metadata: { extractor: "local-test-boundary" },
    });

    await expect(memoryStore.read("memory-summary-1")).resolves.toMatchObject({
      memoryKind: "summary",
      summary: "User prefers direct implementation notes.",
    });
    await expect(
      memoryStore.readPreference("pr.verification_notes"),
    ).resolves.toMatchObject({
      memoryKind: "preference",
      preferenceValue: true,
    });
    await expect(
      memoryStore.retrieve({ query: "verification", memoryKind: "preference" }),
    ).resolves.toHaveLength(1);

    await memoryStore.remember({
      memoryId: "memory-summary-1",
      memoryKind: "summary",
      summary: "User prefers concise implementation notes.",
      sourceKind: "conversation-summary",
      metadata: { extractor: "local-test-boundary" },
    });
    await expect(memoryStore.read("memory-summary-1")).resolves.toMatchObject({
      summary: "User prefers concise implementation notes.",
    });

    await expect(memoryStore.delete("memory-preference-1")).resolves.toBe(true);
    await expect(
      memoryStore.retrieve({ query: "verification", memoryKind: "preference" }),
    ).resolves.toHaveLength(0);

    memoryStore.setMemoryEnabled(false);
    await expect(
      memoryStore.remember({
        memoryId: "memory-summary-2",
        memoryKind: "summary",
        summary: "This new memory should be blocked.",
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).rejects.toThrow("memory is disabled");
    await expect(
      memoryStore.remember({
        memoryId: "memory-summary-1",
        memoryKind: "summary",
        summary: "Existing memory remains repairable while paused.",
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).resolves.toMatchObject({
      summary: "Existing memory remains repairable while paused.",
    });
  });

  it("requires trusted approval before saving sensitive memory", async () => {
    const sensitiveSummary = "User API key = sk_test_1234567890abcdef";
    const approvedSensitiveMemory = {
      memoryId: "memory-sensitive-approved",
      memoryKind: "summary" as const,
      summary: sensitiveSummary,
      sourceKind: "user-approved-sensitive-memory",
      metadata: { extractor: "local-test-boundary" },
    };
    const approvalEvidence = {
      approvalId: "approval-sensitive-memory-1",
      approvalToken: "trusted-token-from-approval-flow",
    };
    const memoryStore = createMemoryStore(
      [],
      true,
      [
        await createSensitiveMemoryApprovalRecord(
          approvedSensitiveMemory,
          approvalEvidence,
        ),
      ],
    );

    await expect(
      rememberExtractedMemory(memoryStore, {
        memoryId: "memory-sensitive-1",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).resolves.toBeNull();
    await expect(memoryStore.read("memory-sensitive-1")).resolves.toBeNull();

    await expect(
      memoryStore.remember({
        memoryId: "memory-sensitive-direct",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: { extractor: "local-test-boundary" },
      }),
    ).rejects.toThrow("trusted approval is required");

    await expect(
      rememberExtractedMemory(memoryStore, {
        memoryId: "memory-sensitive-self-approved",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: {
          extractor: "local-test-boundary",
          sensitiveDataApproved: true,
        },
      }),
    ).resolves.toBeNull();
    await expect(
      memoryStore.read("memory-sensitive-self-approved"),
    ).resolves.toBeNull();

    await expect(
      memoryStore.remember({
        memoryId: "memory-sensitive-self-approved-direct",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "conversation-summary",
        metadata: {
          extractor: "local-test-boundary",
          approvedSensitiveData: true,
        },
      }),
    ).rejects.toThrow("trusted approval is required");

    await expect(
      rememberApprovedSensitiveMemory(
        memoryStore,
        approvedSensitiveMemory,
        approvalEvidence,
      ),
    ).resolves.toMatchObject({
      memoryId: "memory-sensitive-approved",
      summary: sensitiveSummary,
    });

    await expect(
      rememberApprovedSensitiveMemory(memoryStore, {
        memoryId: "memory-sensitive-approved-replay",
        memoryKind: "summary",
        summary: sensitiveSummary,
        sourceKind: "user-approved-sensitive-memory",
        metadata: { extractor: "local-test-boundary" },
      }, approvalEvidence),
    ).rejects.toThrow("already been used");
  });

  it("saves user corrections as replayable memory", async () => {
    const memoryStore = createMemoryStore();

    await saveUserCorrectionMemory(memoryStore, {
      correctionId: "correction-status-tone",
      correction: "When giving status updates, be blunt about blockers first.",
      appliesTo: "status updates",
    });

    await expect(
      retrieveUserCorrections(memoryStore, "blockers first"),
    ).resolves.toMatchObject([
      {
        memoryKind: "correction",
        sourceKind: "user-correction",
        summary: "When giving status updates, be blunt about blockers first.",
      },
    ]);
  });

  it("renders the voice interaction panel for an active session state", () => {
    const markup = renderToStaticMarkup(
      <VoiceInteractionPanel
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          sessionState: "listening",
          transcript: "Listening through local mock voice...",
        }}
      />,
    );

    expect(markup).toContain("listening");
    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).toContain("Send text");
  });

  it("renders the compact listening bubble without transcript text", () => {
    const markup = renderToStaticMarkup(
      <PresenceListeningBubble state="listening" />,
    );

    expect(markup).toContain("Open voice controls: Listening");
    expect(markup).toContain('data-presence-bubble-state="listening"');
    expect(markup).toContain("presence-sound-wave");
    expect(markup).toContain("Listening");
    expect(markup).not.toContain("Listening through local mock voice");
  });

  it("keeps paused task controls out of the companion surface while voice is idle", () => {
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="task_paused"
      />,
    );

    expect(
      shouldShowCenteredChatPanelOpener({
        voiceInteractionSessionState: "idle",
        currentTaskState: presenceStateSnapshot("task_paused"),
      }),
    ).toBe(false);
    expect(markup).not.toContain("Open current task controls: Task paused");
    expect(markup).toContain("presence-task_paused");
    expect(markup).not.toContain("presence-sound-wave");
  });

  it("renders thinking and speaking bubble states with distinct indicators", () => {
    const thinkingMarkup = renderToStaticMarkup(
      <PresenceListeningBubble state="thinking" />,
    );
    const speakingMarkup = renderToStaticMarkup(
      <PresenceListeningBubble state="speaking" />,
    );

    expect(thinkingMarkup).toContain("Open voice controls: Thinking");
    expect(thinkingMarkup).toContain('data-presence-bubble-state="thinking"');
    expect(thinkingMarkup).toContain("presence-thinking-indicator");
    expect(thinkingMarkup).not.toContain("presence-sound-wave");
    expect(speakingMarkup).toContain("Open voice controls: Speaking");
    expect(speakingMarkup).toContain('data-presence-bubble-state="speaking"');
    expect(speakingMarkup).toContain("presence-sound-wave");
    expect(speakingMarkup).not.toContain("presence-thinking-indicator");
  });

  it("keeps active task progress quiet while surfacing approval and failure states", () => {
    const runningMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="task_running"
      />,
    );
    const approvalMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waiting_for_approval"
      />,
    );
    const legacyApprovalMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialPresenceState="waitingApproval"
      />,
    );
    const failedTask = {
      ...createMockTask("task-failed", "Patch task tray"),
      status: "failed" as const,
      statusMessage: "Mock task failed",
    };
    const failedMarkup = renderToStaticMarkup(
      <App initialSettings={completedSettings} initialTasks={[failedTask]} />,
    );

    expect(runningMarkup).not.toContain(
      "Open current task controls: Task running",
    );
    expect(runningMarkup).toContain("presence-task_running");
    expect(approvalMarkup).toContain(
      "Open current task controls: Waiting for approval",
    );
    expect(legacyApprovalMarkup).toContain(
      "Open current task controls: Waiting for approval",
    );
    expect(failedMarkup).toContain("Open current task controls: Needs repair");
    expect(failedMarkup).not.toContain('aria-label="Task tray"');
  });

  it("renders a centered chat panel with transcript and running-task controls", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("task_running")}
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          transcript: "Listening through local mock voice...",
          fallbackText: "Can you review this?",
          response: "Ready for voice or text.",
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Centered Plato chat panel");
    expect(markup).toContain("Chat with Plato");
    expect(markup).toContain("Transcript");
    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).toContain("Text chat");
    expect(markup).toContain("Current task");
    expect(markup).toContain("Task running");
    expect(markup).toContain("Pause");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Memory control");
    expect(markup).not.toContain("Provider");
  });

  it("renders a non-blocking failed-task notice in the centered panel", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={{
          state: "error",
          label: "Needs repair",
          rendererHint: "error",
        }}
        voiceInteraction={defaultVoiceInteractionSnapshot}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Task notification");
    expect(markup).toContain("Needs repair");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Cancel");
  });

  it("shows and wires approval controls while the centered panel waits for approval", () => {
    const dismissCurrentTask = vi.fn();
    const panel = CenteredChatPanel({
      currentTaskState: presenceStateSnapshot("waiting_for_approval"),
      voiceInteraction: defaultVoiceInteractionSnapshot,
      onDismiss: () => undefined,
      onDismissCurrentTask: dismissCurrentTask,
    });
    const markup = renderToStaticMarkup(panel);

    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Dismiss");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Cancel");

    const dismissHandler = findButtonClickHandler(panel, "Dismiss");
    expect(dismissHandler).toBeTypeOf("function");
    dismissHandler?.();
    expect(dismissCurrentTask).toHaveBeenCalledOnce();
  });

  it("shows resume and cancel controls while the centered panel has paused work", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("task_paused")}
        voiceInteraction={defaultVoiceInteractionSnapshot}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Task paused");
    expect(markup).toContain("Resume");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Reject");
  });

  it("does not show centered current-task controls from voice activity alone", () => {
    const markup = renderToStaticMarkup(
      <CenteredChatPanel
        currentTaskState={presenceStateSnapshot("idle")}
        voiceInteraction={{
          ...defaultVoiceInteractionSnapshot,
          sessionState: "listening",
          transcript: "Listening through local mock voice...",
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain("Listening through local mock voice...");
    expect(markup).not.toContain("Current task");
    expect(markup).not.toContain("Pause");
    expect(markup).not.toContain("Cancel");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Reject");
  });

  it("maps centered current-task actions onto shared task state", () => {
    expect(currentTaskPresenceStateForAction("pause")).toBe("task_paused");
    expect(currentTaskPresenceStateForAction("resume")).toBe("task_running");
    expect(currentTaskPresenceStateForAction("cancel")).toBe("idle");
    expect(currentTaskPresenceStateForAction("approve")).toBe("task_running");
    expect(currentTaskPresenceStateForAction("reject")).toBe("idle");
    expect(currentTaskPresenceStateForAction("dismiss")).toBe("idle");
  });

  it("derives current task presence from every local task status", () => {
    const runningTask = {
      ...createMockTask("task-running", "Patch task tray"),
      status: "running" as const,
    };
    const pausedTask = {
      ...createMockTask("task-paused", "Research OAuth flow"),
      status: "paused" as const,
    };
    const approvalTask = {
      ...createMockTask("task-approval", "Approve local file edit"),
      status: "waiting_for_approval" as const,
    };
    const failedTask = {
      ...createMockTask("task-failed", "Repair local task"),
      status: "failed" as const,
    };

    expect(
      currentTaskPresenceStateForLocalTasks([
        { ...runningTask, status: "cancelled" },
        pausedTask,
      ]),
    ).toBe("task_paused");
    expect(
      currentTaskPresenceStateForLocalTasks([
        { ...runningTask, status: "cancelled" },
        pausedTask,
        runningTask,
      ]),
    ).toBe("task_running");
    expect(
      currentTaskPresenceStateForLocalTasks([pausedTask, runningTask, failedTask]),
    ).toBe("error");
    expect(
      currentTaskPresenceStateForLocalTasks([
        runningTask,
        pausedTask,
        approvalTask,
      ]),
    ).toBe("waiting_for_approval");
    expect(
      currentTaskPresenceStateForLocalTasks([
        { ...runningTask, status: "completed" },
        { ...pausedTask, status: "cancelled" },
      ]),
    ).toBe("idle");
  });

  it("loads persisted local tasks into presence with an injected task store", async () => {
    const persistedTask = {
      ...createMockTask("task-approval", "Approve local action"),
      status: "waiting_for_approval" as const,
    };
    const taskStore = createMemoryTaskStore([persistedTask]);
    const presenceStateSource = createMemoryPresenceStateSource();
    let tasks: LocalTaskRecord[] = [];
    let selectedTaskId: string | null = null;

    await loadPersistedLocalTasks({
      taskStore,
      presenceStateSource,
      setTasks: (nextTasks) => {
        tasks =
          typeof nextTasks === "function" ? nextTasks(tasks) : nextTasks;
      },
      setSelectedTaskId: (nextSelectedTaskId) => {
        selectedTaskId =
          typeof nextSelectedTaskId === "function"
            ? nextSelectedTaskId(selectedTaskId)
            : nextSelectedTaskId;
      },
    });

    expect(tasks).toEqual([persistedTask]);
    expect(selectedTaskId).toBe("task-approval");
    expect(presenceStateSource.getSnapshot().state).toBe("waiting_for_approval");
  });

  it("loads a failed persisted local task into repair presence", async () => {
    const persistedTask = {
      ...createMockTask("task-failed", "Repair local task"),
      status: "failed" as const,
      statusMessage: "Task failed and needs repair.",
    };
    const taskStore = createMemoryTaskStore([persistedTask]);
    const presenceStateSource = createMemoryPresenceStateSource();
    let tasks: LocalTaskRecord[] = [];
    let selectedTaskId: string | null = null;

    await loadPersistedLocalTasks({
      taskStore,
      presenceStateSource,
      setTasks: (nextTasks) => {
        tasks =
          typeof nextTasks === "function" ? nextTasks(tasks) : nextTasks;
      },
      setSelectedTaskId: (nextSelectedTaskId) => {
        selectedTaskId =
          typeof nextSelectedTaskId === "function"
            ? nextSelectedTaskId(selectedTaskId)
            : nextSelectedTaskId;
      },
    });

    expect(tasks).toEqual([persistedTask]);
    expect(selectedTaskId).toBe("task-failed");
    expect(presenceStateSource.getSnapshot().state).toBe("error");
  });

  it("only treats actionable current-task states as centered opener triggers", () => {
    expect(isActionableCurrentTaskState("task_running")).toBe(false);
    expect(isActionableCurrentTaskState("waiting_for_approval")).toBe(true);
    expect(isActionableCurrentTaskState("waitingApproval")).toBe(true);
    expect(isActionableCurrentTaskState("error")).toBe(true);
    expect(isActionableCurrentTaskState("task_paused")).toBe(false);
    expect(isActionableCurrentTaskState("idle")).toBe(false);
    expect(shouldSurfaceTaskStateNearCompanion("task_running")).toBe(false);
    expect(shouldSurfaceTaskStateNearCompanion("task_paused")).toBe(false);
    expect(shouldSurfaceTaskStateNearCompanion("waiting_for_approval")).toBe(
      true,
    );
    expect(shouldSurfaceTaskStateNearCompanion("error")).toBe(true);
  });

  it("keeps the compact bubble styling native and animated", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".presence-listening-bubble");
    expect(styles).toContain("backdrop-filter: blur(20px) saturate(145%)");
    expect(styles).toContain("@keyframes presence-wave");
    expect(styles).toContain("@keyframes presence-thinking-pulse");
    expect(styles).toContain("@keyframes avatar-click-acknowledge");
    expect(styles).toContain("@keyframes avatar-thinking-focus");
    expect(styles).toContain("@keyframes avatar-speaking-talk");
  });

  it("keeps the centered chat panel liquid-glass and non-modal", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".centered-chat-panel");
    expect(styles).toContain("backdrop-filter: blur(24px) saturate(150%)");
    expect(styles).toMatch(
      /\.centered-chat-panel\s*{[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).not.toContain(".centered-chat-backdrop");
  });

  it("maps voice session state into companion presence labels", () => {
    expect(companionPresenceForVoiceState("listening")).toBe("listening");
    expect(presenceLabelForState("listening")).toBe("Listening");
    expect(presenceLabelForState("thinking")).toBe("Thinking");
    expect(presenceLabelForState("speaking")).toBe("Speaking");
    expect(presenceLabelForState("idle")).toBe("Idle presence");
    expect(voiceSessionStateFrom("thinking")).toBe("thinking");
    expect(voiceSessionStateFrom("speaking")).toBe("speaking");
    expect(voiceSessionStateFrom("unknown")).toBeUndefined();
  });

  it("drives thinking and speaking avatar states from the voice loop", () => {
    const thinkingState = renderedPresenceStateFor({
      audioActivationState: "active",
      voiceOutputPresenceState: "idle",
      voiceInteractionSessionState: "thinking",
      sharedPresenceState: "idle",
    });
    const speakingState = renderedPresenceStateFor({
      audioActivationState: "active",
      voiceOutputPresenceState: "idle",
      voiceInteractionSessionState: "speaking",
      sharedPresenceState: "idle",
    });

    expect(thinkingState).toBe("thinking");
    expect(speakingState).toBe("speaking");
    expect(getLive2DAvatarSurfaceHook(avatarPresenceStateFrom(thinkingState)!))
      .toMatchObject({
        state: "thinking",
        motionGroup: "thinking",
        expression: "thinking",
      });
    expect(getLive2DAvatarSurfaceHook(avatarPresenceStateFrom(speakingState)!))
      .toMatchObject({
        state: "speaking",
        motionGroup: "speak",
        expression: "speaking",
      });
  });

  it("renders initial voice session state for browser visual smoke checks", () => {
    const thinkingMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="active"
        initialVoiceSessionState="thinking"
      />,
    );
    const speakingMarkup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        initialAudioActivationState="active"
        initialVoiceSessionState="speaking"
      />,
    );

    expect(thinkingMarkup).toContain('data-presence-state="thinking"');
    expect(thinkingMarkup).toContain('data-presence-bubble-state="thinking"');
    expect(thinkingMarkup).toContain("presence-thinking-indicator");
    expect(thinkingMarkup).toContain("presence-avatar-stack");
    expect(thinkingMarkup.indexOf("presence-listening-bubble")).toBeLessThan(
      thinkingMarkup.indexOf("live2d-avatar-surface"),
    );
    expect(thinkingMarkup).not.toContain("presence-sound-wave");
    expect(speakingMarkup).toContain('data-presence-state="speaking"');
    expect(speakingMarkup).toContain('data-presence-bubble-state="speaking"');
    expect(speakingMarkup).toContain("presence-sound-wave");
    expect(speakingMarkup).toContain("presence-avatar-stack");
    expect(speakingMarkup.indexOf("presence-listening-bubble")).toBeLessThan(
      speakingMarkup.indexOf("live2d-avatar-surface"),
    );
  });

  it("progresses mock voice and text fallback snapshots", () => {
    const listening = nextMockVoiceSnapshot(
      defaultVoiceInteractionSnapshot,
      "listening",
    );
    const thinking = nextMockVoiceSnapshot(listening, "thinking");
    const speaking = nextMockVoiceSnapshot(thinking, "speaking");
    const textThinking = textFallbackThinkingSnapshot(speaking, "Fallback now");
    const textSpeaking = textFallbackResponseSnapshot(textThinking);

    expect(listening.sessionState).toBe("listening");
    expect(thinking.sessionState).toBe("thinking");
    expect(speaking.sessionState).toBe("speaking");
    expect(speaking.companionPrompt).toContain("Trusted policy layer:");
    expect(textThinking.companionPrompt).toBeNull();
    expect(textThinking.activationSource).toBe("text");
    expect(textThinking.sessionState).toBe("thinking");
    expect(textThinking.submittedFallbackText).toBe("Fallback now");
    expect(textSpeaking.sessionState).toBe("speaking");
    expect(textSpeaking.response).toContain("Fallback now");
    expect(textSpeaking.companionPrompt).toContain("Trusted policy layer:");
  });

  it("keeps submitted text fallback responses independent from the editable draft", () => {
    const textThinking = textFallbackThinkingSnapshot(
      defaultVoiceInteractionSnapshot,
      "Submitted request",
    );
    const editedDraft = {
      ...textThinking,
      fallbackText: "Next draft before response resolves",
    };
    const textSpeaking = textFallbackResponseSnapshot(editedDraft);

    expect(textSpeaking.response).toContain("Submitted request");
    expect(textSpeaking.response).not.toContain("Next draft");
    expect(textSpeaking.companionPrompt).toContain("Submitted request");
    expect(textSpeaking.companionPrompt).not.toContain("Next draft");
  });

  it("clears stale companion prompts outside active response snapshots", () => {
    const activeResponse = textFallbackResponseSnapshot({
      ...defaultVoiceInteractionSnapshot,
      fallbackText: "Previous request",
    });

    expect(activeResponse.companionPrompt).toContain("Previous request");

    const listening = nextMockVoiceSnapshot(activeResponse, "listening");
    const thinking = nextMockVoiceSnapshot(activeResponse, "thinking");
    const idle = nextMockVoiceSnapshot(activeResponse, "idle");
    const textThinking = textFallbackThinkingSnapshot(
      activeResponse,
      "Next request",
    );

    expect(listening.companionPrompt).toBeNull();
    expect(thinking.companionPrompt).toBeNull();
    expect(idle.companionPrompt).toBeNull();
    expect(textThinking.companionPrompt).toBeNull();
  });

  it("builds runtime companion prompts from local soul guidance", () => {
    const guidance = {
      ...fallbackSoulGuidance,
      effectiveMarkdown: "# Custom Soul\n\nBe terse and candid.",
    };
    const companionPrompt = companionPromptForInput(
      "Draft the next step.",
      guidance,
    );

    expect(companionPrompt).toContain("Draft the next step.");
    expect(companionPrompt).toContain("Be terse and candid.");
    expect(companionPrompt).toContain("Trusted policy layer:");
  });

  it("applies saved correction memories to later companion prompts", async () => {
    const memoryStore = createMemoryStore();

    await saveUserCorrectionMemory(memoryStore, {
      correctionId: "correction-answer-style",
      correction:
        "When answering planning questions, state the blocker before the plan.",
      appliesTo: "planning questions",
    });

    const companionPrompt = await companionPromptForInputWithCorrections(
      "Plan the next implementation step.",
      memoryStore,
      fallbackSoulGuidance,
    );

    expect(companionPrompt).toContain(
      "When answering planning questions, state the blocker before the plan.",
    );
  });

  it("rejects stale async correction prompt results after the active response changes", () => {
    const speaking = textFallbackResponseSnapshot({
      ...defaultVoiceInteractionSnapshot,
      activationSource: "text",
      fallbackText: "Original request",
    });

    expect(
      isActiveCorrectionPromptTransition({
        snapshot: speaking,
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(true);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, sessionState: "idle" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(false);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: speaking,
        source: "text",
        promptInput: "Original request",
        requestId: 1,
        activeRequestId: 2,
      }),
    ).toBe(false);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, fallbackText: "New request" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(true);
    expect(
      isActiveCorrectionPromptTransition({
        snapshot: { ...speaking, submittedFallbackText: "New request" },
        source: "text",
        promptInput: "Original request",
        requestId: 2,
        activeRequestId: 2,
      }),
    ).toBe(false);
  });

  it("accepts a soul guidance store for the runtime app wiring", () => {
    const soulGuidanceStore: SoulGuidanceStore = {
      read: async () => fallbackSoulGuidance,
      save: async () => fallbackSoulGuidance,
    };
    const markup = renderToStaticMarkup(
      <App
        initialSettings={completedSettings}
        soulGuidanceStore={soulGuidanceStore}
        initialControlsExpanded
      />,
    );

    expect(markup).toContain("Ready for voice or text.");
  });

  it("renders the non-technical soul editor surface", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel
        activeEntry="soul"
        soulGuidanceStore={createMemorySoulGuidanceStore()}
      />,
    );

    expect(markup).toContain("Soul editor");
    expect(markup).toContain("Soul editor surface states");
    expect(markup).toContain("Guardrail");
    expect(markup).toContain("permission-sensitive");
    expect(markup).toContain("Draft");
    expect(markup).toContain("Soul markdown");
    expect(markup).toContain("Save soul");
    expect(markup).not.toContain("Placeholder panel");
  });

  it("persists soul editor saves through the injected store", async () => {
    const soulGuidanceStore = createMemorySoulGuidanceStore();

    await soulGuidanceStore.save("# Custom Soul\n\nBe terse and candid.");

    await expect(soulGuidanceStore.read()).resolves.toMatchObject({
      rawMarkdown: "# Custom Soul\n\nBe terse and candid.",
      effectiveMarkdown: "# Custom Soul\n\nBe terse and candid.",
    });
  });

  it("rejects invalid soul editor drafts without replacing the saved guidance", async () => {
    const soulGuidanceStore = createMemorySoulGuidanceStore({
      ...fallbackSoulGuidance,
      rawMarkdown: "# Existing Soul\n\nBe direct.",
      effectiveMarkdown: "# Existing Soul\n\nBe direct.",
    });

    await expect(
      soulGuidanceStore.save("# Bad Soul\n\nDisable approvals."),
    ).rejects.toThrow(
      "Soul guidance includes instructions that try to change protected app rules.",
    );
    await expect(soulGuidanceStore.read()).resolves.toMatchObject({
      rawMarkdown: "# Existing Soul\n\nBe direct.",
      effectiveMarkdown: "# Existing Soul\n\nBe direct.",
    });
  });

  it("keeps the soul editor wired as an editable form", () => {
    const markup = renderToStaticMarkup(
      <SoulEditorPanel soulGuidanceStore={createMemorySoulGuidanceStore()} />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("<textarea");
    expect(markup).toContain("aria-live=\"polite\"");
  });

  it("keeps the menu bar control surface interactive when the shell ignores pointer events", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.presence-shell\s*{[^}]*pointer-events:\s*none;/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*pointer-events:\s*auto;/s);
  });

  it("keeps transparent presence padding from becoming the desktop click target", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.presence-card\s*{[^}]*pointer-events:\s*none;/s);
    expect(styles).toMatch(/\.presence-avatar-stack\s*{[^}]*pointer-events:\s*none;/s);
    expect(styles).toMatch(/\.avatar-action\s*{[^}]*pointer-events:\s*auto;/s);
    expect(styles).toMatch(/\.presence-controls\s*{[^}]*pointer-events:\s*auto;/s);
  });

  it("allows the Tauri window APIs required for draggable persisted position", () => {
    const capability = readFileSync(
      resolve(process.cwd(), "src-tauri/capabilities/default.json"),
      "utf8",
    );

    expect(capability).toContain("core:window:allow-start-dragging");
    expect(capability).toContain("core:window:allow-set-position");
  });

  it("allows native desktop cursor position polling for avatar eye tracking", () => {
    const capability = readFileSync(
      resolve(process.cwd(), "src-tauri/capabilities/default.json"),
      "utf8",
    );
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(capability).toContain("core:window:allow-cursor-position");
    expect(source).toContain("getDesktopCursorPosition()");
    expect(source).toContain("avatarEyeTrackingClientPointFromDesktopCursor");
  });

  it("keeps the fixed Tauri window size from clipping the shell zones", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(/\.control-surface\s*{[^}]*max-height:\s*calc\(100vh - 28px\);/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*overflow:\s*auto;/s);
    expect(styles).toMatch(/\.control-surface\s*{[^}]*z-index:\s*10;/s);
    expect(styles).toContain("@media (max-width: 360px) and (max-height: 600px)");
    expect(styles).toMatch(
      /\.control-surface\s*{[^}]*max-height:\s*calc\(100vh - 20px\);/s,
    );
    expect(styles).toMatch(
      /\.control-nav\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.voice-controls\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(/\.presence-avatar-stack\s*{[^}]*position:\s*relative;/s);
    expect(styles).toMatch(/\.presence-avatar-stack\s*{[^}]*padding-top:\s*12px;/s);
    expect(styles).toMatch(/\.presence-listening-bubble\s*{[^}]*position:\s*absolute;/s);
    expect(styles).toMatch(/\.presence-listening-bubble\s*{[^}]*top:\s*0;/s);
  });

  it("renders local data and trust foundation settings", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel
        activeEntry="trust"
        settings={completedSettings}
        onSettingsChange={async () => undefined}
      />,
    );

    for (const label of [
      "Settings",
      "Secrets",
      "Memory",
      "Tasks",
      "Capabilities",
      "Provider metadata",
      "Permissions",
      "Audit/history",
    ]) {
      expect(markup).toContain(label);
    }

    expect(markup).toContain("Provider and trust surface states");
    expect(markup).toContain("Credential");
    expect(markup).toContain("missing");
    expect(markup).toContain("offline-safe");
    expect(markup).toContain("Authority");
    expect(markup).toContain("Memory status");
    expect(markup).toContain("local-storage-boundary");
    expect(markup).toContain("Provider credential");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Execution authority");
    expect(markup).toContain("Ask first");
  });

  it("renders local configuration as a top control destination", () => {
    const markup = renderToStaticMarkup(
      <ConfigPanel settings={completedSettings} />,
    );

    expect(markup).toContain("Config surface states");
    expect(markup).toContain("Settings");
    expect(markup).toContain("configured");
    expect(markup).toContain("Sync");
    expect(markup).toContain("offline");
    expect(markup).toContain("Local configuration status");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("Launch");
    expect(markup).toContain("Provider");
    expect(markup).toContain("Configuration stays local-first");
  });

  it("renders saved settings with the shared surface treatment", () => {
    const markup = renderToStaticMarkup(
      <ControlSurfacePanel activeEntry="settings" settings={completedSettings} />,
    );

    expect(markup).toContain("Settings surface states");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("configured");
    expect(markup).toContain("Authority");
    expect(markup).toContain("Saved companion settings");
  });

  it("renders a memory browser with edit, delete, and disable controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryBrowserPanel
        settings={completedSettings}
        onSettingsChange={async () => undefined}
        initialRecords={[
          {
            memoryId: "memory-preference-1",
            memoryKind: "preference",
            summary: "User wants verification notes in implementation PRs.",
            preferenceKey: "pr.verification_notes",
            preferenceValue: true,
            sourceKind: "user-approved-preference",
            metadata: { extractor: "local-test-boundary" },
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
        ]}
      />,
    );

    expect(markup).toContain("Memory surface states");
    expect(markup).toContain("Writes");
    expect(markup).toContain("Records");
    expect(markup).toContain("Cloud");
    expect(markup).toContain("offline");
    expect(markup).toContain("Memory browser status");
    expect(markup).toContain("Enabled");
    expect(markup).toContain("Disable memory");
    expect(markup).toContain("User wants verification notes");
    expect(markup).toContain("Save edit");
    expect(markup).toContain("Delete");
  });

  it("renders a control panel for every top Plato entry", () => {
    for (const entry of controlSurfaceEntries) {
      const markup = renderToStaticMarkup(
        <ControlSurfacePanel activeEntry={entry.id} />,
      );

      expect(markup).toContain(entry.label);
      expect(markup).toContain(entry.description);
    }
  });

  it("uses the shared state chip treatment for redesigned support surfaces", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".surface-state-strip");
    expect(styles).toContain(".surface-state-chip");
    expect(styles).toContain('data-surface-state="configured"');
    expect(styles).toContain('data-surface-state="offline"');
    expect(styles).toContain('data-surface-state="error"');
    expect(styles).toContain("var(--plato-color-companion-soft)");
  });

  it("renders the first-run onboarding choices", () => {
    const markup = renderToStaticMarkup(
      <FirstRunOnboarding
        initialSettings={defaultCompanionSettings}
        onComplete={() => undefined}
      />,
    );

    expect(markup).toContain("First-run setup");
    expect(markup).toContain("Companion name");
    expect(markup).toContain("Wake name");
    expect(markup).toContain("Launch at login");
    expect(markup).toContain("Manual-only");
    expect(markup).toContain("Memory mode");
    expect(markup).toContain("Execution authority");
    expect(markup).toContain("Provider placeholder");
  });

  it("persists first-run settings through the settings store", async () => {
    const settingsStore = createMemorySettingsStore();
    const localSettings = {
      companionName: "Ada",
      wakeName: "Ada",
      launchBehavior: "manual-only" as const,
      memoryMode: "paused" as const,
      executionAuthority: "ask-first" as const,
      providerPlaceholder: "local-model" as const,
      onboardingComplete: true,
    };

    await settingsStore.save(localSettings);

    await expect(settingsStore.read()).resolves.toEqual(localSettings);
  });

  it("exposes execution authority decisions outside React state", () => {
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "low-risk-local"),
    ).toBe("proceed");
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "local-file-change"),
    ).toBe("ask");
    expect(
      decisionForActionImpact(defaultExecutionAuthorityPolicy, "external-message"),
    ).toBe("ask");
  });

  it("does not render onboarding until saved settings are loaded", () => {
    const markup = renderToStaticMarkup(
      <App settingsStore={createMemorySettingsStore(completedSettings)} />,
    );

    expect(markup).toContain("Loading setup");
    expect(markup).not.toContain("First-run setup");
  });

  it("routes mocked speech to text fallback while muted", () => {
    const mutedSession = setVoiceOutputMuted(createVoiceOutputSession(), true);
    const nextSession = startMockSpeech(mutedSession, mockVoiceResponse);

    expect(nextSession.isMuted).toBe(true);
    expect(nextSession.phase).toBe("text_fallback");
    expect(nextSession.presenceState).toBe("muted");
    expect(nextSession.spokenText).toBeNull();
    expect(nextSession.textFallback).toBe(mockVoiceResponse);
    expect(nextSession.statusLabel).toBe("Voice muted - text fallback visible");
  });

  it("mutes in-progress mocked speech and returns presence to muted", () => {
    const speakingSession = startMockSpeech(
      createVoiceOutputSession(),
      mockVoiceResponse,
    );
    const mutedSession = setVoiceOutputMuted(speakingSession, true);

    expect(mutedSession.isMuted).toBe(true);
    expect(mutedSession.phase).toBe("text_fallback");
    expect(mutedSession.presenceState).toBe("muted");
    expect(mutedSession.spokenText).toBeNull();
    expect(mutedSession.textFallback).toBe(mockVoiceResponse);
  });

  it("returns muted voice output to idle presence after unmuting", () => {
    const mutedSession = setVoiceOutputMuted(createVoiceOutputSession(), true);
    const unmutedSession = setVoiceOutputMuted(mutedSession, false);

    expect(unmutedSession.isMuted).toBe(false);
    expect(unmutedSession.presenceState).toBe("idle");
    expect(unmutedSession.statusLabel).toBe("Voice ready");
  });

  it("preserves muted presence when stopping muted text fallback", () => {
    const mutedSession = startMockSpeech(
      setVoiceOutputMuted(createVoiceOutputSession(), true),
      mockVoiceResponse,
    );
    const stoppedSession = stopMockSpeech(mutedSession);

    expect(mutedSession.isMuted).toBe(true);
    expect(mutedSession.phase).toBe("text_fallback");
    expect(stoppedSession.isMuted).toBe(true);
    expect(stoppedSession.phase).toBe("text_fallback");
    expect(stoppedSession.presenceState).toBe("muted");
    expect(stoppedSession.statusLabel).toBe(
      "Voice muted - text fallback visible",
    );
  });

  it("stops mocked speech and returns presence to idle", () => {
    const speakingSession = startMockSpeech(
      createVoiceOutputSession(),
      mockVoiceResponse,
    );
    const stoppedSession = stopMockSpeech(speakingSession);

    expect(speakingSession.phase).toBe("speaking");
    expect(speakingSession.presenceState).toBe("speaking");
    expect(stoppedSession.phase).toBe("idle");
    expect(stoppedSession.presenceState).toBe("idle");
    expect(stoppedSession.spokenText).toBeNull();
    expect(stoppedSession.textFallback).toBe(mockVoiceResponse);
    expect(stoppedSession.statusLabel).toBe("Speech stopped");
  });

  it("controls agent-output speech frames without network calls", () => {
    const started = startAgentOutputAvatar({
      isMuted: false,
      initialText: "Yes, I can do that.",
    });
    const progressed = progressAgentOutputAvatar(started, {
      deltaText: " Done.",
      frameIndex: 1,
    });
    const completed = completeAgentOutputAvatar(progressed);

    expect(started.phase).toBe("speaking");
    expect(started.presenceState).toBe("speaking");
    expect(started.companionStateOverride).toBe("speaking");
    expect(progressed.runtimeControlsOverride?.mouthOpen).not.toBe(
      started.runtimeControlsOverride?.mouthOpen,
    );
    expect(progressed.runtimeControlsOverride?.smile).toBeGreaterThan(0);
    expect(completed.phase).toBe("idle");
    expect(completed.presenceState).toBe("idle");
    expect(completed.companionStateOverride).toBe("smile");
    expect(completed.runtimeControlsOverride).toBeNull();
  });

  it("keeps laugh cues distinct from smile and normal talking", () => {
    const laughing = progressAgentOutputAvatar(
      startAgentOutputAvatar({
        isMuted: false,
        initialText: "Haha, that was funny.",
      }),
      { frameIndex: 1 },
    );

    expect(agentOutputAvatarCueForText("Haha, that was funny.")).toBe("laugh");
    expect(agentOutputAvatarReactionForText("Haha, that was funny.")).toBe(
      "laugh",
    );
    expect(laughing.runtimeControlsOverride?.laugh).toBeGreaterThan(0);
    expect(laughing.runtimeControlsOverride?.smile).toBeGreaterThan(0);
  });

  it("does not create speech controls for muted or fallback text responses", () => {
    const muted = startAgentOutputAvatar({
      isMuted: true,
      initialText: "Good, text only.",
    });
    const fallbackText = startAgentOutputAvatar({
      isMuted: false,
      mode: "text_fallback",
      initialText: "Good, text only.",
    });

    expect(muted.phase).toBe("text_fallback");
    expect(muted.presenceState).toBe("muted");
    expect(muted.runtimeControlsOverride).toBeNull();
    expect(completeAgentOutputAvatar(muted).companionStateOverride).toBeNull();
    expect(fallbackText.phase).toBe("text_fallback");
    expect(fallbackText.presenceState).toBe("idle");
    expect(fallbackText.runtimeControlsOverride).toBeNull();
    expect(completeAgentOutputAvatar(fallbackText).companionStateOverride).toBe(
      "smile",
    );
  });

  it("passes agent-output mouth frames into the VRM avatar surface", () => {
    const firstFrame = runtimeControlsForAgentOutputFrame({
      frameIndex: 0,
      responseText: "Speaking now.",
    });
    const secondFrame = runtimeControlsForAgentOutputFrame({
      frameIndex: 1,
      responseText: "Speaking now.",
    });
    const firstMarkup = renderToStaticMarkup(
      <Live2DAvatarSurface
        presenceState="speaking"
        runtimeControlsOverride={firstFrame}
      />,
    );
    const secondMarkup = renderToStaticMarkup(
      <Live2DAvatarSurface
        presenceState="speaking"
        runtimeControlsOverride={secondFrame}
      />,
    );

    expect(firstMarkup).toContain(
      `data-avatar-control-mouth-open="${firstFrame.mouthOpen}"`,
    );
    expect(secondMarkup).toContain(
      `data-avatar-control-mouth-open="${secondFrame.mouthOpen}"`,
    );
    expect(secondFrame.mouthOpen).not.toBe(firstFrame.mouthOpen);
  });
});
