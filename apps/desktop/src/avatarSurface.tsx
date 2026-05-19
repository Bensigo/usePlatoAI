import type { CSSProperties } from "react";

import platoGeneratedSpriteUrl from "./assets/plato-realistic-generated-sprite.png";

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
  spriteFrame: {
    src: string;
    name: AvatarPresenceState;
    index: 0 | 1 | 2 | 3 | 4;
    count: 5;
  };
  parameterHints: {
    eyeOpen: number;
    mouthOpen: number;
    bodyAngleX: number;
    bodyAngleY: number;
  };
};

const generatedSpriteFrameCount = 5;

function generatedSpriteFrame(
  name: AvatarPresenceState,
  index: 0 | 1 | 2 | 3 | 4,
): Live2DAvatarSurfaceHook["spriteFrame"] {
  return {
    src: platoGeneratedSpriteUrl,
    name,
    index,
    count: generatedSpriteFrameCount,
  };
}

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
    spriteFrame: generatedSpriteFrame("idle", 0),
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
    spriteFrame: generatedSpriteFrame("listening", 1),
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
    spriteFrame: generatedSpriteFrame("thinking", 2),
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
    spriteFrame: generatedSpriteFrame("speaking", 3),
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
    spriteFrame: generatedSpriteFrame("waiting_for_approval", 4),
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
      data-sprite-frame={hook.spriteFrame.name}
      data-sprite-frame-index={hook.spriteFrame.index}
      aria-label={`Plato avatar surface: ${hook.statusText}`}
    >
      <div
        className="live2d-avatar-stage"
        aria-hidden="true"
        style={
          {
            "--plato-avatar-sprite-frame-index": hook.spriteFrame.index,
          } as CSSProperties
        }
      >
        <img
          className="live2d-avatar-sprite"
          src={hook.spriteFrame.src}
          alt=""
          draggable={false}
        />
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
