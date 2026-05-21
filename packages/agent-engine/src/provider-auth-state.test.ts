import { describe, expect, it } from "vitest";

import {
  createApiKeyProviderAuthState,
  createProviderSecretReference,
  getProviderAuthAvailabilitySnapshot,
  readProviderSecret,
  type LocalModelEndpointProviderAuthState,
  type LocalSdkProviderAuthState,
  type ModelProvider,
  type SecretReference,
  type SecretStore,
  type SubscriptionLocalProviderAuthState,
} from "./index.js";

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  write(reference: SecretReference, value: string): void {
    this.values.set(reference.id, value);
  }

  read(reference: SecretReference): string | null {
    return this.values.get(reference.id) ?? null;
  }
}

describe("provider auth state", () => {
  it("creates secret references through the secret-store abstraction", async () => {
    const secretStore = new MemorySecretStore();

    const authState = await createApiKeyProviderAuthState({
      providerId: "openai",
      providerDisplayName: "OpenAI",
      apiKey: "sk-live-secret",
      secretStore,
    });

    expect(authState).toEqual({
      mode: "api_key",
      secretReference: {
        store: "secret_store",
        id: "provider:openai:api_key",
        description: "OpenAI API key",
      },
    });
    expect(secretStore.values.get(authState.secretReference.id)).toBe(
      "sk-live-secret",
    );
    expect(JSON.stringify(authState)).not.toContain("sk-live-secret");
  });

  it("looks up provider credentials by secret reference", async () => {
    const secretStore = new MemorySecretStore();
    const reference = createProviderSecretReference({
      providerId: "anthropic",
      authMode: "api_key",
      description: "Anthropic API key",
    });

    secretStore.write(reference, "anthropic-secret");

    await expect(readProviderSecret(secretStore, reference)).resolves.toBe(
      "anthropic-secret",
    );
  });

  it("reports missing secrets without leaking credential values", async () => {
    const secretStore = new MemorySecretStore();
    const authState = {
      mode: "api_key",
      secretReference: createProviderSecretReference({
        providerId: "openai",
        authMode: "api_key",
        description: "OpenAI API key",
      }),
    } as const;

    await expect(
      getProviderAuthAvailabilitySnapshot(authState, secretStore),
    ).resolves.toEqual({
      mode: "api_key",
      availability: "missing_secret",
      hasSecretReference: true,
    });
  });

  it("represents API-key auth as a provider record with a secret reference only", async () => {
    const secretStore = new MemorySecretStore();
    const authState = await createApiKeyProviderAuthState({
      providerId: "openai",
      providerDisplayName: "OpenAI",
      apiKey: "sk-live-secret",
      secretStore,
    });
    const provider: ModelProvider = {
      id: "openai",
      displayName: "OpenAI",
      kind: "openai",
      authMode: "api_key",
      authState,
    };

    await expect(
      getProviderAuthAvailabilitySnapshot(provider.authState!, secretStore),
    ).resolves.toEqual({
      mode: "api_key",
      availability: "ready",
      hasSecretReference: true,
    });
    expect(JSON.stringify(provider)).not.toContain("sk-live-secret");
  });

  it("represents local SDK auth without storing app-owned credentials", async () => {
    const authState: LocalSdkProviderAuthState = {
      mode: "local_sdk_auth",
      sdkName: "Claude Code",
      isAuthenticated: true,
      accountHint: "user@example.com",
    };

    await expect(getProviderAuthAvailabilitySnapshot(authState)).resolves.toEqual(
      {
        mode: "local_sdk_auth",
        availability: "ready",
        hasSecretReference: false,
        accountHint: "user@example.com",
      },
    );
  });

  it("represents subscription-backed local auth distinctly", async () => {
    const authState: SubscriptionLocalProviderAuthState = {
      mode: "subscription_local_auth",
      subscriptionName: "Claude Pro",
      isAuthenticated: false,
    };

    await expect(getProviderAuthAvailabilitySnapshot(authState)).resolves.toEqual(
      {
        mode: "subscription_local_auth",
        availability: "missing_local_auth",
        hasSecretReference: false,
      },
    );
  });

  it("represents local model endpoints as non-secret endpoint metadata", async () => {
    const authState: LocalModelEndpointProviderAuthState = {
      mode: "local_model_endpoint",
      endpoint: "http://localhost:11434",
    };

    await expect(getProviderAuthAvailabilitySnapshot(authState)).resolves.toEqual(
      {
        mode: "local_model_endpoint",
        availability: "ready",
        hasSecretReference: false,
        endpoint: "http://localhost:11434",
      },
    );
  });
});
