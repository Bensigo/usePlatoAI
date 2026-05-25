import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { VRM } from "@pixiv/three-vrm";
import type * as ThreeNamespace from "three";
import type {
  GLTF,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";

export const avatarCompanionStates = [
  "startup",
  "idle",
  "greeting",
  "listening",
  "thinking",
  "speaking",
  "smile",
  "laugh",
  "sad",
  "error",
  "celebrating",
] as const;

export type AvatarCompanionState = (typeof avatarCompanionStates)[number];

export const avatarExpressionStates = avatarCompanionStates;

export type AvatarExpressionState = (typeof avatarExpressionStates)[number];

export const avatarAnimationCommands = [
  "expression.startup",
  "expression.idle",
  "expression.greeting",
  "expression.listening",
  "expression.thinking",
  "expression.speaking",
  "expression.smile",
  "expression.laugh",
  "expression.sad",
  "expression.error",
  "expression.celebrating",
] as const;

export type AvatarAnimationCommand = (typeof avatarAnimationCommands)[number];

export const avatarTestAnimationCommands = [
  "greeting",
  "happy",
  "smile",
  "laugh",
  "sad",
  "error",
  "thinking",
  "talking",
  "speaking",
  "dance",
  "celebration",
] as const;

export type AvatarTestAnimationCommand =
  (typeof avatarTestAnimationCommands)[number];

export const avatarPresenceStates = [
  "appearing",
  "idle",
  "listening",
  "thinking",
  "speaking",
  "waitingApproval",
  "muted",
  "error",
] as const;

export type AvatarPresenceState = (typeof avatarPresenceStates)[number];

export type AvatarRendererKind = "three-vrm";
export type AvatarFallbackReason = "missing-vrm-asset" | "unsupported-webgl";
export type VrmRuntimeState = "loading" | "ready" | "failed";

export type AvatarEyeDirection = {
  x: number;
  y: number;
};

export type AvatarEyeTrackingBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AvatarEyeTrackingCursor = {
  cursorX: number;
  cursorY: number;
  avatarBounds: AvatarEyeTrackingBounds;
};

export const avatarEyeDirectionNeutral = {
  x: 0,
  y: 0,
} as const satisfies AvatarEyeDirection;

const avatarEyeDirectionPrecision = 1_000;

function clampAvatarEyeAxis(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function roundAvatarEyeAxis(value: number) {
  return (
    Math.round(clampAvatarEyeAxis(value) * avatarEyeDirectionPrecision) /
    avatarEyeDirectionPrecision
  );
}

function roundAvatarEyeCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return (
    Math.round(value * avatarEyeDirectionPrecision) /
    avatarEyeDirectionPrecision
  );
}

export const avatarVrmEyeGazeCalibration = {
  controlSource: "vrm-look-at-target",
  backedBy: ["VRM lookAt target", "leftEye bone", "rightEye bone"],
  targetNeutral: {
    x: 0,
    y: 1.24,
    z: 4.97,
  },
  targetRange: {
    x: 0.45,
    y: 0.26,
  },
} as const;

export function avatarEyeDirectionToVrmLookAtTarget(
  direction: AvatarEyeDirection = avatarEyeDirectionNeutral,
) {
  const eyeX = roundAvatarEyeAxis(direction.x);
  const eyeY = roundAvatarEyeAxis(direction.y);

  return {
    x: roundAvatarEyeCoordinate(
      avatarVrmEyeGazeCalibration.targetNeutral.x +
        eyeX * avatarVrmEyeGazeCalibration.targetRange.x,
    ),
    y: roundAvatarEyeCoordinate(
      avatarVrmEyeGazeCalibration.targetNeutral.y -
        eyeY * avatarVrmEyeGazeCalibration.targetRange.y,
    ),
    z: avatarVrmEyeGazeCalibration.targetNeutral.z,
  };
}

export type AvatarVrmLoadCapabilityStatus =
  | "ready"
  | "missing-vrm"
  | "missing-look-at";

type AvatarVrmLookAtCapability = Pick<VRM, "lookAt">;
type AvatarVrmRuntimeLoadCandidate = Pick<VRM, "lookAt" | "scene">;
export type AvatarVrmRuntimeLoadFailureStatus = Exclude<
  AvatarVrmLoadCapabilityStatus,
  "ready"
>;

export function avatarVrmLoadCapabilityStatus(
  vrm: AvatarVrmLookAtCapability | null | undefined,
): AvatarVrmLoadCapabilityStatus {
  if (!vrm) {
    return "missing-vrm";
  }

  if (!vrm.lookAt) {
    return "missing-look-at";
  }

  return "ready";
}

function avatarVrmSupportsLookAt(
  vrm: AvatarVrmLookAtCapability | null | undefined,
): vrm is AvatarVrmLookAtCapability & {
  lookAt: NonNullable<VRM["lookAt"]>;
} {
  return avatarVrmLoadCapabilityStatus(vrm) === "ready";
}

export function avatarHandleVrmRuntimeLoad<
  TVrm extends AvatarVrmRuntimeLoadCandidate,
>({
  vrm,
  disposeScene,
  onReady,
  onFailed,
}: {
  vrm: TVrm | null | undefined;
  disposeScene: (scene: ThreeNamespace.Object3D) => void;
  onReady: (vrm: TVrm & { lookAt: NonNullable<VRM["lookAt"]> }) => void;
  onFailed: (status: AvatarVrmRuntimeLoadFailureStatus) => void;
}): AvatarVrmLoadCapabilityStatus {
  const status = avatarVrmLoadCapabilityStatus(vrm);

  if (status !== "ready") {
    if (vrm) {
      disposeScene(vrm.scene);
    }
    onFailed(status);
    return status;
  }

  onReady(vrm as TVrm & { lookAt: NonNullable<VRM["lookAt"]> });

  return status;
}

export function avatarEyeDirectionFromCursor({
  cursorX,
  cursorY,
  avatarBounds,
}: AvatarEyeTrackingCursor): AvatarEyeDirection {
  if (avatarBounds.width <= 0 || avatarBounds.height <= 0) {
    return avatarEyeDirectionNeutral;
  }

  const eyeCenterX = avatarBounds.left + avatarBounds.width / 2;
  const eyeCenterY = avatarBounds.top + avatarBounds.height * 0.42;
  const horizontalReach = Math.max(avatarBounds.width * 0.74, 1);
  const verticalReach = Math.max(avatarBounds.height * 0.58, 1);

  return {
    x: roundAvatarEyeAxis((cursorX - eyeCenterX) / horizontalReach),
    y: roundAvatarEyeAxis((cursorY - eyeCenterY) / verticalReach),
  };
}

export function avatarEyeDirectionStyle(
  direction: AvatarEyeDirection = avatarEyeDirectionNeutral,
): CSSProperties {
  return {
    "--plato-avatar-eye-x": direction.x,
    "--plato-avatar-eye-y": direction.y,
  } as CSSProperties;
}

export type AvatarPackageAsset = {
  packagePath: string;
  publicPath: string;
};

export const avatarPackageAssets = {
  vrm: {
    packagePath: "packages/avatar/assets/vrm/plato.vrm",
    publicPath: "/avatar/plato/vrm/plato.vrm",
  },
  startupSound: {
    packagePath: "packages/avatar/assets/audio/plato-startup-chime.wav",
    publicPath: "/avatar/plato/audio/plato-startup-chime.wav",
  },
} as const satisfies Record<string, AvatarPackageAsset>;

export const vroidAvatarSource = {
  title: "plato",
  sourceFile: "/Users/macbook/Downloads/plato.vrm",
  visualReference: "/Users/macbook/Downloads/plato-vroid-front.png",
  localAsset: avatarPackageAssets.vrm.packagePath,
  publicRuntimeCopy: avatarPackageAssets.vrm.publicPath,
  sourceTool: "VRoid Studio 2.12.0",
  format: "VRM 1.0 / glTF binary",
  author: "Bensigo",
  exportedForIssue: 317,
  license: {
    name: "VRM Public License 1.0 metadata",
    url: "https://vrm.dev/licenses/1.0/",
    avatarPermission: "everyone",
    commercialUsage: "personalProfit",
    allowRedistribution: true,
    modification: "allowModification",
    creditNotation: "unnecessary",
  },
  usageNotes:
    "Production-intent VRoid VRM selected by the operator for Plato's Three.js desktop companion avatar.",
} as const;

export const avatarStartupSound = {
  id: "plato-startup-chime",
  packagePath: avatarPackageAssets.startupSound.packagePath,
  publicPath: avatarPackageAssets.startupSound.publicPath,
  playback: "app-launch-or-activation",
  durationMs: 960,
  format: "audio/wav",
  source: "generated-useplatoai",
} as const;

export const vendoredVrmAssetContract = {
  loader: "@pixiv/three-vrm",
  renderer: "three",
  asset: avatarPackageAssets.vrm,
  transparentCanvas: true,
  framing: {
    subject: "full-body",
    viewportFill: "most-of-height",
    cameraPosition: [0, 0.82, 5.25],
    cameraLookAt: [0, 0.7, 0],
    modelPosition: [0, -0.72, 0],
    modelScale: 1.02,
    fieldOfViewDegrees: 32,
  },
  runtimeControls: {
    eyeX: {
      backedBy: avatarVrmEyeGazeCalibration.backedBy,
      missing: false,
    },
    eyeY: {
      backedBy: avatarVrmEyeGazeCalibration.backedBy,
      missing: false,
    },
    blink: {
      backedBy: ["VRM expression: blink"],
      missing: false,
    },
    mouthOpen: {
      backedBy: ["VRM expressions: aa, ih, ou, ee, oh"],
      missing: false,
    },
    smile: {
      backedBy: ["VRM expression: happy", "morph target: Fcl_ALL_Joy"],
      missing: false,
    },
    laugh: {
      backedBy: [
        "VRM expression: relaxed",
        "VRM expression: happy",
        "VRM expression: aa",
      ],
      missing: false,
      note: "The VRM has no explicit laugh animation; laugh is mapped to real happy/relaxed/mouth expressions.",
    },
    wave: {
      backedBy: [
        "humanoid bone: rightShoulder",
        "humanoid bone: rightUpperArm",
        "humanoid bone: rightLowerArm",
        "humanoid bone: rightHand",
      ],
      missing: false,
      note: "The VRM has no bundled animations; wave is authored through real humanoid arm bone transforms.",
    },
    sad: {
      backedBy: ["VRM expression: sad", "morph target: Fcl_MTH_Sorrow"],
      missing: false,
    },
    headPitch: {
      backedBy: ["humanoid bone: neck", "humanoid bone: head"],
      missing: false,
    },
    headYaw: {
      backedBy: ["humanoid bone: neck", "humanoid bone: head"],
      missing: false,
    },
    headRoll: {
      backedBy: ["humanoid bone: neck", "humanoid bone: head"],
      missing: false,
    },
  },
} as const;

export const avatarNeutralHumanoidBonePose = {
  leftUpperArm: { x: 0, y: 0, z: -1.18 },
  leftLowerArm: { x: 0, y: 0, z: -0.18 },
  leftHand: { x: 0, y: 0, z: -0.06 },
  rightUpperArm: { x: 0, y: 0, z: 1.18 },
  rightLowerArm: { x: 0, y: 0, z: 0.18 },
  rightHand: { x: 0, y: 0, z: 0.06 },
} as const;

export const avatarHelloWaveHumanoidBoneMotion = {
  oscillationRadiansPerSecond: 8.8,
  rightUpperArm: {
    raiseZ: 1.82,
    forwardX: 0.44,
    swayX: 0.12,
  },
  rightLowerArm: {
    bendZ: 1.18,
    bendX: 0.18,
    palmTwistY: -1.15,
    swayY: 0.54,
  },
  rightHand: {
    swayY: 0.16,
    swayZ: 0.18,
  },
} as const;

export const vrmCapabilityInventory = {
  fileName: "plato.vrm",
  fileSizeBytes: 17_565_172,
  generator: "VRoid Studio-2.12.0",
  format: "VRM 1.0 / glTF binary",
  extensionsUsed: [
    "KHR_texture_transform",
    "KHR_materials_unlit",
    "VRMC_vrm",
    "VRMC_springBone",
    "VRMC_materials_mtoon",
  ],
  expressions: [
    "happy",
    "angry",
    "sad",
    "relaxed",
    "surprised",
    "aa",
    "ih",
    "ou",
    "ee",
    "oh",
    "blink",
    "blinkLeft",
    "blinkRight",
    "neutral",
  ],
  mouthMorphTargets: [
    "Fcl_MTH_Close",
    "Fcl_MTH_Up",
    "Fcl_MTH_Down",
    "Fcl_MTH_Angry",
    "Fcl_MTH_Small",
    "Fcl_MTH_Large",
    "Fcl_MTH_Neutral",
    "Fcl_MTH_Fun",
    "Fcl_MTH_Joy",
    "Fcl_MTH_Sorrow",
    "Fcl_MTH_Surprised",
    "Fcl_MTH_A",
    "Fcl_MTH_I",
    "Fcl_MTH_U",
    "Fcl_MTH_E",
    "Fcl_MTH_O",
  ],
  humanoidBoneCount: 54,
  eyeAndHeadControls: ["neck", "head", "leftEye", "rightEye"],
  armGestureControls: [
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightShoulder",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
  ],
  bundledAnimations: [],
} as const;

export type AvatarRuntimeControls = {
  eyeX: number;
  eyeY: number;
  blink: number;
  mouthOpen: number;
  smile: number;
  laugh: number;
  wave: number;
  sad: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
};

export type AvatarRuntimeControlsOverride = Partial<AvatarRuntimeControls>;

export type AvatarSpeechCue = "neutral" | "smile" | "laugh";

const avatarRuntimeControlsNeutral = {
  eyeX: 0,
  eyeY: 0,
  blink: 0,
  mouthOpen: 0,
  smile: 0,
  laugh: 0,
  wave: 0,
  sad: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
} as const satisfies AvatarRuntimeControls;

const runtimeControlByExpression = {
  startup: {
    ...avatarRuntimeControlsNeutral,
    mouthOpen: 0.1,
    smile: 0.25,
    wave: 0.2,
  },
  idle: avatarRuntimeControlsNeutral,
  greeting: {
    ...avatarRuntimeControlsNeutral,
    smile: 0.55,
    wave: 1,
  },
  listening: {
    ...avatarRuntimeControlsNeutral,
    eyeY: 0.12,
    mouthOpen: 0.05,
    headPitch: -0.18,
  },
  thinking: {
    ...avatarRuntimeControlsNeutral,
    eyeY: -0.2,
    blink: 0.14,
    mouthOpen: 0.02,
    headPitch: 0.44,
    headYaw: -0.26,
    headRoll: -0.22,
  },
  speaking: {
    ...avatarRuntimeControlsNeutral,
    mouthOpen: 0.75,
    headPitch: -0.08,
  },
  smile: {
    ...avatarRuntimeControlsNeutral,
    smile: 0.9,
    wave: 0.28,
    headPitch: -0.12,
  },
  laugh: {
    ...avatarRuntimeControlsNeutral,
    mouthOpen: 0.5,
    smile: 0.58,
    laugh: 1,
    headPitch: -0.34,
    headRoll: 0.18,
  },
  sad: {
    ...avatarRuntimeControlsNeutral,
    eyeY: -0.28,
    mouthOpen: 0.04,
    sad: 0.85,
    headPitch: 0.38,
    headYaw: 0.18,
  },
  error: {
    ...avatarRuntimeControlsNeutral,
    eyeY: -0.32,
    mouthOpen: 0.22,
    sad: 1,
    headPitch: 0.48,
    headYaw: -0.22,
  },
  celebrating: {
    ...avatarRuntimeControlsNeutral,
    mouthOpen: 0.42,
    smile: 0.85,
    laugh: 0.75,
    wave: 0.85,
    headPitch: -0.22,
    headRoll: 0.24,
  },
} as const satisfies Record<AvatarCompanionState, AvatarRuntimeControls>;

export type AvatarExpressionEvent =
  | { type: "presence"; presenceState: string }
  | { type: "startup"; presenceState: string }
  | { type: "click-reaction" }
  | { type: "idle-wave" }
  | { type: "test-command"; command: string | null | undefined };

export type AvatarExpressionCommand = {
  expression: AvatarExpressionState;
  companionState: AvatarCompanionState;
  command: AvatarAnimationCommand;
  controls: AvatarRuntimeControls;
  event: AvatarExpressionEvent;
};

type ThreeVrmRendererConfig = {
  primaryRenderer: "three-vrm";
  companionState: AvatarCompanionState;
  command: AvatarAnimationCommand;
  three: {
    src: string;
    loader: typeof vendoredVrmAssetContract.loader;
    renderer: typeof vendoredVrmAssetContract.renderer;
    transparentCanvas: true;
  };
  controls: AvatarRuntimeControls;
  capabilityInventory: typeof vrmCapabilityInventory;
};

const commandByExpression = {
  startup: "expression.startup",
  idle: "expression.idle",
  greeting: "expression.greeting",
  listening: "expression.listening",
  thinking: "expression.thinking",
  speaking: "expression.speaking",
  smile: "expression.smile",
  laugh: "expression.laugh",
  sad: "expression.sad",
  error: "expression.error",
  celebrating: "expression.celebrating",
} as const satisfies Record<AvatarCompanionState, AvatarAnimationCommand>;

export const avatarLaunchSequence = [
  {
    delayMs: 0,
    presenceState: "appearing",
    companionState: "startup",
    command: "expression.startup",
  },
  {
    delayMs: 560,
    presenceState: "listening",
    companionState: "greeting",
    command: "expression.greeting",
  },
  {
    delayMs: 1520,
    presenceState: "idle",
    companionState: "idle",
    command: "expression.idle",
  },
] as const satisfies ReadonlyArray<{
  delayMs: number;
  presenceState: string;
  companionState: AvatarCompanionState;
  command: AvatarAnimationCommand;
}>;

export const avatarIdleWavePolicy = {
  companionState: "greeting",
  command: "expression.greeting",
  initialDelayMs: 90_000,
  minimumIntervalMs: 60_000,
  maximumIntervalMs: 120_000,
  activeStateBackoffMs: 6_000,
  waveDurationMs: 960,
  pausedPresenceStates: [
    "appearing",
    "listening",
    "thinking",
    "speaking",
    "focused",
    "waiting_for_approval",
    "waitingApproval",
    "muted",
    "error",
    "task_running",
    "task_paused",
    "sleeping",
  ],
} as const;

function clampAvatarIdleWaveRandom(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function nextAvatarIdleWaveIntervalMs({
  random = Math.random,
}: {
  random?: () => number;
} = {}) {
  const intervalRangeMs =
    avatarIdleWavePolicy.maximumIntervalMs -
    avatarIdleWavePolicy.minimumIntervalMs;

  return (
    avatarIdleWavePolicy.minimumIntervalMs +
    Math.round(intervalRangeMs * clampAvatarIdleWaveRandom(random()))
  );
}

export function millisecondsUntilNextAvatarIdleWave({
  presenceState,
  nowMs,
  lastWaveAtMs,
  scheduledIntervalMs = avatarIdleWavePolicy.minimumIntervalMs,
}: {
  presenceState: string;
  nowMs: number;
  lastWaveAtMs: number | null;
  scheduledIntervalMs?: number;
}) {
  if (
    avatarIdleWavePolicy.pausedPresenceStates.some(
      (pausedPresenceState) => pausedPresenceState === presenceState,
    )
  ) {
    return avatarIdleWavePolicy.activeStateBackoffMs;
  }

  if (lastWaveAtMs === null) {
    return avatarIdleWavePolicy.initialDelayMs;
  }

  return Math.max(
    0,
    scheduledIntervalMs - (nowMs - lastWaveAtMs),
  );
}

const hiddenTestCommandStateByCommand = {
  greeting: "greeting",
  happy: "smile",
  smile: "smile",
  laugh: "laugh",
  sad: "sad",
  error: "error",
  thinking: "thinking",
  talking: "speaking",
  speaking: "speaking",
  dance: "celebrating",
  celebration: "celebrating",
} as const satisfies Record<AvatarTestAnimationCommand, AvatarCompanionState>;

const presenceToExpression: Record<string, AvatarCompanionState> = {
  appearing: "startup",
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  focused: "thinking",
  happy: "smile",
  confused: "thinking",
  waiting_for_approval: "sad",
  waitingApproval: "sad",
  muted: "idle",
  error: "error",
  task_running: "thinking",
  task_paused: "sad",
  sleeping: "idle",
};

function avatarExpressionStateForEvent(
  event: AvatarExpressionEvent,
): AvatarCompanionState | null {
  if (event.type === "click-reaction") {
    return "smile";
  }

  if (event.type === "idle-wave") {
    return avatarIdleWavePolicy.companionState;
  }

  if (event.type === "test-command") {
    if (!event.command) {
      return null;
    }

    return (
      hiddenTestCommandStateByCommand[
        event.command as AvatarTestAnimationCommand
      ] ?? null
    );
  }

  if (event.type === "startup") {
    return (
      avatarLaunchSequence.find(
        (step) => step.presenceState === event.presenceState,
      )?.companionState ?? null
    );
  }

  return presenceToExpression[event.presenceState] ?? "idle";
}

export function getAvatarExpressionCommand(
  companionState: AvatarCompanionState,
  event: AvatarExpressionEvent = { type: "presence", presenceState: companionState },
): AvatarExpressionCommand {
  return {
    expression: companionState,
    companionState,
    command: commandByExpression[companionState],
    controls: runtimeControlByExpression[companionState],
    event,
  };
}

export function avatarExpressionCommandForEvent(
  event: AvatarExpressionEvent,
): AvatarExpressionCommand | null {
  const companionState = avatarExpressionStateForEvent(event);

  return companionState ? getAvatarExpressionCommand(companionState, event) : null;
}

export function avatarCompanionStateForClickReaction(): AvatarCompanionState {
  return (
    avatarExpressionCommandForEvent({ type: "click-reaction" })
      ?.companionState ?? "smile"
  );
}

export function avatarCompanionStateFromTestCommand(
  command: string | null | undefined,
): AvatarCompanionState | null {
  return (
    avatarExpressionCommandForEvent({ type: "test-command", command })
      ?.companionState ?? null
  );
}

export function getAvatarRendererConfig(
  companionState: AvatarCompanionState,
): ThreeVrmRendererConfig {
  const expressionCommand = getAvatarExpressionCommand(companionState);

  return {
    primaryRenderer: "three-vrm",
    companionState,
    command: expressionCommand.command,
    three: {
      src: avatarPackageAssets.vrm.publicPath,
      loader: vendoredVrmAssetContract.loader,
      renderer: vendoredVrmAssetContract.renderer,
      transparentCanvas: true,
    },
    controls: expressionCommand.controls,
    capabilityInventory: vrmCapabilityInventory,
  };
}

export function fallbackRendererFor(reason: AvatarFallbackReason) {
  return {
    renderer: "none" as const,
    reason,
    src: null,
  };
}

export type Live2DAvatarSurfaceHook = {
  state: AvatarPresenceState;
  label: string;
  statusText: string;
  avatarAssetPath: `/avatar/plato/vrm/${string}.vrm`;
  motionGroup:
    | "appear"
    | "idle"
    | "tap_body"
    | "thinking"
    | "speak"
    | "approval"
    | "quiet"
    | "error";
  expression: AvatarExpressionState;
  expressionCommand: AvatarExpressionCommand;
  companionState: AvatarCompanionState;
  rendererConfig: ThreeVrmRendererConfig;
  parameterHints: {
    eyeOpen: number;
    mouthOpen: number;
    bodyAngleX: number;
    bodyAngleY: number;
  };
};

const live2dAvatarSurfaceHookBase = {
  appearing: {
    label: "Appearing",
    statusText: "Coming online",
    motionGroup: "appear",
    parameterHints: { eyeOpen: 1, mouthOpen: 0.16, bodyAngleX: 0, bodyAngleY: -4 },
  },
  idle: {
    label: "Idle",
    statusText: "Idle presence",
    motionGroup: "idle",
    parameterHints: { eyeOpen: 0.82, mouthOpen: 0, bodyAngleX: 0, bodyAngleY: 0 },
  },
  listening: {
    label: "Listening",
    statusText: "Listening now",
    motionGroup: "tap_body",
    parameterHints: { eyeOpen: 1, mouthOpen: 0.08, bodyAngleX: -5, bodyAngleY: 4 },
  },
  thinking: {
    label: "Thinking",
    statusText: "Thinking through it",
    motionGroup: "thinking",
    parameterHints: { eyeOpen: 0.6, mouthOpen: 0, bodyAngleX: 4, bodyAngleY: -3 },
  },
  speaking: {
    label: "Speaking",
    statusText: "Speaking",
    motionGroup: "speak",
    parameterHints: { eyeOpen: 0.9, mouthOpen: 0.72, bodyAngleX: 2, bodyAngleY: 0 },
  },
  waitingApproval: {
    label: "Waiting for approval",
    statusText: "Waiting for approval",
    motionGroup: "approval",
    parameterHints: { eyeOpen: 0.72, mouthOpen: 0.18, bodyAngleX: -2, bodyAngleY: 2 },
  },
  muted: {
    label: "Muted",
    statusText: "Muted",
    motionGroup: "quiet",
    parameterHints: { eyeOpen: 0.68, mouthOpen: 0, bodyAngleX: 0, bodyAngleY: 3 },
  },
  error: {
    label: "Error",
    statusText: "Needs repair",
    motionGroup: "error",
    parameterHints: { eyeOpen: 0.5, mouthOpen: 0.22, bodyAngleX: -4, bodyAngleY: 0 },
  },
} as const;

export const live2dAvatarSurfaceHooks = Object.fromEntries(
  avatarPresenceStates.map((state) => {
    const expressionCommand =
      avatarExpressionCommandForEvent({
        type: "presence",
        presenceState: state,
      }) ?? getAvatarExpressionCommand("idle");
    const companionState = expressionCommand.companionState;

    return [
      state,
      {
        state,
        ...live2dAvatarSurfaceHookBase[state],
        expression: expressionCommand.expression,
        expressionCommand,
        avatarAssetPath: avatarPackageAssets.vrm.publicPath,
        companionState,
        rendererConfig: getAvatarRendererConfig(companionState),
      },
    ];
  }),
) as unknown as Record<AvatarPresenceState, Live2DAvatarSurfaceHook>;

export function isAvatarPresenceState(
  value: string | null,
): value is AvatarPresenceState {
  return (
    value !== null &&
    avatarPresenceStates.some((presenceState) => presenceState === value)
  );
}

export function avatarPresenceStateFrom(
  value: string | null,
): AvatarPresenceState | undefined {
  if (value === "waiting_for_approval") {
    return "waitingApproval";
  }

  return isAvatarPresenceState(value) ? value : undefined;
}

export function getLive2DAvatarSurfaceHook(
  presenceState: AvatarPresenceState,
) {
  return live2dAvatarSurfaceHooks[presenceState];
}

function clampRuntimeControl(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function clampSignedRuntimeControl(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function applyVrmExpressionControls(vrm: VRM, controls: AvatarRuntimeControls) {
  const expressionManager = vrm.expressionManager;

  if (!expressionManager) {
    return;
  }

  expressionManager.setValue("blink", clampRuntimeControl(controls.blink));
  expressionManager.setValue(
    "aa",
    Math.max(
      clampRuntimeControl(controls.mouthOpen),
      clampRuntimeControl(controls.laugh) * 0.36,
    ),
  );
  expressionManager.setValue("happy", clampRuntimeControl(controls.smile));
  expressionManager.setValue("sad", clampRuntimeControl(controls.sad));
  expressionManager.setValue(
    "relaxed",
    clampRuntimeControl(controls.laugh) * 0.72,
  );
}

function normalizeAvatarRuntimeControls(
  controls: AvatarRuntimeControls,
): AvatarRuntimeControls {
  return {
    eyeX: roundAvatarEyeAxis(controls.eyeX),
    eyeY: roundAvatarEyeAxis(controls.eyeY),
    blink: clampRuntimeControl(controls.blink),
    mouthOpen: clampRuntimeControl(controls.mouthOpen),
    smile: clampRuntimeControl(controls.smile),
    laugh: clampRuntimeControl(controls.laugh),
    wave: clampRuntimeControl(controls.wave),
    sad: clampRuntimeControl(controls.sad),
    headPitch: clampSignedRuntimeControl(controls.headPitch),
    headYaw: clampSignedRuntimeControl(controls.headYaw),
    headRoll: clampSignedRuntimeControl(controls.headRoll),
  };
}

export const avatarSpeakingMouthOpenLoop = [
  0.18, 0.72, 0.34, 0.86, 0.26, 0.64,
] as const;

export function avatarSpeakingControlsForFrame({
  frameIndex,
  cue = "neutral",
}: {
  frameIndex: number;
  cue?: AvatarSpeechCue;
}): AvatarRuntimeControls {
  const safeFrameIndex =
    Number.isFinite(frameIndex) && frameIndex >= 0 ? Math.floor(frameIndex) : 0;
  const mouthOpen =
    avatarSpeakingMouthOpenLoop[
      safeFrameIndex % avatarSpeakingMouthOpenLoop.length
    ];
  const baseControls =
    cue === "laugh"
      ? runtimeControlByExpression.laugh
      : cue === "smile"
        ? runtimeControlByExpression.smile
        : runtimeControlByExpression.speaking;

  return normalizeAvatarRuntimeControls({
    ...baseControls,
    mouthOpen:
      cue === "laugh"
        ? Math.max(mouthOpen, runtimeControlByExpression.laugh.mouthOpen)
        : mouthOpen,
    smile:
      cue === "smile"
        ? Math.max(runtimeControlByExpression.smile.smile, 0.7)
        : baseControls.smile,
    laugh: cue === "laugh" ? runtimeControlByExpression.laugh.laugh : 0,
    wave: 0,
  });
}

function applyNeutralHumanoidBonePose(
  vrm: VRM,
  THREE: typeof import("three"),
  boneRotations: Map<string, ThreeNamespace.Euler>,
) {
  for (const [boneName, rotation] of Object.entries(
    avatarNeutralHumanoidBonePose,
  )) {
    const bone = vrm.humanoid.getNormalizedBoneNode(
      boneName as Parameters<typeof vrm.humanoid.getNormalizedBoneNode>[0],
    );

    if (!bone) {
      continue;
    }

    bone.rotation.set(rotation.x, rotation.y, rotation.z);
    boneRotations.set(
      boneName,
      new THREE.Euler(rotation.x, rotation.y, rotation.z, bone.rotation.order),
    );
  }
}

function applyHeadPoseControls(
  vrm: VRM,
  boneRotations: Map<string, ThreeNamespace.Euler>,
  controls: AvatarRuntimeControls,
) {
  const poseControls = [
    { boneName: "neck", pitchScale: 0.1, yawScale: 0.08, rollScale: 0.06 },
    { boneName: "head", pitchScale: 0.18, yawScale: 0.14, rollScale: 0.12 },
  ] as const;
  const headPitch = clampSignedRuntimeControl(controls.headPitch);
  const headYaw = clampSignedRuntimeControl(controls.headYaw);
  const headRoll = clampSignedRuntimeControl(controls.headRoll);

  for (const poseControl of poseControls) {
    const bone = vrm.humanoid.getNormalizedBoneNode(
      poseControl.boneName as Parameters<
        typeof vrm.humanoid.getNormalizedBoneNode
      >[0],
    );
    const baseRotation = boneRotations.get(poseControl.boneName);

    if (!bone || !baseRotation) {
      continue;
    }

    bone.rotation.copy(baseRotation);
    bone.rotation.x += headPitch * poseControl.pitchScale;
    bone.rotation.y += headYaw * poseControl.yawScale;
    bone.rotation.z += headRoll * poseControl.rollScale;
  }
}

type BrowserVrmCanvasProps = {
  className: string;
  src: string;
  controls: AvatarRuntimeControls;
  onLoad: () => void;
  onLoadError: () => void;
};

function BrowserVrmCanvas({
  className,
  src,
  controls,
  onLoad,
  onLoadError,
}: BrowserVrmCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef(controls);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || typeof window === "undefined") {
      return undefined;
    }

    const runtimeCanvas = canvas;
    let disposed = false;
    let frameId = 0;
    let cleanup: (() => void) | undefined;

    async function setupRenderer() {
      const THREE = await import("three");
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
      );
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

      if (disposed) {
        return;
      }

      const renderer = new THREE.WebGLRenderer({
        canvas: runtimeCanvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        vendoredVrmAssetContract.framing.fieldOfViewDegrees,
        1,
        0.1,
        20,
      );
      camera.position.fromArray(
        vendoredVrmAssetContract.framing.cameraPosition,
      );
      camera.lookAt(
        new THREE.Vector3().fromArray(
          vendoredVrmAssetContract.framing.cameraLookAt,
        ),
      );

      scene.add(new THREE.AmbientLight(0xffffff, 2.1));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(1.5, 2.6, 2.4);
      scene.add(keyLight);

      const lookAtTarget = new THREE.Object3D();
      scene.add(lookAtTarget);

      const loader = new GLTFLoader();
      loader.register((parser: GLTFParser) => new VRMLoaderPlugin(parser));

      let loadedVrm: VRM | null = null;
      const waveBones = new Map<string, ThreeNamespace.Object3D>();
      const waveBoneRotations = new Map<string, ThreeNamespace.Euler>();
      let lastFrameTime = performance.now();
      let elapsedSeconds = 0;

      const resize = () => {
        const width = Math.max(1, runtimeCanvas.clientWidth);
        const height = Math.max(1, runtimeCanvas.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(runtimeCanvas);
      resize();

      loader.load(
        src,
        (gltf: GLTF) => {
          if (disposed) {
            return;
          }

          avatarHandleVrmRuntimeLoad({
            vrm: gltf.userData.vrm as VRM | undefined,
            disposeScene: (sceneToDispose) => {
              VRMUtils.deepDispose(sceneToDispose);
            },
            onFailed: () => {
              onLoadError();
            },
            onReady: (vrm) => {
              VRMUtils.rotateVRM0(vrm);
              loadedVrm = vrm;
              vrm.scene.position.fromArray(
                vendoredVrmAssetContract.framing.modelPosition,
              );
              vrm.scene.scale.setScalar(
                vendoredVrmAssetContract.framing.modelScale,
              );
              scene.add(vrm.scene);

              applyNeutralHumanoidBonePose(vrm, THREE, waveBoneRotations);

              for (const boneName of vendoredVrmAssetContract.runtimeControls
                .wave.backedBy) {
                const normalizedBoneName = boneName.replace(
                  "humanoid bone: ",
                  "",
                );
                const bone = vrm.humanoid.getNormalizedBoneNode(
                  normalizedBoneName as Parameters<
                    typeof vrm.humanoid.getNormalizedBoneNode
                  >[0],
                );

                if (bone) {
                  waveBones.set(normalizedBoneName, bone);
                  if (!waveBoneRotations.has(normalizedBoneName)) {
                    waveBoneRotations.set(
                      normalizedBoneName,
                      bone.rotation.clone(),
                    );
                  }
                }
              }

              for (const boneName of ["neck", "head"]) {
                const bone = vrm.humanoid.getNormalizedBoneNode(
                  boneName as Parameters<
                    typeof vrm.humanoid.getNormalizedBoneNode
                  >[0],
                );

                if (bone && !waveBoneRotations.has(boneName)) {
                  waveBoneRotations.set(boneName, bone.rotation.clone());
                }
              }

              vrm.lookAt.target = lookAtTarget;
              applyVrmExpressionControls(vrm, controlsRef.current);
              onLoad();
            },
          });
        },
        undefined,
        () => {
          if (!disposed) {
            onLoadError();
          }
        },
      );

      const animate = () => {
        frameId = window.requestAnimationFrame(animate);

        const nextFrameTime = performance.now();
        const delta = Math.min((nextFrameTime - lastFrameTime) / 1000, 0.1);
        lastFrameTime = nextFrameTime;
        elapsedSeconds += delta;
        const currentControls = controlsRef.current;

        const lookAtTargetPosition =
          avatarEyeDirectionToVrmLookAtTarget({
            x: currentControls.eyeX,
            y: currentControls.eyeY,
          });
        lookAtTarget.position.set(
          lookAtTargetPosition.x,
          lookAtTargetPosition.y,
          lookAtTargetPosition.z,
        );

        if (loadedVrm) {
          applyVrmExpressionControls(loadedVrm, currentControls);
          applyHeadPoseControls(loadedVrm, waveBoneRotations, currentControls);

          const wave = clampRuntimeControl(currentControls.wave);
          for (const [boneName, bone] of waveBones) {
            const baseRotation = waveBoneRotations.get(boneName);

            if (!baseRotation) {
              continue;
            }

            bone.rotation.copy(baseRotation);

            if (wave > 0) {
              const oscillation = Math.sin(
                elapsedSeconds *
                  avatarHelloWaveHumanoidBoneMotion.oscillationRadiansPerSecond,
              );

              if (boneName === "rightUpperArm") {
                const motion =
                  avatarHelloWaveHumanoidBoneMotion.rightUpperArm;
                bone.rotation.z -= wave * motion.raiseZ;
                bone.rotation.x +=
                  wave * (motion.forwardX + oscillation * motion.swayX);
              }

              if (boneName === "rightLowerArm") {
                const motion =
                  avatarHelloWaveHumanoidBoneMotion.rightLowerArm;
                bone.rotation.z -= wave * motion.bendZ;
                bone.rotation.x += wave * motion.bendX;
                bone.rotation.y +=
                  wave * (motion.palmTwistY + oscillation * motion.swayY);
              }

              if (boneName === "rightHand") {
                const motion = avatarHelloWaveHumanoidBoneMotion.rightHand;
                bone.rotation.y += wave * oscillation * motion.swayY;
                bone.rotation.z += wave * oscillation * motion.swayZ;
              }
            }
          }

          loadedVrm.update(delta);
        }

        renderer.render(scene, camera);
      };

      animate();

      cleanup = () => {
        window.cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        if (loadedVrm) {
          VRMUtils.deepDispose(loadedVrm.scene);
        }
        renderer.dispose();
      };
    }

    void setupRenderer().catch(() => {
      if (!disposed) {
        onLoadError();
      }
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onLoad, onLoadError, src]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-vrm-src={src}
      data-three-renderer="webgl"
      data-three-alpha="true"
      data-vrm-loader={vendoredVrmAssetContract.loader}
    />
  );
}

export function AvatarRenderer({
  companionState,
  eyeDirection = avatarEyeDirectionNeutral,
  runtimeControlsOverride,
}: {
  companionState: AvatarCompanionState;
  eyeDirection?: AvatarEyeDirection;
  runtimeControlsOverride?: AvatarRuntimeControlsOverride;
}) {
  const config = getAvatarRendererConfig(companionState);
  const controls = useMemo(
    () =>
      normalizeAvatarRuntimeControls({
        ...config.controls,
        ...runtimeControlsOverride,
        eyeX: eyeDirection.x,
        eyeY: eyeDirection.y,
      }),
    [config.controls, eyeDirection.x, eyeDirection.y, runtimeControlsOverride],
  );
  const [runtimeState, setRuntimeState] =
    useState<VrmRuntimeState>("loading");
  const markVrmReady = useCallback(() => {
    setRuntimeState("ready");
  }, []);
  const markVrmFailed = useCallback(() => {
    setRuntimeState("failed");
  }, []);

  return (
    <div
      className="plato-vrm-avatar"
      data-avatar-package="@useplatoai/avatar"
      data-avatar-renderer={config.primaryRenderer}
      data-avatar-companion-state={config.companionState}
      data-avatar-command={config.command}
      data-vrm-src={config.three.src}
      data-vrm-runtime-state={runtimeState}
      data-three-renderer={config.three.renderer}
      data-three-alpha={String(config.three.transparentCanvas)}
      data-vrm-loader={config.three.loader}
      data-avatar-eye-control-source={avatarVrmEyeGazeCalibration.controlSource}
      data-avatar-control-eye-x={String(controls.eyeX)}
      data-avatar-control-eye-y={String(controls.eyeY)}
      data-avatar-control-blink={String(controls.blink)}
      data-avatar-control-mouth-open={String(controls.mouthOpen)}
      data-avatar-control-smile={String(controls.smile)}
      data-avatar-control-laugh={String(controls.laugh)}
      data-avatar-control-wave={String(controls.wave)}
      data-avatar-control-sad={String(controls.sad)}
      data-avatar-control-head-pitch={String(controls.headPitch)}
      data-avatar-control-head-yaw={String(controls.headYaw)}
      data-avatar-control-head-roll={String(controls.headRoll)}
      data-avatar-fallback-state="none"
      style={avatarEyeDirectionStyle(eyeDirection)}
    >
      <BrowserVrmCanvas
        key={config.three.src}
        className="plato-three-vrm-canvas"
        src={config.three.src}
        controls={controls}
        onLoad={markVrmReady}
        onLoadError={markVrmFailed}
      />
    </div>
  );
}

export function Live2DAvatarSurface({
  presenceState,
  companionStateOverride,
  eyeDirection = avatarEyeDirectionNeutral,
  runtimeControlsOverride,
}: {
  presenceState: AvatarPresenceState;
  companionStateOverride?: AvatarCompanionState;
  eyeDirection?: AvatarEyeDirection;
  runtimeControlsOverride?: AvatarRuntimeControlsOverride;
}) {
  const hook = getLive2DAvatarSurfaceHook(presenceState);
  const rendererConfig = companionStateOverride
    ? getAvatarRendererConfig(companionStateOverride)
    : hook.rendererConfig;
  const surfaceExpression = rendererConfig.companionState;

  return (
    <figure
      className="live2d-avatar-surface"
      data-presence-state={hook.state}
      data-avatar-motion-group={hook.motionGroup}
      data-avatar-expression={surfaceExpression}
      aria-label={`Plato avatar surface: ${hook.statusText}`}
    >
      <div
        key={hook.rendererConfig.three.src}
        className="live2d-avatar-stage"
        data-avatar-renderer="three-vrm"
        data-vrm-asset={rendererConfig.three.src}
        data-avatar-companion-state={rendererConfig.companionState}
        data-avatar-command={rendererConfig.command}
        aria-hidden="true"
      >
        <AvatarRenderer
          companionState={rendererConfig.companionState}
          eyeDirection={eyeDirection}
          runtimeControlsOverride={runtimeControlsOverride}
        />
        <div
          className="live2d-presence-mark"
          data-avatar-fallback-surface="presence-mark"
        >
          <span className="live2d-presence-core" />
          <span className="live2d-presence-ring live2d-presence-ring-primary" />
          <span className="live2d-presence-ring live2d-presence-ring-secondary" />
          <span className="live2d-presence-meter live2d-presence-meter-left" />
          <span className="live2d-presence-meter live2d-presence-meter-right" />
        </div>
      </div>
      <figcaption className="live2d-avatar-caption sr-only">
        <span>{hook.label}</span>
        <small>
          VRM: {rendererConfig.command} / {surfaceExpression}
        </small>
      </figcaption>
    </figure>
  );
}
