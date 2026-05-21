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

export type Live2DAvatarSurfaceHook = {
  state: AvatarPresenceState;
  label: string;
  statusText: string;
  avatarAssetPath: `/avatar/plato/${AvatarPresenceState}.png`;
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
  parameterHints: {
    eyeOpen: number;
    mouthOpen: number;
    bodyAngleX: number;
    bodyAngleY: number;
  };
};

export const live2dAvatarSurfaceHooks: Record<
  AvatarPresenceState,
  Live2DAvatarSurfaceHook
> = {
  appearing: {
    state: "appearing",
    label: "Appearing",
    statusText: "Coming online",
    avatarAssetPath: "/avatar/plato/appearing.png",
    motionGroup: "appear",
    expression: "bright",
    parameterHints: {
      eyeOpen: 1,
      mouthOpen: 0.16,
      bodyAngleX: 0,
      bodyAngleY: -4,
    },
  },
  idle: {
    state: "idle",
    label: "Idle",
    statusText: "Idle presence",
    avatarAssetPath: "/avatar/plato/idle.png",
    motionGroup: "idle",
    expression: "neutral",
    parameterHints: {
      eyeOpen: 0.82,
      mouthOpen: 0,
      bodyAngleX: 0,
      bodyAngleY: 0,
    },
  },
  listening: {
    state: "listening",
    label: "Listening",
    statusText: "Listening now",
    avatarAssetPath: "/avatar/plato/listening.png",
    motionGroup: "tap_body",
    expression: "attentive",
    parameterHints: {
      eyeOpen: 1,
      mouthOpen: 0.08,
      bodyAngleX: -5,
      bodyAngleY: 4,
    },
  },
  thinking: {
    state: "thinking",
    label: "Thinking",
    statusText: "Thinking through it",
    avatarAssetPath: "/avatar/plato/thinking.png",
    motionGroup: "thinking",
    expression: "focused",
    parameterHints: {
      eyeOpen: 0.6,
      mouthOpen: 0,
      bodyAngleX: 4,
      bodyAngleY: -3,
    },
  },
  speaking: {
    state: "speaking",
    label: "Speaking",
    statusText: "Speaking",
    avatarAssetPath: "/avatar/plato/speaking.png",
    motionGroup: "speak",
    expression: "talking",
    parameterHints: {
      eyeOpen: 0.9,
      mouthOpen: 0.72,
      bodyAngleX: 2,
      bodyAngleY: 0,
    },
  },
  waitingApproval: {
    state: "waitingApproval",
    label: "Waiting for approval",
    statusText: "Waiting for approval",
    avatarAssetPath: "/avatar/plato/waitingApproval.png",
    motionGroup: "approval",
    expression: "concerned",
    parameterHints: {
      eyeOpen: 0.72,
      mouthOpen: 0.18,
      bodyAngleX: -2,
      bodyAngleY: 2,
    },
  },
  muted: {
    state: "muted",
    label: "Muted",
    statusText: "Muted",
    avatarAssetPath: "/avatar/plato/muted.png",
    motionGroup: "quiet",
    expression: "soft",
    parameterHints: {
      eyeOpen: 0.68,
      mouthOpen: 0,
      bodyAngleX: 0,
      bodyAngleY: 3,
    },
  },
  error: {
    state: "error",
    label: "Error",
    statusText: "Needs repair",
    avatarAssetPath: "/avatar/plato/error.png",
    motionGroup: "error",
    expression: "strained",
    parameterHints: {
      eyeOpen: 0.5,
      mouthOpen: 0.22,
      bodyAngleX: -4,
      bodyAngleY: 0,
    },
  },
};

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
        className="live2d-avatar-stage"
        data-avatar-renderer="plato-mascot-asset"
        aria-hidden="true"
      >
        <img
          className="plato-avatar-asset"
          src={hook.avatarAssetPath}
          alt=""
          decoding="async"
          draggable={false}
          data-avatar-asset={hook.state}
          onError={(event) => {
            event.currentTarget
              .closest(".live2d-avatar-stage")
              ?.setAttribute("data-avatar-renderer", "fallback-presence-mark");
          }}
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
          Live2D: {hook.motionGroup} / {hook.expression}
        </small>
      </figcaption>
    </figure>
  );
}
