import type { VoiceSessionState } from "./sessionRuntime";

export type VoiceAvatarState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export function voiceSessionStateToAvatarState(
  state: VoiceSessionState,
): VoiceAvatarState {
  switch (state) {
    case "listening":
      return "listening";
    case "transcribing":
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    case "muted":
      return "muted";
    case "error":
    case "unavailable":
      return "error";
    case "idle":
    case "interrupted":
      return "idle";
  }
}
