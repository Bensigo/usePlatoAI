import type { PresenceDragMode } from "./presencePosition";
import type { VoiceSessionState } from "./voiceInteraction";

export type CompanionVoiceActivationTrigger =
  | "hotkey"
  | "avatar-click"
  | "avatar-double-click"
  | "wake-name";

export type CompanionVoiceActivationIntent = "start" | "interrupt" | "ignore";

const interruptibleVoiceStates = new Set<VoiceSessionState>([
  "listening",
  "transcribing",
  "thinking",
  "speaking",
]);

export function companionVoiceActivationIntent({
  trigger,
  voiceSessionState,
  presenceDragMode,
}: {
  trigger: CompanionVoiceActivationTrigger;
  voiceSessionState: VoiceSessionState;
  presenceDragMode: PresenceDragMode;
}): CompanionVoiceActivationIntent {
  if (trigger === "avatar-double-click") {
    return "ignore";
  }

  if (trigger === "avatar-click" && presenceDragMode === "draggable") {
    return "ignore";
  }

  if (interruptibleVoiceStates.has(voiceSessionState)) {
    return "interrupt";
  }

  return voiceSessionState === "idle" ? "start" : "ignore";
}

export function shouldDelayAvatarVoiceActivation(
  trigger: CompanionVoiceActivationTrigger,
) {
  return trigger === "avatar-click";
}
