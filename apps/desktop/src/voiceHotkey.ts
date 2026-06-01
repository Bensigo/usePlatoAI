export const voiceListeningHotkeyLabel = "Shift+Command+Space";

export type VoiceListeningHotkeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

export function isVoiceListeningHotkey(event: VoiceListeningHotkeyEvent) {
  return (
    !event.repeat &&
    event.shiftKey &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    (event.code === "Space" || event.key === " ")
  );
}
