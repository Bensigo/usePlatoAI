export type VoiceSessionState = "idle" | "listening" | "thinking" | "speaking";

export type VoiceActivationSource = "voice" | "text";

export type CompanionPresenceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export type VoiceInteractionSnapshot = {
  sessionState: VoiceSessionState;
  activationSource: VoiceActivationSource;
  isMuted: boolean;
  transcript: string;
  fallbackText: string;
  response: string;
};

export const defaultVoiceInteractionSnapshot: VoiceInteractionSnapshot = {
  sessionState: "idle",
  activationSource: "voice",
  isMuted: false,
  transcript: "",
  fallbackText: "",
  response: "Ready for voice or text.",
};

export const mockVoiceTranscript = "Mock voice input: help me plan the next step.";
export const mockVoiceResponse =
  "I heard the mock request. Voice is running locally without provider credentials.";

export function companionPresenceForVoiceState(
  sessionState: VoiceSessionState,
): CompanionPresenceState {
  return sessionState;
}

export function presenceLabelForState(state: CompanionPresenceState): string {
  switch (state) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "idle":
      return "Idle presence";
  }
}

export function nextMockVoiceSnapshot(
  snapshot: VoiceInteractionSnapshot,
  sessionState: VoiceSessionState,
): VoiceInteractionSnapshot {
  if (sessionState === "listening") {
    return {
      ...snapshot,
      activationSource: "voice",
      sessionState,
      transcript: "Listening through local mock voice...",
      response: "Waiting for speech.",
    };
  }

  if (sessionState === "thinking") {
    return {
      ...snapshot,
      sessionState,
      transcript: mockVoiceTranscript,
      response: "Thinking through the mock voice request.",
    };
  }

  if (sessionState === "speaking") {
    return {
      ...snapshot,
      sessionState,
      response: snapshot.isMuted ? "Muted response ready." : mockVoiceResponse,
    };
  }

  return {
    ...snapshot,
    sessionState,
    response: "Voice session complete.",
  };
}

export function textFallbackThinkingSnapshot(
  snapshot: VoiceInteractionSnapshot,
  fallbackText: string,
): VoiceInteractionSnapshot {
  return {
    ...snapshot,
    activationSource: "text",
    sessionState: "thinking",
    fallbackText,
    transcript: fallbackText,
    response: "Reading text fallback.",
  };
}

export function textFallbackResponseSnapshot(
  snapshot: VoiceInteractionSnapshot,
): VoiceInteractionSnapshot {
  return {
    ...snapshot,
    sessionState: "speaking",
    response: snapshot.isMuted
      ? "Muted text response ready."
      : `Text fallback received: ${snapshot.fallbackText}`,
  };
}
