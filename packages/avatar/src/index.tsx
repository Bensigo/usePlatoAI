import { useRive } from "@rive-app/react-canvas";

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
  playback: "user-activated",
} as const;

type RiveRendererConfig = {
  primaryRenderer: "rive";
  companionState: AvatarCompanionState;
  command: AvatarAnimationCommand;
  rive: {
    src: string;
    stateMachine: "Plato Companion";
    animation: string;
  };
  fallback: {
    renderer: "svg";
    src: string;
  };
};

const animationByState = {
  startup: {
    command: "startup.appear",
    animation: "appear",
  },
  greet: {
    command: "greet.wave",
    animation: "wave",
  },
  idle: {
    command: "idle.breathe",
    animation: "livingIdle",
  },
  happy: {
    command: "mood.smile",
    animation: "smile",
  },
  sad: {
    command: "mood.sad",
    animation: "sad",
  },
  talking: {
    command: "voice.talk",
    animation: "talk",
  },
  celebrating: {
    command: "celebration.dance",
    animation: "dance",
  },
} as const satisfies Record<
  AvatarCompanionState,
  { command: AvatarAnimationCommand; animation: string }
>;

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
      stateMachine: "Plato Companion",
      animation: animation.animation,
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
  stateMachines: string;
  animations: string;
};

function BrowserRiveCanvas({
  className,
  src,
  stateMachines,
  animations,
}: BrowserRiveCanvasProps) {
  const { RiveComponent } = useRive({
    src,
    stateMachines,
    animations,
    autoplay: true,
  });

  if (typeof window === "undefined") {
    return (
      <canvas
        className={className}
        data-rive-src={src}
        data-rive-state-machine={stateMachines}
        data-rive-animation={animations}
      />
    );
  }

  return (
    <RiveComponent
      className={className}
      data-rive-src={src}
      data-rive-state-machine={stateMachines}
      data-rive-animation={animations}
    />
  );
}

export function AvatarRenderer({
  companionState,
}: {
  companionState: AvatarCompanionState;
}) {
  const config = getAvatarRendererConfig(companionState);

  return (
    <div
      className="plato-rive-avatar"
      data-avatar-package="@useplatoai/avatar"
      data-avatar-renderer={config.primaryRenderer}
      data-rive-state-machine={config.rive.stateMachine}
      data-rive-animation={config.rive.animation}
      data-fallback-renderer={config.fallback.renderer}
      data-fallback-src={config.fallback.src}
    >
      <BrowserRiveCanvas
        className="plato-rive-canvas"
        src={config.rive.src}
        stateMachines={config.rive.stateMachine}
        animations={config.rive.animation}
      />
      <img
        className="plato-avatar-asset plato-avatar-fallback-asset"
        src={config.fallback.src}
        alt=""
        decoding="async"
        draggable={false}
        data-avatar-fallback-surface="commercial-safe-mascot"
      />
    </div>
  );
}

export function Live2DAvatarSurface({
  presenceState,
}: {
  presenceState: AvatarPresenceState;
}) {
  const hook = getLive2DAvatarSurfaceHook(presenceState);

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
        data-rive-asset={hook.rendererConfig.rive.src}
        aria-hidden="true"
      >
        <AvatarRenderer companionState={hook.companionState} />
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
          Rive: {hook.rendererConfig.command} / {hook.expression}
        </small>
      </figcaption>
    </figure>
  );
}
