import "./styles.css";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  controlSurfaceEntries,
  isControlSurfaceId,
  type ControlSurfaceId,
} from "./controlSurface";
import {
  createTauriSettingsStore,
  defaultCompanionSettings,
  providerPlaceholderLabel,
  type CompanionSettings,
  type ExecutionAuthority,
  type LaunchBehavior,
  type MemoryMode,
  type ProviderPlaceholder,
  type SettingsStore,
} from "./settings";
import {
  createTauriTrustFoundationStore,
  defaultTrustFoundationSnapshot,
  snapshotWithExecutionAuthority,
  type TrustFoundationSnapshot,
  type TrustFoundationStore,
} from "./trustFoundation";
import {
  createVoiceOutputSession,
  mockVoiceResponse,
  setVoiceOutputMuted,
  startMockSpeech,
  stopMockSpeech,
} from "./voiceOutput";

function startPresenceDrag(event: MouseEvent<HTMLButtonElement>) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  void getCurrentWindow().startDragging();
}

export function DismissedPresence({ onRestore }: { onRestore: () => void }) {
  return (
    <section className="restore-card" aria-label="Plato presence hidden">
      <p id="restore-title">Plato is hidden</p>
      <button className="restore-button" type="button" onClick={onRestore}>
        Show Plato presence
      </button>
    </section>
  );
}

export function ControlSurfacePanel({
  activeEntry,
  settings,
  onSettingsChange,
  trustFoundationStore,
}: {
  activeEntry: ControlSurfaceId;
  settings?: CompanionSettings;
  onSettingsChange?: (settings: CompanionSettings) => Promise<void>;
  trustFoundationStore?: TrustFoundationStore;
}) {
  const activeControl = controlSurfaceEntries.find(
    (entry) => entry.id === activeEntry,
  )!;

  return (
    <section className="placeholder-panel" aria-live="polite">
      <p className="status-label">
        {activeEntry === "settings" ? "Local settings" : "Placeholder panel"}
      </p>
      <h2>{activeControl.label}</h2>
      <p>{activeControl.description}</p>
      {activeEntry === "settings" && settings ? (
        onSettingsChange ? (
          <TrustFoundationSettings
            settings={settings}
            onSettingsChange={onSettingsChange}
            trustFoundationStore={trustFoundationStore}
          />
        ) : (
          <SettingsSummary settings={settings} />
        )
      ) : (
        <p className="placeholder-note">
          This area is reachable from the macOS menu bar now. The underlying
          feature is intentionally not implemented in this slice.
        </p>
      )}
    </section>
  );
}

export function TrustFoundationSettings({
  settings,
  onSettingsChange,
  trustFoundationStore,
}: {
  settings: CompanionSettings;
  onSettingsChange: (settings: CompanionSettings) => Promise<void>;
  trustFoundationStore?: TrustFoundationStore;
}) {
  const durableTrustFoundationStore = useMemo(
    () => trustFoundationStore ?? createTauriTrustFoundationStore(),
    [trustFoundationStore],
  );
  const [snapshot, setSnapshot] = useState<TrustFoundationSnapshot>(() =>
    defaultTrustFoundationSnapshot(settings),
  );
  const [credential, setCredential] = useState("");
  const [message, setMessage] = useState("Local data state loaded");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    durableTrustFoundationStore
      .read()
      .then((nextSnapshot) => {
        if (isCurrent) {
          setSnapshot(nextSnapshot);
          setMessage("Local data state loaded");
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load local data state",
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [durableTrustFoundationStore, settings]);

  async function saveExecutionAuthority(
    mode: CompanionSettings["executionAuthority"],
  ) {
    const nextSettings = { ...settings, executionAuthority: mode };
    setIsSaving(true);
    try {
      await onSettingsChange(nextSettings);
      const nextSnapshot = await durableTrustFoundationStore.read();
      setSnapshot(snapshotWithExecutionAuthority(nextSnapshot, mode));
      setMessage("Execution authority saved");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save execution authority",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCredential = credential.trim();

    if (!trimmedCredential) {
      setMessage("Credential cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      setSnapshot(
        await durableTrustFoundationStore.saveOpenAiCredential(trimmedCredential),
      );
      setCredential("");
      setMessage("OpenAI credential saved without revealing the value");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save credential",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCredential() {
    setIsSaving(true);
    try {
      setSnapshot(await durableTrustFoundationStore.removeOpenAiCredential());
      setMessage("OpenAI credential removed");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to remove credential",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="trust-settings">
      <SettingsSummary settings={settings} />

      <section className="trust-section" aria-labelledby="local-data-title">
        <h3 id="local-data-title">Local data</h3>
        <div className="category-grid">
          {snapshot.localData.categories.map((category) => (
            <div className="category-row" key={category.categoryId}>
              <div>
                <strong>{category.label}</strong>
                <span>{category.storage}</span>
              </div>
              <span className="category-status">
                {category.recordCount} / {category.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="trust-section" aria-labelledby="memory-status-title">
        <h3 id="memory-status-title">Memory status</h3>
        <dl className="compact-facts">
          <div>
            <dt>Mode</dt>
            <dd>{snapshot.localData.memoryStatus.mode}</dd>
          </div>
          <div>
            <dt>Records</dt>
            <dd>{snapshot.localData.memoryStatus.recordCount}</dd>
          </div>
          <div>
            <dt>Intelligence</dt>
            <dd>{snapshot.localData.memoryStatus.intelligenceStatus}</dd>
          </div>
        </dl>
      </section>

      <section className="trust-section" aria-labelledby="credential-title">
        <h3 id="credential-title">Provider credential</h3>
        <dl className="compact-facts">
          <div>
            <dt>Provider</dt>
            <dd>{snapshot.providerCredential.displayName}</dd>
          </div>
          <div>
            <dt>Presence</dt>
            <dd>{snapshot.providerCredential.hasSecret ? "Saved" : "Missing"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{snapshot.providerCredential.authStatus}</dd>
          </div>
        </dl>
        <form className="credential-form" onSubmit={saveCredential}>
          <input
            aria-label="OpenAI credential"
            type="password"
            value={credential}
            placeholder="OpenAI API key"
            onChange={(event) => setCredential(event.currentTarget.value)}
          />
          <button type="submit" disabled={isSaving}>
            Save
          </button>
          <button type="button" disabled={isSaving} onClick={removeCredential}>
            Remove
          </button>
        </form>
      </section>

      <section className="trust-section" aria-labelledby="authority-title">
        <h3 id="authority-title">Execution authority</h3>
        <div
          className="segmented-control"
          role="group"
          aria-label="Execution authority"
        >
          <button
            type="button"
            className={
              settings.executionAuthority === "ask-first" ? "active" : undefined
            }
            disabled={isSaving}
            onClick={() => saveExecutionAuthority("ask-first")}
          >
            Ask first
          </button>
          <button
            type="button"
            className={
              settings.executionAuthority === "trusted-local" ? "active" : undefined
            }
            disabled={isSaving}
            onClick={() => saveExecutionAuthority("trusted-local")}
          >
            Trusted local
          </button>
        </div>
        <dl className="compact-facts">
          <div>
            <dt>Local files</dt>
            <dd>{snapshot.executionAuthority.localFileChange}</dd>
          </div>
          <div>
            <dt>App control</dt>
            <dd>{snapshot.executionAuthority.appControl}</dd>
          </div>
          <div>
            <dt>External actions</dt>
            <dd>{snapshot.executionAuthority.externalMessage}</dd>
          </div>
        </dl>
      </section>

      <section className="trust-section" aria-labelledby="audit-title">
        <h3 id="audit-title">Audit/history</h3>
        {snapshot.auditHistory.length > 0 ? (
          <ol className="audit-list">
            {snapshot.auditHistory.slice(0, 4).map((entry) => (
              <li key={entry.auditId}>
                <strong>{entry.category}</strong>
                <span>{entry.action}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">No audit entries recorded yet</p>
        )}
      </section>

      <p className="trust-message" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

export function SettingsSummary({ settings }: { settings: CompanionSettings }) {
  return (
    <dl className="settings-summary" aria-label="Saved companion settings">
      <div>
        <dt>Companion</dt>
        <dd>{settings.companionName}</dd>
      </div>
      <div>
        <dt>Wake name</dt>
        <dd>{settings.wakeName}</dd>
      </div>
      <div>
        <dt>Launch behavior</dt>
        <dd>
          {settings.launchBehavior === "launch-at-login"
            ? "Launch at login"
            : "Manual-only"}
        </dd>
      </div>
      <div>
        <dt>Memory mode</dt>
        <dd>{settings.memoryMode === "enabled" ? "Memory on" : "Paused"}</dd>
      </div>
      <div>
        <dt>Execution authority</dt>
        <dd>
          {settings.executionAuthority === "ask-first"
            ? "Ask first"
            : "Trusted local actions"}
        </dd>
      </div>
      <div>
        <dt>Provider placeholder</dt>
        <dd>{providerPlaceholderLabel(settings.providerPlaceholder)}</dd>
      </div>
    </dl>
  );
}

export function FirstRunOnboarding({
  initialSettings,
  onComplete,
}: {
  initialSettings: CompanionSettings;
  onComplete: (settings: CompanionSettings) => void | Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const settings: CompanionSettings = {
      companionName:
        formData.get("companionName")?.toString().trim() ||
        defaultCompanionSettings.companionName,
      wakeName:
        formData.get("wakeName")?.toString().trim() ||
        defaultCompanionSettings.wakeName,
      launchBehavior: formData.get("launchBehavior") as LaunchBehavior,
      memoryMode: formData.get("memoryMode") as MemoryMode,
      executionAuthority: formData.get(
        "executionAuthority",
      ) as ExecutionAuthority,
      providerPlaceholder: formData.get(
        "providerPlaceholder",
      ) as ProviderPlaceholder,
      onboardingComplete: true,
    };

    try {
      setIsSaving(true);
      await onComplete(settings);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="onboarding-panel" aria-labelledby="onboarding-title">
      <p className="product-name">usePlatoAI</p>
      <h1 id="onboarding-title">First-run setup</h1>
      <form className="onboarding-form" onSubmit={completeOnboarding}>
        <label>
          <span>Companion name</span>
          <input
            name="companionName"
            defaultValue={initialSettings.companionName}
            autoComplete="off"
          />
        </label>

        <label>
          <span>Wake name</span>
          <input
            name="wakeName"
            defaultValue={initialSettings.wakeName}
            autoComplete="off"
          />
        </label>

        <fieldset>
          <legend>Launch behavior</legend>
          <label>
            <input
              type="radio"
              name="launchBehavior"
              value="launch-at-login"
              defaultChecked={
                initialSettings.launchBehavior === "launch-at-login"
              }
            />
            <span>Launch at login</span>
          </label>
          <label>
            <input
              type="radio"
              name="launchBehavior"
              value="manual-only"
              defaultChecked={initialSettings.launchBehavior === "manual-only"}
            />
            <span>Manual-only</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Memory mode</legend>
          <label>
            <input
              type="radio"
              name="memoryMode"
              value="enabled"
              defaultChecked={initialSettings.memoryMode === "enabled"}
            />
            <span>Memory on</span>
          </label>
          <label>
            <input
              type="radio"
              name="memoryMode"
              value="paused"
              defaultChecked={initialSettings.memoryMode === "paused"}
            />
            <span>Paused</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Execution authority</legend>
          <label>
            <input
              type="radio"
              name="executionAuthority"
              value="ask-first"
              defaultChecked={initialSettings.executionAuthority === "ask-first"}
            />
            <span>Ask first</span>
          </label>
          <label>
            <input
              type="radio"
              name="executionAuthority"
              value="trusted-local"
              defaultChecked={
                initialSettings.executionAuthority === "trusted-local"
              }
            />
            <span>Trusted local actions</span>
          </label>
        </fieldset>

        <label>
          <span>Provider placeholder</span>
          <select
            name="providerPlaceholder"
            defaultValue={initialSettings.providerPlaceholder}
          >
            <option value="configure-later">Configure later</option>
            <option value="openai-api-key">OpenAI API key later</option>
            <option value="claude-sdk">Claude local SDK auth later</option>
            <option value="local-model">Local model later</option>
          </select>
        </label>

        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving setup" : "Save setup"}
        </button>
      </form>
    </section>
  );
}

export function App({
  initialSettings,
  settingsStore,
  trustFoundationStore,
}: {
  initialSettings?: CompanionSettings;
  settingsStore?: SettingsStore;
  trustFoundationStore?: TrustFoundationStore;
}) {
  const durableSettingsStore = useMemo(
    () => settingsStore ?? createTauriSettingsStore(),
    [settingsStore],
  );
  const [activeEntry, setActiveEntry] = useState<ControlSurfaceId>("settings");
  const [isDismissed, setIsDismissed] = useState(false);
  const [settings, setSettings] = useState<CompanionSettings>(
    () => initialSettings ?? defaultCompanionSettings,
  );
  const [voiceSession, setVoiceSession] = useState(createVoiceOutputSession);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(
    () => initialSettings !== undefined,
  );

  useEffect(() => {
    if (initialSettings) {
      return;
    }

    let isCurrent = true;

    durableSettingsStore
      .read()
      .then((savedSettings) => {
        if (isCurrent) {
          setSettings(savedSettings);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSettings(defaultCompanionSettings);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsSettingsLoaded(true);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [initialSettings, durableSettingsStore]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let dispose: (() => void) | undefined;

    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<ControlSurfaceId>("plato-control-surface://open", (event) => {
          if (isControlSurfaceId(event.payload)) {
            setActiveEntry(event.payload);
          }
        }),
      )
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch(() => {
        // The shell remains testable in a browser without the Tauri runtime.
      });

    return () => {
      dispose?.();
    };
  }, []);

  async function completeOnboarding(updatedSettings: CompanionSettings) {
    await durableSettingsStore.save(updatedSettings);
    setSettings(updatedSettings);
  }

  if (!isSettingsLoaded) {
    return (
      <main className="presence-shell">
        <section className="onboarding-panel" aria-live="polite">
          <p className="product-name">usePlatoAI</p>
          <h1>Loading setup</h1>
        </section>
      </main>
    );
  }

  if (!settings.onboardingComplete) {
    return (
      <main className="presence-shell">
        <FirstRunOnboarding
          initialSettings={settings}
          onComplete={completeOnboarding}
        />
      </main>
    );
  }

  return (
    <main className="presence-shell" aria-labelledby="presence-title">
      {isDismissed ? (
        <DismissedPresence onRestore={() => setIsDismissed(false)} />
      ) : (
        <section className="presence-card" aria-label="Floating Plato presence">
          <div className="presence-controls">
            <button
              className="drag-handle"
              type="button"
              onMouseDown={startPresenceDrag}
              aria-label="Drag Plato presence"
            >
              <span aria-hidden="true" />
            </button>
            <button
              className="hide-button"
              type="button"
              onClick={() => setIsDismissed(true)}
              aria-label="Hide Plato presence"
            >
              x
            </button>
          </div>

          <div className="avatar-placeholder" aria-hidden="true">
            <div className="avatar-face">
              <span className="avatar-eye" />
              <span className="avatar-eye" />
            </div>
          </div>

          <div className="presence-copy">
            <p className="product-name">usePlatoAI</p>
            <h1 id="presence-title">{settings.companionName}</h1>
            <p className="status-label">
              {voiceSession.presenceState === "speaking"
                ? "Speaking presence"
                : "Idle presence"}
            </p>
            <p className="wake-name">Wake name: {settings.wakeName}</p>
          </div>

          <section className="voice-output-panel" aria-label="Voice output controls">
            <div className="voice-status-row">
              <span>{voiceSession.statusLabel}</span>
              <strong>{voiceSession.isMuted ? "Muted" : "Audible"}</strong>
            </div>
            <p className="voice-fallback">{voiceSession.textFallback}</p>
            <div className="voice-controls">
              <button
                type="button"
                aria-pressed={voiceSession.isMuted}
                onClick={() =>
                  setVoiceSession((session) =>
                    setVoiceOutputMuted(session, !session.isMuted),
                  )
                }
              >
                {voiceSession.isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setVoiceSession((session) =>
                    startMockSpeech(session, mockVoiceResponse),
                  )
                }
              >
                Play mock voice
              </button>
              <button
                type="button"
                disabled={voiceSession.phase !== "speaking"}
                onClick={() =>
                  setVoiceSession((session) => stopMockSpeech(session))
                }
              >
                Stop speech
              </button>
            </div>
          </section>
        </section>
      )}

      <section className="control-surface" aria-label="Menu bar control surface">
        <nav className="control-nav" aria-label="Control surface entries">
          {controlSurfaceEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === activeEntry ? "active" : undefined}
              aria-pressed={entry.id === activeEntry}
              onClick={() => setActiveEntry(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <ControlSurfacePanel
          activeEntry={activeEntry}
          settings={settings}
          onSettingsChange={completeOnboarding}
          trustFoundationStore={trustFoundationStore}
        />
      </section>
    </main>
  );
}
