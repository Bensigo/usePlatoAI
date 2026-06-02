export type TextToSpeechProviderId = "apple-local-tts" | "openai-tts";

export type TextToSpeechProviderAvailabilityState =
  | "supported"
  | "unavailable"
  | "error";

export type TextToSpeechProviderCost = "free-local" | "paid-remote";

export type TextToSpeechProviderPrivacy = "local-device" | "remote-api";

export type TextToSpeechProviderDescriptor = {
  providerId: TextToSpeechProviderId;
  displayName: string;
  cost: TextToSpeechProviderCost;
  privacy: TextToSpeechProviderPrivacy;
  requiresPaidBilling: boolean;
};

export const textToSpeechProviderAvailabilityStates = [
  "supported",
  "unavailable",
  "error",
] as const satisfies readonly TextToSpeechProviderAvailabilityState[];

export const appleLocalTextToSpeechProvider = {
  providerId: "apple-local-tts",
  displayName: "Apple local voices",
  cost: "free-local",
  privacy: "local-device",
  requiresPaidBilling: false,
} as const satisfies TextToSpeechProviderDescriptor;

export const openAiTextToSpeechProvider = {
  providerId: "openai-tts",
  displayName: "OpenAI TTS",
  cost: "paid-remote",
  privacy: "remote-api",
  requiresPaidBilling: true,
} as const satisfies TextToSpeechProviderDescriptor;

export const textToSpeechProviderDescriptors = [
  appleLocalTextToSpeechProvider,
  openAiTextToSpeechProvider,
] as const satisfies readonly TextToSpeechProviderDescriptor[];

export function isTextToSpeechProviderId(
  value: string | null | undefined,
): value is TextToSpeechProviderId {
  return textToSpeechProviderDescriptors.some(
    (provider) => provider.providerId === value,
  );
}

export function resolveTextToSpeechProvider({
  preferredProviderId,
  paidTtsOptIn,
}: {
  preferredProviderId?: string | null;
  paidTtsOptIn: boolean;
}): TextToSpeechProviderDescriptor {
  const preferredProvider = textToSpeechProviderDescriptors.find(
    (provider) => provider.providerId === preferredProviderId,
  );

  if (!preferredProvider) {
    return appleLocalTextToSpeechProvider;
  }

  if (preferredProvider.requiresPaidBilling && !paidTtsOptIn) {
    return appleLocalTextToSpeechProvider;
  }

  return preferredProvider;
}

export function textToSpeechProviderLabelForAvailability(
  state: TextToSpeechProviderAvailabilityState,
) {
  switch (state) {
    case "supported":
      return "Supported";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
  }
}

export type {
  VoiceAudioPlaybackAdapter,
  VoiceMicrophoneInputAdapter,
  VoiceProviderAvailabilityInput,
  VoiceProviderAvailabilityAdapter,
  VoiceProviderAvailabilityResult,
  VoiceResponseGenerationAdapter,
  VoiceRuntimeAdapterError,
  VoiceRuntimeAdapterFailure,
  VoiceRuntimeAdapterResult,
  VoiceRuntimeAdapterSuccess,
  VoiceRuntimeOperationContext,
  VoiceRuntimeStopInput,
  VoiceSessionAdapters,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
} from "./adapters";
export { voiceRuntimeError } from "./adapters";
export type { VoiceAvatarState } from "./avatarMapping";
export { voiceSessionStateToAvatarState } from "./avatarMapping";
export type {
  CreateVoiceSessionRuntimeInput,
  VoiceActivationSource as VoiceRuntimeActivationSource,
  VoiceSessionRuntime,
  VoiceSessionSnapshot,
  VoiceSessionState,
  VoiceSessionState as VoiceRuntimeSessionState,
} from "./sessionRuntime";
export {
  createVoiceSessionRuntime,
  voiceSessionStateFrom as voiceRuntimeSessionStateFrom,
  voiceSessionStates,
} from "./sessionRuntime";
