export type AvatarPresenceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "waiting_for_approval";

export type Live2DAvatarSurfaceHook = {
  state: AvatarPresenceState;
  label: string;
  statusText: string;
  motionGroup: "idle" | "tap_body" | "thinking" | "speak" | "approval";
  expression: "neutral" | "attentive" | "focused" | "talking" | "concerned";
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
  idle: {
    state: "idle",
    label: "Idle",
    statusText: "Idle presence",
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
    motionGroup: "speak",
    expression: "talking",
    parameterHints: {
      eyeOpen: 0.9,
      mouthOpen: 0.72,
      bodyAngleX: 2,
      bodyAngleY: 0,
    },
  },
  waiting_for_approval: {
    state: "waiting_for_approval",
    label: "Waiting for approval",
    statusText: "Waiting for approval",
    motionGroup: "approval",
    expression: "concerned",
    parameterHints: {
      eyeOpen: 0.72,
      mouthOpen: 0.18,
      bodyAngleX: -2,
      bodyAngleY: 2,
    },
  },
};

export function isAvatarPresenceState(
  value: string | null,
): value is AvatarPresenceState {
  return value !== null && value in live2dAvatarSurfaceHooks;
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
      <div className="live2d-avatar-stage" aria-hidden="true">
        <div className="live2d-avatar-hair" />
        <div className="live2d-avatar-head">
          <span className="live2d-avatar-eye live2d-avatar-eye-left" />
          <span className="live2d-avatar-eye live2d-avatar-eye-right" />
          <span className="live2d-avatar-mouth" />
        </div>
        <div className="live2d-avatar-body" />
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
