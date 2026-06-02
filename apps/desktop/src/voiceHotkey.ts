export const voiceListeningHotkeyLabel = "Double-tap Option";

export type VoiceListeningHotkeyEvent = Pick<
  KeyboardEvent,
  | "code"
  | "ctrlKey"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
  | "timeStamp"
  | "type"
>;

const doubleTapOptionWindowMs = 450;

function isOptionKeyTap(event: VoiceListeningHotkeyEvent) {
  return (
    event.type === "keyup" &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.code === "AltLeft" ||
      event.code === "AltRight" ||
      event.key === "Alt" ||
      event.key === "Option")
  );
}

export function createVoiceListeningHotkeyDetector(
  doubleTapWindowMs = doubleTapOptionWindowMs,
) {
  let lastOptionTapAt: number | null = null;

  return function isVoiceListeningHotkey(event: VoiceListeningHotkeyEvent) {
    if (!isOptionKeyTap(event)) {
      return false;
    }

    const isDoubleTap =
      lastOptionTapAt !== null &&
      event.timeStamp - lastOptionTapAt <= doubleTapWindowMs;

    lastOptionTapAt = isDoubleTap ? null : event.timeStamp;

    return isDoubleTap;
  };
}
