import { describe, expect, it } from "vitest";

import {
  appleLocalTextToSpeechProvider,
  openAiTextToSpeechProvider,
  resolveTextToSpeechProvider,
  textToSpeechProviderAvailabilityStates,
  textToSpeechProviderDescriptors,
  textToSpeechProviderLabelForAvailability,
} from "../src";

describe("text-to-speech provider selection", () => {
  it("exposes Apple local TTS as the default no-paid macOS provider", () => {
    expect(textToSpeechProviderAvailabilityStates).toEqual([
      "supported",
      "unavailable",
      "error",
    ]);
    expect(appleLocalTextToSpeechProvider).toMatchObject({
      providerId: "apple-local-tts",
      displayName: "Apple local voices",
      cost: "free-local",
      privacy: "local-device",
      requiresPaidBilling: false,
    });
    expect(textToSpeechProviderDescriptors[0]).toBe(
      appleLocalTextToSpeechProvider,
    );
  });

  it("keeps OpenAI TTS selectable only as a paid remote provider", () => {
    expect(openAiTextToSpeechProvider).toMatchObject({
      providerId: "openai-tts",
      displayName: "OpenAI TTS",
      cost: "paid-remote",
      privacy: "remote-api",
      requiresPaidBilling: true,
    });
  });

  it("routes no-paid output to Apple local TTS even if OpenAI was requested", () => {
    expect(
      resolveTextToSpeechProvider({
        preferredProviderId: "openai-tts",
        paidTtsOptIn: false,
      }),
    ).toEqual(appleLocalTextToSpeechProvider);
  });

  it("allows OpenAI TTS only after paid TTS opt-in", () => {
    expect(
      resolveTextToSpeechProvider({
        preferredProviderId: "openai-tts",
        paidTtsOptIn: true,
      }),
    ).toEqual(openAiTextToSpeechProvider);
  });

  it("labels supported, unavailable, and error availability states clearly", () => {
    expect(textToSpeechProviderLabelForAvailability("supported")).toBe(
      "Supported",
    );
    expect(textToSpeechProviderLabelForAvailability("unavailable")).toBe(
      "Unavailable",
    );
    expect(textToSpeechProviderLabelForAvailability("error")).toBe("Error");
  });
});
