import { useRive } from "@rive-app/react-canvas";
import { useCallback, useMemo, useState, type CSSProperties } from "react";

export const avatarCompanionStates = [
  "startup",
  "greet",
  "idle",
  "happy",
  "sad",
  "talking",
  "celebrating",
] as const;

export type AvatarCompanionState = (typeof avatarCompanionStates)[number];

export const avatarAnimationCommands = [
  "startup.appear",
  "greet.wave",
  "idle.breathe",
  "mood.smile",
  "mood.sad",
  "voice.talk",
  "celebration.dance",
] as const;

export type AvatarAnimationCommand = (typeof avatarAnimationCommands)[number];

export const avatarTestAnimationCommands = [
  "greeting",
  "happy",
  "smile",
  "sad",
  "talking",
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

export type AvatarRendererKind = "rive" | "svg";
export type AvatarFallbackReason = "missing-rive-asset" | "unsupported-runtime";
export type RiveRuntimeState = "loading" | "ready" | "failed";

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

function PlatoWiseOwlSourceSvg({
  eyeDirection,
}: {
  eyeDirection: AvatarEyeDirection;
}) {
  return (
    <svg
      id="plato-wise-owl"
      className="plato-avatar-asset plato-avatar-source-svg-asset"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 360"
      role="img"
      aria-labelledby="plato-wise-owl-title plato-wise-owl-desc"
      data-avatar-fallback-surface="commercial-safe-mascot"
      data-avatar-eye-tracking="fallback-svg-pupils"
      data-avatar-eye-x={String(eyeDirection.x)}
      data-avatar-eye-y={String(eyeDirection.y)}
      style={avatarEyeDirectionStyle(eyeDirection)}
    >
      <title id="plato-wise-owl-title">Plato wise owl companion mascot</title>
      <desc id="plato-wise-owl-desc">
        A simplified CC0-derived wise owl mascot with expressive eyes.
      </desc>
      <rect width="320" height="360" fill="none" />
      <g
        fill="none"
        stroke="#17130f"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          fill="#dbc2b2"
          d="M106 111c19-34 79-34 102 0 20 30 26 85 14 143-7 34-28 60-66 60-40 0-62-25-70-60-13-58 0-113 20-143Z"
        />
        <path fill="#8aa46f" d="M118 76c35-24 70-24 99 1-30 17-63 20-99-1Z" />
        <path fill="#6f8459" d="M158 40c28 7 44 22 50 45-27 0-49-12-50-45Z" />
        <path fill="#f4f0c4" d="M204 34c11 10 18 21 21 35-15-5-26-15-21-35Z" />
        <path fill="#f9f4e9" d="M96 306h148l36 28H48l48-28Z" />
        <path fill="#9f6f67" d="M84 281h160l-21 30H62l22-30Z" />
        <path fill="#70809d" d="M52 318h210l35 25H24l28-25Z" />
        <path d="M138 136c-3 17-22 27-39 18M178 136c5 17 24 26 40 16" />
        <circle className="plato-wise-owl-eye-white" cx="124" cy="153" r="18" fill="#f5f4ec" />
        <circle className="plato-wise-owl-eye-white" cx="194" cy="153" r="18" fill="#f5f4ec" />
        <circle
          className="plato-wise-owl-pupil plato-wise-owl-pupil-left"
          cx="127"
          cy="155"
          r="7"
          fill="#17130f"
        />
        <circle
          className="plato-wise-owl-pupil plato-wise-owl-pupil-right"
          cx="191"
          cy="155"
          r="7"
          fill="#17130f"
        />
        <path fill="#d59f6c" d="M154 171l18 2-10 15-8-17Z" />
        <path d="M148 202c9 8 24 8 33-1M98 222c18 10 36 12 54 5M168 228c21 6 41 2 58-12M115 253c25 12 55 13 86 1" />
        <path d="M126 114c23-10 48-10 72 0M120 92c25 14 56 17 92 3" />
        <path d="M226 82l24-16M242 85l24-4M230 96l22 10" />
      </g>
    </svg>
  );
}

function RiveMatchedEyeTrackingOverlay({
  eyeDirection,
}: {
  eyeDirection: AvatarEyeDirection;
}) {
  const style = {
    ...avatarEyeDirectionStyle(eyeDirection),
    "--plato-rive-eye-left-x": `${riveMatchedEyeTrackingOverlay.left.xPercent}%`,
    "--plato-rive-eye-left-y": `${riveMatchedEyeTrackingOverlay.left.yPercent}%`,
    "--plato-rive-eye-right-x": `${riveMatchedEyeTrackingOverlay.right.xPercent}%`,
    "--plato-rive-eye-right-y": `${riveMatchedEyeTrackingOverlay.right.yPercent}%`,
  } as CSSProperties;

  return (
    <div
      className="plato-rive-eye-tracking-overlay"
      aria-hidden="true"
      data-avatar-eye-tracking="rive-matched-pupils"
      data-rive-eye-surface={riveMatchedEyeTrackingOverlay.surface}
      data-avatar-eye-x={String(eyeDirection.x)}
      data-avatar-eye-y={String(eyeDirection.y)}
      style={style}
    >
      <span className="plato-rive-eye-pupil plato-rive-eye-pupil-left" />
      <span className="plato-rive-eye-pupil plato-rive-eye-pupil-right" />
    </div>
  );
}

export type AvatarPackageAsset = {
  packagePath: string;
  publicPath: string;
};

export const avatarPackageAssets = {
  rive: {
    packagePath: "packages/avatar/assets/rive/plato-companion.riv",
    publicPath: "/avatar/plato/rive/plato-companion.riv",
  },
  sourceSvg: {
    packagePath: "packages/avatar/assets/source/wise-owl-colour.svg",
    publicPath: "/avatar/plato/source/wise-owl-colour.svg",
  },
  startupSound: {
    packagePath: "packages/avatar/assets/audio/plato-startup-chime.json",
    publicPath: "/avatar/plato/audio/plato-startup-chime.json",
  },
} as const satisfies Record<string, AvatarPackageAsset>;

export const mascotSource = {
  title: "Wise Owl - Colour",
  sourceUrl: "https://openclipart.org/detail/303927/wise-owl-colour",
  artist: "j4p4n",
  remixOf: {
    title: "wise owl on books",
    artist: "johnny_automatic",
    sourceUrl: "https://openclipart.org/detail/9214/wise-owl-on-books",
  },
  license: {
    name: "Creative Commons Zero 1.0 Universal",
    spdxId: "CC0-1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    allowsCommercialUse: true,
  },
  attribution: {
    required: false,
    note: "Not required by CC0; source retained for provenance.",
  },
  usageNotes:
    "Use as the commercial-safe fallback mascot source for Plato's first Rive-backed avatar package.",
} as const;

export const avatarStartupSound = {
  id: "plato-startup-chime",
  packagePath: avatarPackageAssets.startupSound.packagePath,
  publicPath: avatarPackageAssets.startupSound.publicPath,
  playback: "app-launch-or-activation",
} as const;

export const vendoredRiveAssetContract = {
  artboard: "Avatar 1",
  stateMachine: "avatar",
  animations: {
    idle: "idle",
    happy: "happy",
    sad: "sad",
  },
  inputs: {
    isHappy: "isHappy",
    isSad: "isSad",
    mouth: "mouth",
  },
} as const;

const riveMatchedEyeTrackingOverlay = {
  surface: vendoredRiveAssetContract.artboard,
  left: {
    xPercent: 36.6,
    yPercent: 49.7,
  },
  right: {
    xPercent: 63.5,
    yPercent: 49.7,
  },
} as const;

type RiveAssetInputs = typeof vendoredRiveAssetContract.inputs;
type RiveInputName = RiveAssetInputs[keyof RiveAssetInputs];

type RiveInputValues = Partial<Record<RiveInputName, boolean | number>>;

type RiveRendererConfig = {
  primaryRenderer: "rive";
  companionState: AvatarCompanionState;
  command: AvatarAnimationCommand;
  rive: {
    src: string;
    artboard: typeof vendoredRiveAssetContract.artboard;
    stateMachine: typeof vendoredRiveAssetContract.stateMachine;
    animation: string;
    inputs: RiveInputValues;
  };
  fallback: {
    renderer: "svg";
    src: string;
  };
};

const animationByState = {
  startup: {
    command: "startup.appear",
    animation: vendoredRiveAssetContract.animations.idle,
    inputs: {
      isHappy: false,
      isSad: false,
      mouth: 0,
    },
  },
  greet: {
    command: "greet.wave",
    animation: vendoredRiveAssetContract.animations.happy,
    inputs: {
      isHappy: true,
      isSad: false,
      mouth: 0.1,
    },
  },
  idle: {
    command: "idle.breathe",
    animation: vendoredRiveAssetContract.animations.idle,
    inputs: {
      isHappy: false,
      isSad: false,
      mouth: 0,
    },
  },
  happy: {
    command: "mood.smile",
    animation: vendoredRiveAssetContract.animations.happy,
    inputs: {
      isHappy: true,
      isSad: false,
      mouth: 0.2,
    },
  },
  sad: {
    command: "mood.sad",
    animation: vendoredRiveAssetContract.animations.sad,
    inputs: {
      isHappy: false,
      isSad: true,
      mouth: 0,
    },
  },
  talking: {
    command: "voice.talk",
    animation: vendoredRiveAssetContract.animations.idle,
    inputs: {
      isHappy: false,
      isSad: false,
      mouth: 0.75,
    },
  },
  celebrating: {
    command: "celebration.dance",
    animation: vendoredRiveAssetContract.animations.happy,
    inputs: {
      isHappy: true,
      isSad: false,
      mouth: 0.45,
    },
  },
} as const satisfies Record<
  AvatarCompanionState,
  { command: AvatarAnimationCommand; animation: string; inputs: RiveInputValues }
>;

const hiddenTestCommandStateByCommand = {
  greeting: "greet",
  happy: "happy",
  smile: "happy",
  sad: "sad",
  talking: "talking",
  dance: "celebrating",
  celebration: "celebrating",
} as const satisfies Record<AvatarTestAnimationCommand, AvatarCompanionState>;

export function avatarCompanionStateForClickReaction(): AvatarCompanionState {
  return "happy";
}

export function avatarCompanionStateFromTestCommand(
  command: string | null | undefined,
): AvatarCompanionState | null {
  if (!command) {
    return null;
  }

  return (
    hiddenTestCommandStateByCommand[
      command as AvatarTestAnimationCommand
    ] ?? null
  );
}

export function getAvatarRendererConfig(
  companionState: AvatarCompanionState,
): RiveRendererConfig {
  const animation = animationByState[companionState];

  return {
    primaryRenderer: "rive",
    companionState,
    command: animation.command,
    rive: {
      src: avatarPackageAssets.rive.publicPath,
      artboard: vendoredRiveAssetContract.artboard,
      stateMachine: vendoredRiveAssetContract.stateMachine,
      animation: animation.animation,
      inputs: animation.inputs,
    },
    fallback: {
      renderer: "svg",
      src: avatarPackageAssets.sourceSvg.publicPath,
    },
  };
}

export function fallbackRendererFor(reason: AvatarFallbackReason) {
  return {
    renderer: "svg" as const,
    reason,
    src: avatarPackageAssets.sourceSvg.publicPath,
  };
}

const presenceToCompanionState = {
  appearing: "startup",
  idle: "idle",
  listening: "greet",
  thinking: "idle",
  speaking: "talking",
  waitingApproval: "sad",
  muted: "idle",
  error: "sad",
} as const satisfies Record<AvatarPresenceState, AvatarCompanionState>;

export type Live2DAvatarSurfaceHook = {
  state: AvatarPresenceState;
  label: string;
  statusText: string;
  avatarAssetPath: `/avatar/plato/source/${string}.svg`;
  motionGroup:
    | "appear"
    | "idle"
    | "tap_body"
    | "thinking"
    | "speak"
    | "approval"
    | "quiet"
    | "error";
  expression:
    | "bright"
    | "neutral"
    | "attentive"
    | "focused"
    | "talking"
    | "concerned"
    | "soft"
    | "strained";
  companionState: AvatarCompanionState;
  rendererConfig: RiveRendererConfig;
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
    expression: "bright",
    parameterHints: { eyeOpen: 1, mouthOpen: 0.16, bodyAngleX: 0, bodyAngleY: -4 },
  },
  idle: {
    label: "Idle",
    statusText: "Idle presence",
    motionGroup: "idle",
    expression: "neutral",
    parameterHints: { eyeOpen: 0.82, mouthOpen: 0, bodyAngleX: 0, bodyAngleY: 0 },
  },
  listening: {
    label: "Listening",
    statusText: "Listening now",
    motionGroup: "tap_body",
    expression: "attentive",
    parameterHints: { eyeOpen: 1, mouthOpen: 0.08, bodyAngleX: -5, bodyAngleY: 4 },
  },
  thinking: {
    label: "Thinking",
    statusText: "Thinking through it",
    motionGroup: "thinking",
    expression: "focused",
    parameterHints: { eyeOpen: 0.6, mouthOpen: 0, bodyAngleX: 4, bodyAngleY: -3 },
  },
  speaking: {
    label: "Speaking",
    statusText: "Speaking",
    motionGroup: "speak",
    expression: "talking",
    parameterHints: { eyeOpen: 0.9, mouthOpen: 0.72, bodyAngleX: 2, bodyAngleY: 0 },
  },
  waitingApproval: {
    label: "Waiting for approval",
    statusText: "Waiting for approval",
    motionGroup: "approval",
    expression: "concerned",
    parameterHints: { eyeOpen: 0.72, mouthOpen: 0.18, bodyAngleX: -2, bodyAngleY: 2 },
  },
  muted: {
    label: "Muted",
    statusText: "Muted",
    motionGroup: "quiet",
    expression: "soft",
    parameterHints: { eyeOpen: 0.68, mouthOpen: 0, bodyAngleX: 0, bodyAngleY: 3 },
  },
  error: {
    label: "Error",
    statusText: "Needs repair",
    motionGroup: "error",
    expression: "strained",
    parameterHints: { eyeOpen: 0.5, mouthOpen: 0.22, bodyAngleX: -4, bodyAngleY: 0 },
  },
} as const;

export const live2dAvatarSurfaceHooks = Object.fromEntries(
  avatarPresenceStates.map((state) => {
    const companionState = presenceToCompanionState[state];
    return [
      state,
      {
        state,
        ...live2dAvatarSurfaceHookBase[state],
        avatarAssetPath: avatarPackageAssets.sourceSvg.publicPath,
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

type BrowserRiveCanvasProps = {
  className: string;
  src: string;
  artboard: string;
  stateMachines: string;
  animations: string;
  inputs: RiveInputValues;
  onLoad: () => void;
  onLoadError: () => void;
};

function applyRiveInputs(
  rive: {
    stateMachineInputs: (
      name: string,
    ) => Array<{ name: string; value: boolean | number }>;
  },
  stateMachine: string,
  inputs: RiveInputValues,
) {
  for (const input of rive.stateMachineInputs(stateMachine)) {
    const nextValue = inputs[input.name as RiveInputName];

    if (nextValue !== undefined) {
      input.value = nextValue;
    }
  }
}

function BrowserRiveCanvas({
  className,
  src,
  artboard,
  stateMachines,
  animations,
  inputs,
  onLoad,
  onLoadError,
}: BrowserRiveCanvasProps) {
  const riveParameters = useMemo(
    () => ({
      src,
      artboard,
      stateMachines,
      animations,
      autoplay: true,
      onLoad,
      onLoadError,
      onRiveReady: (rive: {
        stateMachineInputs: (
          name: string,
        ) => Array<{ name: string; value: boolean | number }>;
      }) => {
        applyRiveInputs(rive, stateMachines, inputs);
      },
    }),
    [animations, artboard, inputs, onLoad, onLoadError, src, stateMachines],
  );
  const { RiveComponent } = useRive(riveParameters);

  if (typeof window === "undefined") {
    return (
      <canvas
        className={className}
        data-rive-src={src}
        data-rive-artboard={artboard}
        data-rive-state-machine={stateMachines}
        data-rive-animation={animations}
      />
    );
  }

  return (
    <RiveComponent
      className={className}
      data-rive-src={src}
      data-rive-artboard={artboard}
      data-rive-state-machine={stateMachines}
      data-rive-animation={animations}
    />
  );
}

export function AvatarRenderer({
  companionState,
  eyeDirection = avatarEyeDirectionNeutral,
}: {
  companionState: AvatarCompanionState;
  eyeDirection?: AvatarEyeDirection;
}) {
  const config = getAvatarRendererConfig(companionState);
  const [runtimeState, setRuntimeState] =
    useState<RiveRuntimeState>("loading");
  const markRiveReady = useCallback(() => {
    setRuntimeState("ready");
  }, []);
  const markRiveFailed = useCallback(() => {
    setRuntimeState("failed");
  }, []);

  return (
    <div
      className="plato-rive-avatar"
      data-avatar-package="@useplatoai/avatar"
      data-avatar-renderer={config.primaryRenderer}
      data-avatar-companion-state={config.companionState}
      data-avatar-command={config.command}
      data-rive-artboard={config.rive.artboard}
      data-rive-runtime-state={runtimeState}
      data-rive-state-machine={config.rive.stateMachine}
      data-rive-animation={config.rive.animation}
      data-rive-input-is-happy={String(config.rive.inputs.isHappy ?? false)}
      data-rive-input-is-sad={String(config.rive.inputs.isSad ?? false)}
      data-rive-input-mouth={String(config.rive.inputs.mouth ?? 0)}
      data-fallback-renderer={config.fallback.renderer}
      data-avatar-fallback-state="visible"
      data-avatar-eye-tracking="rive-matched-pupils"
      data-fallback-src={config.fallback.src}
    >
      <BrowserRiveCanvas
        key={config.command}
        className="plato-rive-canvas"
        src={config.rive.src}
        artboard={config.rive.artboard}
        stateMachines={config.rive.stateMachine}
        animations={config.rive.animation}
        inputs={config.rive.inputs}
        onLoad={markRiveReady}
        onLoadError={markRiveFailed}
      />
      <RiveMatchedEyeTrackingOverlay eyeDirection={eyeDirection} />
      <PlatoWiseOwlSourceSvg eyeDirection={eyeDirection} />
    </div>
  );
}

export function Live2DAvatarSurface({
  presenceState,
  companionStateOverride,
  eyeDirection = avatarEyeDirectionNeutral,
}: {
  presenceState: AvatarPresenceState;
  companionStateOverride?: AvatarCompanionState;
  eyeDirection?: AvatarEyeDirection;
}) {
  const hook = getLive2DAvatarSurfaceHook(presenceState);
  const rendererConfig = companionStateOverride
    ? getAvatarRendererConfig(companionStateOverride)
    : hook.rendererConfig;

  return (
    <figure
      className="live2d-avatar-surface"
      data-presence-state={hook.state}
      data-live2d-motion-group={hook.motionGroup}
      data-live2d-expression={hook.expression}
      aria-label={`Plato avatar surface: ${hook.statusText}`}
    >
      <div
        key={hook.rendererConfig.rive.src}
        className="live2d-avatar-stage"
        data-avatar-renderer="rive"
        data-rive-asset={rendererConfig.rive.src}
        data-avatar-companion-state={rendererConfig.companionState}
        data-avatar-command={rendererConfig.command}
        aria-hidden="true"
      >
        <AvatarRenderer
          companionState={rendererConfig.companionState}
          eyeDirection={eyeDirection}
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
          Rive: {rendererConfig.command} / {hook.expression}
        </small>
      </figcaption>
    </figure>
  );
}
