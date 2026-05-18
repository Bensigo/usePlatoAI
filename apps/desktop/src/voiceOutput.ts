export type VoiceOutputPhase = "idle" | "speaking" | "text_fallback";

export type CompanionPresenceState = "idle" | "speaking" | "muted";

export type VoiceOutputSession = {
  isMuted: boolean;
  phase: VoiceOutputPhase;
  presenceState: CompanionPresenceState;
  spokenText: string | null;
  textFallback: string;
  statusLabel: string;
};

export const mockVoiceResponse =
  "I can keep the spoken response quiet and leave the text fallback visible.";

export function createVoiceOutputSession(): VoiceOutputSession {
  return {
    isMuted: false,
    phase: "idle",
    presenceState: "idle",
    spokenText: null,
    textFallback: "Text fallback ready",
    statusLabel: "Voice ready",
  };
}

export function setVoiceOutputMuted(
  session: VoiceOutputSession,
  isMuted: boolean,
): VoiceOutputSession {
  if (!isMuted) {
    return {
      ...session,
      isMuted,
      presenceState:
        session.presenceState === "muted" ? "idle" : session.presenceState,
      statusLabel:
        session.phase === "text_fallback" ||
        session.statusLabel === "Voice muted - text fallback visible"
          ? "Voice ready"
          : session.statusLabel,
    };
  }

  return {
    ...session,
    isMuted,
    phase: session.phase === "speaking" ? "text_fallback" : session.phase,
    presenceState: "muted",
    spokenText: session.phase === "speaking" ? null : session.spokenText,
    textFallback:
      session.spokenText ?? session.textFallback ?? "Text fallback ready",
    statusLabel: "Voice muted - text fallback visible",
  };
}

export function startMockSpeech(
  session: VoiceOutputSession,
  text: string,
): VoiceOutputSession {
  if (session.isMuted) {
    return {
      ...session,
      phase: "text_fallback",
      presenceState: "muted",
      spokenText: null,
      textFallback: text,
      statusLabel: "Voice muted - text fallback visible",
    };
  }

  return {
    ...session,
    phase: "speaking",
    presenceState: "speaking",
    spokenText: text,
    textFallback: text,
    statusLabel: "Speaking mocked voice output",
  };
}

export function stopMockSpeech(session: VoiceOutputSession): VoiceOutputSession {
  if (session.phase !== "speaking") {
    return {
      ...session,
      presenceState: session.isMuted ? "muted" : "idle",
      statusLabel: session.isMuted
        ? "Voice muted - text fallback visible"
        : "Voice ready",
    };
  }

  return {
    ...session,
    phase: "idle",
    presenceState: "idle",
    spokenText: null,
    statusLabel: "Speech stopped",
  };
}
