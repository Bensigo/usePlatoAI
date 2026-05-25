import {
  avatarSpeakingControlsForFrame,
  type AvatarCompanionState,
  type AvatarPresenceState,
  type AvatarRuntimeControls,
  type AvatarSpeechCue,
} from "./avatarSurface";

export type AgentOutputAvatarPhase = "idle" | "speaking" | "text_fallback";
export type AgentOutputMode = "audio" | "text_fallback";

export type AgentOutputAvatarSnapshot = {
  phase: AgentOutputAvatarPhase;
  presenceState: AvatarPresenceState;
  companionStateOverride: AvatarCompanionState | null;
  runtimeControlsOverride: AvatarRuntimeControls | null;
  frameIndex: number;
  responseText: string;
  textFallback: string;
  cue: AvatarSpeechCue;
};

export function agentOutputAvatarCueForText(text: string): AvatarSpeechCue {
  const normalizedText = text.toLowerCase();

  if (
    /\b(ha+ha+|lol|laugh(?:ing)?|funny|joke|kidding)\b/.test(normalizedText)
  ) {
    return "laugh";
  }

  if (
    /\b(yes|yeah|sure|absolutely|good|great|nice|done|approved|happy|glad)\b/.test(
      normalizedText,
    )
  ) {
    return "smile";
  }

  return "neutral";
}

export function agentOutputAvatarReactionForCue(
  cue: AvatarSpeechCue,
): AvatarCompanionState | null {
  if (cue === "laugh") {
    return "laugh";
  }

  if (cue === "smile") {
    return "smile";
  }

  return null;
}

export function agentOutputAvatarReactionForText(
  text: string,
): AvatarCompanionState | null {
  return agentOutputAvatarReactionForCue(agentOutputAvatarCueForText(text));
}

export function createAgentOutputAvatarSnapshot(): AgentOutputAvatarSnapshot {
  return {
    phase: "idle",
    presenceState: "idle",
    companionStateOverride: null,
    runtimeControlsOverride: null,
    frameIndex: 0,
    responseText: "",
    textFallback: "",
    cue: "neutral",
  };
}

export function startAgentOutputAvatar({
  isMuted,
  mode = "audio",
  initialText = "",
}: {
  isMuted: boolean;
  mode?: AgentOutputMode;
  initialText?: string;
}): AgentOutputAvatarSnapshot {
  const cue = agentOutputAvatarCueForText(initialText);

  if (isMuted || mode === "text_fallback") {
    return {
      ...createAgentOutputAvatarSnapshot(),
      phase: "text_fallback",
      presenceState: isMuted ? "muted" : "idle",
      responseText: initialText,
      textFallback: initialText,
      cue,
    };
  }

  return {
    ...createAgentOutputAvatarSnapshot(),
    phase: "speaking",
    presenceState: "speaking",
    companionStateOverride: "speaking",
    runtimeControlsOverride: avatarSpeakingControlsForFrame({
      frameIndex: 0,
      cue,
    }),
    responseText: initialText,
    textFallback: initialText,
    cue,
  };
}

export function progressAgentOutputAvatar(
  snapshot: AgentOutputAvatarSnapshot,
  {
    deltaText = "",
    frameIndex = snapshot.frameIndex + 1,
  }: {
    deltaText?: string;
    frameIndex?: number;
  } = {},
): AgentOutputAvatarSnapshot {
  const responseText = `${snapshot.responseText}${deltaText}`;
  const cue = agentOutputAvatarCueForText(responseText);

  if (snapshot.phase !== "speaking") {
    return {
      ...snapshot,
      responseText,
      textFallback: responseText || snapshot.textFallback,
      cue,
      runtimeControlsOverride: null,
    };
  }

  return {
    ...snapshot,
    frameIndex,
    responseText,
    textFallback: responseText,
    cue,
    companionStateOverride: "speaking",
    runtimeControlsOverride: avatarSpeakingControlsForFrame({
      frameIndex,
      cue,
    }),
  };
}

export function completeAgentOutputAvatar(
  snapshot: AgentOutputAvatarSnapshot,
  {
    nextPresenceState = "idle",
  }: {
    nextPresenceState?: Extract<AvatarPresenceState, "idle" | "listening">;
  } = {},
): AgentOutputAvatarSnapshot {
  const reaction =
    snapshot.presenceState === "muted"
      ? null
      : agentOutputAvatarReactionForCue(snapshot.cue);

  return {
    ...snapshot,
    phase: "idle",
    presenceState:
      snapshot.presenceState === "muted" ? "muted" : nextPresenceState,
    companionStateOverride: reaction,
    runtimeControlsOverride: null,
  };
}

export function runtimeControlsForAgentOutputFrame({
  frameIndex,
  responseText,
}: {
  frameIndex: number;
  responseText: string;
}) {
  return avatarSpeakingControlsForFrame({
    frameIndex,
    cue: agentOutputAvatarCueForText(responseText),
  });
}
