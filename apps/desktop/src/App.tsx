import "./styles.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  Live2DAvatarSurface,
  getLive2DAvatarSurfaceHook,
  isAvatarPresenceState,
  type AvatarPresenceState,
} from "./avatarSurface";
import {
  createMemoryPresenceStateSource,
  type CompanionPresenceState,
  type PresenceStateSnapshot,
  type PresenceStateSource,
} from "./presenceState";
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
  createTauriSoulGuidanceStore,
  fallbackSoulGuidance,
  type SoulGuidance,
  type SoulGuidanceStore,
} from "./soulGuidance";
import {
  createTauriMemoryStore,
  type LocalMemoryInput,
  type LocalMemoryRecord,
  type MemoryStore,
} from "./memory";
import {
  audioActivationStateLabel,
  audioActivationStates,
  audioActivationSnapshotForState,
  canStartVoiceInteractionWithAudio,
  createAudioActivationSnapshot,
  markAudioActivationResult,
  playComingOnlineSound,
  setAudioActivationMuted,
  type AudioActivationSnapshot,
  type AudioActivationState,
} from "./audioActivation";
import {
  createVoiceOutputSession,
  mockVoiceResponse,
  setVoiceOutputMuted,
  startMockSpeech,
  stopMockSpeech,
  type CompanionPresenceState as VoiceOutputPresenceState,
} from "./voiceOutput";
import {
  companionPromptForInputWithCorrections,
  companionPresenceForVoiceState,
  defaultVoiceInteractionSnapshot,
  mockVoiceTranscript,
  nextMockVoiceSnapshot,
  textFallbackResponseSnapshot,
  textFallbackThinkingSnapshot,
  type VoiceInteractionSnapshot,
  type VoiceSessionState,
} from "./voiceInteraction";
import { experienceTokenCss } from "./experienceTokens";

function startPresenceDrag(event: MouseEvent<HTMLButtonElement>) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  void getCurrentWindow().startDragging();
}

function usePresenceState(source: PresenceStateSource) {
  return useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getSnapshot,
  );
}

function avatarPresenceStateFor(state: string): AvatarPresenceState {
  if (state === "waiting_for_approval") {
    return "waitingApproval";
  }

  return isAvatarPresenceState(state) ? state : "idle";
}

export function isActiveCorrectionPromptTransition({
  snapshot,
  source,
  promptInput,
  requestId,
  activeRequestId,
}: {
  snapshot: VoiceInteractionSnapshot;
  source: "voice" | "text";
  promptInput: string;
  requestId: number;
  activeRequestId: number;
}) {
  if (
    requestId !== activeRequestId ||
    snapshot.sessionState !== "speaking" ||
    snapshot.activationSource !== source
  ) {
    return false;
  }

  return source === "text"
    ? snapshot.submittedFallbackText === promptInput
    : (snapshot.transcript || mockVoiceTranscript) === promptInput;
}

export function renderedPresenceStateFor({
  audioActivationState = "inactive",
  voiceOutputPresenceState,
  voiceInteractionSessionState,
  sharedPresenceState,
}: {
  audioActivationState?: AudioActivationState;
  voiceOutputPresenceState: VoiceOutputPresenceState;
  voiceInteractionSessionState: VoiceSessionState;
  sharedPresenceState: string;
}) {
  const activePresenceState =
    voiceInteractionSessionState === "idle"
      ? sharedPresenceState
      : companionPresenceForVoiceState(voiceInteractionSessionState);

  if (voiceOutputPresenceState === "speaking") {
    return "speaking";
  }

  if (voiceOutputPresenceState === "muted" && activePresenceState === "idle") {
    return "muted";
  }

  if (audioActivationState === "error" && activePresenceState === "idle") {
    return "error";
  }

  return activePresenceState;
}

export type CurrentTaskPanelAction =
  | "pause"
  | "resume"
  | "cancel"
  | "approve"
  | "reject";

export function isActionableCurrentTaskState(state: string) {
  return (
    state === "task_running" ||
    state === "waiting_for_approval" ||
    state === "waitingApproval"
  );
}

export function currentTaskPresenceStateForAction(
  action: CurrentTaskPanelAction,
) {
  if (action === "approve" || action === "resume") {
    return "task_running";
  }

  if (action === "pause") {
    return "task_paused";
  }

  return "idle";
}

export function isCurrentTaskControlState(state: string) {
  return (
    state === "task_running" ||
    state === "task_paused" ||
    state === "waiting_for_approval" ||
    state === "waitingApproval"
  );
}

export function shouldShowCenteredChatPanelOpener({
  voiceInteractionSessionState,
  currentTaskState,
}: {
  voiceInteractionSessionState: VoiceSessionState;
  currentTaskState: PresenceStateSnapshot;
}) {
  return (
    voiceInteractionSessionState !== "idle" ||
    isCurrentTaskControlState(currentTaskState.state)
  );
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
  voiceInteraction,
  onStartVoiceInteraction,
  onStopVoiceInteraction,
  onMuteChange,
  onTextFallbackChange,
  onSubmitTextFallback,
  soulGuidanceStore,
  onSoulGuidanceChange,
  memoryStore,
}: {
  activeEntry: ControlSurfaceId;
  settings?: CompanionSettings;
  onSettingsChange?: (settings: CompanionSettings) => Promise<void>;
  trustFoundationStore?: TrustFoundationStore;
  soulGuidanceStore?: SoulGuidanceStore;
  onSoulGuidanceChange?: (guidance: SoulGuidance) => void;
  voiceInteraction?: VoiceInteractionSnapshot;
  onStartVoiceInteraction?: () => void;
  onStopVoiceInteraction?: () => void;
  onMuteChange?: (isMuted: boolean) => void;
  onTextFallbackChange?: (value: string) => void;
  onSubmitTextFallback?: () => void;
  memoryStore?: MemoryStore;
}) {
  const activeControl = controlSurfaceEntries.find(
    (entry) => entry.id === activeEntry,
  )!;

  return (
    <section className="control-panel" aria-live="polite">
      <p className="status-label">
        {activeEntry === "trust"
          ? "Provider and trust"
          : activeEntry === "settings"
          ? "Local settings"
          : activeEntry === "config"
            ? "Local config"
          : activeEntry === "soul"
            ? "Soul editor"
            : activeEntry === "memory"
              ? "Memory control"
              : "Voice control"}
      </p>
      <h2>{activeControl.label}</h2>
      <p>{activeControl.description}</p>
      {activeEntry === "voice" && voiceInteraction ? (
        <VoiceInteractionPanel
          voiceInteraction={voiceInteraction}
          onStartVoiceInteraction={onStartVoiceInteraction}
          onStopVoiceInteraction={onStopVoiceInteraction}
          onMuteChange={onMuteChange}
          onTextFallbackChange={onTextFallbackChange}
          onSubmitTextFallback={onSubmitTextFallback}
        />
      ) : activeEntry === "settings" && settings ? (
        <SettingsPanel settings={settings} />
      ) : activeEntry === "config" && settings ? (
        <ConfigPanel settings={settings} />
      ) : activeEntry === "trust" && settings ? (
        onSettingsChange ? (
          <TrustFoundationSettings
            settings={settings}
            onSettingsChange={onSettingsChange}
            trustFoundationStore={trustFoundationStore}
          />
        ) : (
          <SettingsSummary settings={settings} />
        )
      ) : activeEntry === "soul" && soulGuidanceStore ? (
        <SoulEditorPanel
          soulGuidanceStore={soulGuidanceStore}
          onSoulGuidanceChange={onSoulGuidanceChange}
        />
      ) : activeEntry === "memory" && settings && onSettingsChange ? (
        <MemoryBrowserPanel
          settings={settings}
          onSettingsChange={onSettingsChange}
          memoryStore={memoryStore}
        />
      ) : (
        <p className="empty-state">
          This surface is waiting for local state from the desktop runtime.
        </p>
      )}
    </section>
  );
}

type SurfaceStateTone =
  | "configured"
  | "missing"
  | "offline"
  | "error"
  | "permission"
  | "active"
  | "muted"
  | "loading"
  | "empty"
  | "disabled"
  | "unavailable";

function SurfaceStateStrip({
  label,
  states,
}: {
  label: string;
  states: Array<{ label: string; value: string; tone: SurfaceStateTone }>;
}) {
  return (
    <div className="surface-state-strip" aria-label={label}>
      {states.map((state) => (
        <span
          className="surface-state-chip"
          data-surface-state={state.tone}
          key={`${state.label}-${state.value}`}
        >
          <strong>{state.label}</strong>
          <span>{state.value}</span>
        </span>
      ))}
    </div>
  );
}

export function SettingsPanel({ settings }: { settings: CompanionSettings }) {
  return (
    <div className="settings-panel">
      <SurfaceStateStrip
        label="Settings surface states"
        states={[
          {
            label: "Onboarding",
            value: settings.onboardingComplete ? "configured" : "missing",
            tone: settings.onboardingComplete ? "configured" : "missing",
          },
          {
            label: "Memory",
            value: settings.memoryMode === "enabled" ? "configured" : "disabled",
            tone: settings.memoryMode === "enabled" ? "configured" : "disabled",
          },
          {
            label: "Authority",
            value: settings.executionAuthority,
            tone: "permission",
          },
        ]}
      />
      <SettingsSummary settings={settings} />
    </div>
  );
}

export function ConfigPanel({ settings }: { settings: CompanionSettings }) {
  return (
    <div className="config-panel">
      <SurfaceStateStrip
        label="Config surface states"
        states={[
          {
            label: "Settings",
            value: settings.onboardingComplete ? "configured" : "missing",
            tone: settings.onboardingComplete ? "configured" : "missing",
          },
          {
            label: "Runtime",
            value: "local",
            tone: "configured",
          },
          {
            label: "Sync",
            value: "offline",
            tone: "offline",
          },
        ]}
      />
      <dl className="compact-facts" aria-label="Local configuration status">
        <div>
          <dt>Onboarding</dt>
          <dd>{settings.onboardingComplete ? "Complete" : "Pending"}</dd>
        </div>
        <div>
          <dt>Launch</dt>
          <dd>
            {settings.launchBehavior === "launch-at-login"
              ? "Login"
              : "Manual"}
          </dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{providerPlaceholderLabel(settings.providerPlaceholder)}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{settings.memoryMode === "enabled" ? "Enabled" : "Paused"}</dd>
        </div>
      </dl>
      <p className="control-note">
        Configuration stays local-first. Provider credentials and execution
        authority live under Provider/trust.
      </p>
    </div>
  );
}

export function SoulEditorPanel({
  soulGuidanceStore,
  onSoulGuidanceChange,
}: {
  soulGuidanceStore: SoulGuidanceStore;
  onSoulGuidanceChange?: (guidance: SoulGuidance) => void;
}) {
  const [draft, setDraft] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [message, setMessage] = useState("Loading soul guidance");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    soulGuidanceStore
      .read()
      .then((guidance) => {
        if (isCurrent) {
          setDraft(guidance.rawMarkdown);
          setSavedPath(guidance.path);
          setMessage("Soul guidance loaded");
          onSoulGuidanceChange?.(guidance);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load soul guidance",
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [onSoulGuidanceChange, soulGuidanceStore]);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const nextGuidance = await soulGuidanceStore.save(draft);
      setDraft(nextGuidance.rawMarkdown);
      setSavedPath(nextGuidance.path);
      setMessage("Soul guidance saved");
      onSoulGuidanceChange?.(nextGuidance);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Soul guidance could not be saved",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="soul-editor" onSubmit={saveDraft}>
      <SurfaceStateStrip
        label="Soul editor surface states"
        states={[
          {
            label: "Draft",
            value: isSaving ? "saving" : draft.trim() ? "configured" : "empty",
            tone: isSaving ? "loading" : draft.trim() ? "configured" : "empty",
          },
          {
            label: "Guardrail",
            value: "permission-sensitive",
            tone: "permission",
          },
          {
            label: "File",
            value: savedPath ? "local" : "loading",
            tone: savedPath ? "configured" : "loading",
          },
        ]}
      />
      <label>
        <span>Soul markdown</span>
        <textarea
          value={draft}
          rows={12}
          spellCheck={false}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>

      <div className="soul-editor-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving" : "Save soul"}
        </button>
        <span className="soul-path">{savedPath}</span>
      </div>

      <p className="soul-editor-message" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

export function MemoryBrowserPanel({
  settings,
  onSettingsChange,
  memoryStore,
  initialRecords = [],
}: {
  settings: CompanionSettings;
  onSettingsChange: (settings: CompanionSettings) => Promise<void>;
  memoryStore?: MemoryStore;
  initialRecords?: LocalMemoryRecord[];
}) {
  const durableMemoryStore = useMemo(
    () => memoryStore ?? createTauriMemoryStore(),
    [memoryStore],
  );
  const [records, setRecords] = useState<LocalMemoryRecord[]>(initialRecords);
  const [selectedMemoryId, setSelectedMemoryId] = useState(
    initialRecords[0]?.memoryId ?? "",
  );
  const selectedRecord =
    records.find((record) => record.memoryId === selectedMemoryId) ??
    records[0] ??
    null;
  const [draftSummary, setDraftSummary] = useState(selectedRecord?.summary ?? "");
  const [message, setMessage] = useState("Memory browser ready");
  const [isSaving, setIsSaving] = useState(false);
  const memoryEnabled = settings.memoryMode === "enabled";

  useEffect(() => {
    durableMemoryStore.setMemoryEnabled(memoryEnabled);
  }, [durableMemoryStore, memoryEnabled]);

  useEffect(() => {
    let isCurrent = true;

    durableMemoryStore
      .retrieve({ limit: 25 })
      .then((nextRecords) => {
        if (!isCurrent) {
          return;
        }

        setRecords(nextRecords);
        setSelectedMemoryId((currentId) =>
          nextRecords.some((record) => record.memoryId === currentId)
            ? currentId
            : nextRecords[0]?.memoryId ?? "",
        );
        setMessage(
          nextRecords.length > 0
            ? "Memory records loaded"
            : "No memory records stored yet",
        );
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load memory",
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [durableMemoryStore]);

  useEffect(() => {
    setDraftSummary(selectedRecord?.summary ?? "");
  }, [selectedRecord?.memoryId, selectedRecord?.summary]);

  async function reloadRecords(nextMessage: string) {
    const nextRecords = await durableMemoryStore.retrieve({ limit: 25 });
    setRecords(nextRecords);
    setSelectedMemoryId((currentId) =>
      nextRecords.some((record) => record.memoryId === currentId)
        ? currentId
        : nextRecords[0]?.memoryId ?? "",
    );
    setMessage(nextMessage);
  }

  async function toggleMemoryEnabled() {
    const nextSettings: CompanionSettings = {
      ...settings,
      memoryMode: memoryEnabled ? "paused" : "enabled",
    };

    setIsSaving(true);
    try {
      await onSettingsChange(nextSettings);
      durableMemoryStore.setMemoryEnabled(nextSettings.memoryMode === "enabled");
      setMessage(
        nextSettings.memoryMode === "enabled"
          ? "Memory writes enabled"
          : "Memory writes paused",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to change memory mode",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSelectedMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRecord) {
      return;
    }

    const summary = draftSummary.trim();

    if (!summary) {
      setMessage("Memory summary cannot be empty");
      return;
    }

    const input: LocalMemoryInput = {
      memoryId: selectedRecord.memoryId,
      memoryKind: selectedRecord.memoryKind,
      summary,
      preferenceKey: selectedRecord.preferenceKey,
      preferenceValue: selectedRecord.preferenceValue,
      sourceKind: selectedRecord.sourceKind,
      metadata: selectedRecord.metadata,
    };

    setIsSaving(true);
    try {
      await durableMemoryStore.remember(input);
      await reloadRecords("Memory updated");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update memory",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedMemory() {
    if (!selectedRecord) {
      return;
    }

    setIsSaving(true);
    try {
      await durableMemoryStore.delete(selectedRecord.memoryId);
      await reloadRecords("Memory deleted");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete memory",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="memory-browser">
      <SurfaceStateStrip
        label="Memory surface states"
        states={[
          {
            label: "Writes",
            value: memoryEnabled ? "configured" : "disabled",
            tone: memoryEnabled ? "configured" : "disabled",
          },
          {
            label: "Records",
            value: records.length > 0 ? "available" : "empty",
            tone: records.length > 0 ? "configured" : "empty",
          },
          {
            label: "Cloud",
            value: "offline",
            tone: "offline",
          },
        ]}
      />
      <div className="memory-toolbar">
        <dl className="compact-facts" aria-label="Memory browser status">
          <div>
            <dt>Mode</dt>
            <dd>{memoryEnabled ? "Enabled" : "Paused"}</dd>
          </div>
          <div>
            <dt>Records</dt>
            <dd>{records.length}</dd>
          </div>
        </dl>
        <button type="button" disabled={isSaving} onClick={toggleMemoryEnabled}>
          {memoryEnabled ? "Disable memory" : "Enable memory"}
        </button>
      </div>

      {records.length > 0 ? (
        <div className="memory-layout">
          <div className="memory-list" role="list" aria-label="Stored memory">
            {records.map((record) => (
              <button
                key={record.memoryId}
                type="button"
                className={
                  record.memoryId === selectedRecord?.memoryId
                    ? "active"
                    : undefined
                }
                onClick={() => setSelectedMemoryId(record.memoryId)}
              >
                <strong>{record.memoryKind}</strong>
                <span>{record.summary}</span>
              </button>
            ))}
          </div>

          <form className="memory-editor" onSubmit={saveSelectedMemory}>
            <label>
              <span>Summary</span>
              <textarea
                rows={4}
                value={draftSummary}
                onChange={(event) => setDraftSummary(event.currentTarget.value)}
              />
            </label>
            {selectedRecord?.memoryKind === "preference" ? (
              <dl className="compact-facts">
                <div>
                  <dt>Preference</dt>
                  <dd>{selectedRecord.preferenceKey}</dd>
                </div>
              </dl>
            ) : null}
            <div className="memory-actions">
              <button type="submit" disabled={isSaving || !selectedRecord}>
                Save edit
              </button>
              <button
                type="button"
                disabled={isSaving || !selectedRecord}
                onClick={deleteSelectedMemory}
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      ) : (
        <p className="empty-state">No memory records stored yet</p>
      )}

      <p className="trust-message" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

export function VoiceInteractionPanel({
  voiceInteraction,
  onStartVoiceInteraction,
  onStopVoiceInteraction,
  onMuteChange,
  onTextFallbackChange,
  onSubmitTextFallback,
}: {
  voiceInteraction: VoiceInteractionSnapshot;
  onStartVoiceInteraction?: () => void;
  onStopVoiceInteraction?: () => void;
  onMuteChange?: (isMuted: boolean) => void;
  onTextFallbackChange?: (value: string) => void;
  onSubmitTextFallback?: () => void;
}) {
  const isActive = voiceInteraction.sessionState !== "idle";
  const isError = voiceInteraction.response.toLowerCase().includes("error");

  function submitTextFallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitTextFallback?.();
  }

  return (
    <div className="voice-panel">
      <SurfaceStateStrip
        label="Voice surface states"
        states={[
          {
            label: "Local voice",
            value: "configured",
            tone: "configured",
          },
          {
            label: "Cloud voice",
            value: "missing",
            tone: "missing",
          },
          {
            label: "Output",
            value: voiceInteraction.isMuted ? "muted" : "available",
            tone: voiceInteraction.isMuted ? "muted" : "configured",
          },
          {
            label: "Session",
            value: isError ? "error" : isActive ? "active" : "idle",
            tone: isError ? "error" : isActive ? "active" : "empty",
          },
          {
            label: "Desktop audio",
            value: "unavailable until enabled",
            tone: "unavailable",
          },
        ]}
      />
      <dl className="voice-status" aria-label="Voice session status">
        <div>
          <dt>Session</dt>
          <dd>{voiceInteraction.sessionState}</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{voiceInteraction.activationSource}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{voiceInteraction.isMuted ? "Muted" : "Audible"}</dd>
        </div>
      </dl>

      <div className="voice-actions" role="group" aria-label="Voice controls">
        <button
          className="primary-button"
          type="button"
          disabled={isActive}
          onClick={onStartVoiceInteraction}
        >
          Start listening
        </button>
        <button
          type="button"
          disabled={!isActive}
          onClick={onStopVoiceInteraction}
        >
          Stop
        </button>
        <label className="mute-toggle">
          <input
            type="checkbox"
            checked={voiceInteraction.isMuted}
            onChange={(event) => onMuteChange?.(event.currentTarget.checked)}
          />
          <span>Mute voice output</span>
        </label>
      </div>

      <section className="voice-transcript" aria-label="Voice transcript">
        <strong>Transcript</strong>
        <p>{voiceInteraction.transcript || "No voice input yet."}</p>
      </section>

      <form className="text-fallback-form" onSubmit={submitTextFallback}>
        <label>
          <span>Text fallback</span>
          <textarea
            value={voiceInteraction.fallbackText}
            rows={3}
            placeholder="Type when voice is unavailable or muted"
            onChange={(event) =>
              onTextFallbackChange?.(event.currentTarget.value)
            }
          />
        </label>
        <button type="submit" disabled={isActive}>
          Send text
        </button>
      </form>

      <p className="voice-response" aria-live="polite">
        {voiceInteraction.response}
      </p>
    </div>
  );
}

export function CenteredChatPanel({
  voiceInteraction,
  currentTaskState,
  onDismiss,
  onTextFallbackChange,
  onSubmitTextFallback,
  onPauseCurrentTask,
  onResumeCurrentTask,
  onCancelCurrentTask,
  onApproveCurrentTask,
  onRejectCurrentTask,
}: {
  voiceInteraction: VoiceInteractionSnapshot;
  currentTaskState: PresenceStateSnapshot;
  onDismiss: () => void;
  onTextFallbackChange?: (value: string) => void;
  onSubmitTextFallback?: () => void;
  onPauseCurrentTask?: () => void;
  onResumeCurrentTask?: () => void;
  onCancelCurrentTask?: () => void;
  onApproveCurrentTask?: () => void;
  onRejectCurrentTask?: () => void;
}) {
  const isWorkRunning = currentTaskState.state === "task_running";
  const isWaitingForApproval =
    currentTaskState.state === "waiting_for_approval" ||
    currentTaskState.state === "waitingApproval";
  const isWorkPaused = currentTaskState.state === "task_paused";
  const showsCurrentTask = isWorkRunning || isWaitingForApproval || isWorkPaused;
  const transcript = voiceInteraction.transcript || "No voice input yet.";
  const latestUserMessage =
    voiceInteraction.submittedFallbackText || voiceInteraction.transcript;

  function submitTextFallback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmitTextFallback?.();
  }

  return (
    <section
      className="centered-chat-panel"
      aria-label="Centered Plato chat panel"
    >
      <header className="centered-chat-header">
        <div>
          <p className="status-label">Current interaction</p>
          <h2>Chat with Plato</h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss chat panel"
        >
          x
        </button>
      </header>

      <section
        className="centered-chat-transcript"
        aria-label="Transcript review"
      >
        <strong>Transcript</strong>
        <p>{transcript}</p>
      </section>

      <section
        className="centered-chat-thread"
        aria-label="Text chat with Plato"
      >
        {latestUserMessage ? (
          <article className="chat-message user-message">
            <strong>You</strong>
            <p>{latestUserMessage}</p>
          </article>
        ) : null}
        <article className="chat-message plato-message">
          <strong>Plato</strong>
          <p>{voiceInteraction.response || "Ready for voice or text."}</p>
        </article>
      </section>

      <form className="centered-chat-form" onSubmit={submitTextFallback}>
        <label>
          <span>Text chat</span>
          <textarea
            value={voiceInteraction.fallbackText}
            rows={3}
            placeholder="Type to Plato"
            onChange={(event) =>
              onTextFallbackChange?.(event.currentTarget.value)
            }
          />
        </label>
        <button type="submit">Send</button>
      </form>

      {showsCurrentTask ? (
        <section
          className="current-task-panel"
          aria-label="Current task controls"
        >
          <div>
            <strong>Current task</strong>
            <p>{currentTaskState.label}</p>
          </div>
          {isWorkRunning ? (
            <div className="current-task-actions">
              <button type="button" onClick={onPauseCurrentTask}>
                Pause
              </button>
              <button type="button" onClick={onCancelCurrentTask}>
                Cancel
              </button>
            </div>
          ) : null}
          {isWorkPaused ? (
            <div className="current-task-actions">
              <button type="button" onClick={onResumeCurrentTask}>
                Resume
              </button>
              <button type="button" onClick={onCancelCurrentTask}>
                Cancel
              </button>
            </div>
          ) : null}
          {isWaitingForApproval ? (
            <div className="current-task-actions approval-actions">
              <button type="button" onClick={onApproveCurrentTask}>
                Approve
              </button>
              <button type="button" onClick={onRejectCurrentTask}>
                Reject
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export function PresenceListeningBubble({
  state,
  label: overrideLabel,
  ariaLabel,
  onOpenControls,
}: {
  state: AvatarPresenceState;
  label?: string;
  ariaLabel?: string;
  onOpenControls?: () => void;
}) {
  const label = overrideLabel ?? getLive2DAvatarSurfaceHook(state).label;
  const hasSoundWave = state === "listening" || state === "speaking";
  const hasThinkingIndicator = state === "thinking";

  return (
    <button
      className="presence-listening-bubble"
      type="button"
      data-presence-bubble-state={state}
      onClick={onOpenControls}
      aria-label={ariaLabel ?? `Open voice controls: ${label}`}
    >
      <span className="presence-bubble-label">{label}</span>
      {hasSoundWave ? (
        <span className="presence-sound-wave" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : hasThinkingIndicator ? (
        <span className="presence-thinking-indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </button>
  );
}

export function AudioActivationStatus({
  audioActivation,
}: {
  audioActivation: AudioActivationSnapshot;
}) {
  return (
    <section
      className="audio-activation-status"
      aria-label="Audio activation state"
      data-audio-activation-state={audioActivation.state}
    >
      <div className="audio-activation-copy">
        <span>{audioActivation.statusLabel}</span>
        <small>{audioActivation.detail}</small>
      </div>
      <div className="audio-state-strip" aria-label="Audio state options">
        {audioActivationStates.map((state) => (
          <span
            key={state}
            data-audio-state={state}
            data-current={audioActivation.state === state}
          >
            {audioActivationStateLabel(state)}
          </span>
        ))}
      </div>
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

      <SurfaceStateStrip
        label="Provider and trust surface states"
        states={[
          {
            label: "Credential",
            value: snapshot.providerCredential.hasSecret
              ? "configured"
              : "missing",
            tone: snapshot.providerCredential.hasSecret
              ? "configured"
              : "missing",
          },
          {
            label: "Provider",
            value:
              snapshot.providerCredential.authStatus === "configured"
                ? "configured"
                : snapshot.providerCredential.authStatus,
            tone:
              snapshot.providerCredential.authStatus === "configured"
                ? "configured"
                : snapshot.providerCredential.authStatus === "error"
                  ? "error"
                  : "missing",
          },
          {
            label: "Network",
            value: "offline-safe",
            tone: "offline",
          },
          {
            label: "Authority",
            value: settings.executionAuthority,
            tone: "permission",
          },
        ]}
      />

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
  initialActiveEntry = "voice",
  initialPresenceState = "idle",
  settingsStore,
  trustFoundationStore,
  soulGuidanceStore,
  memoryStore,
  presenceStateSource,
  initialAudioActivationState,
  initialVoiceSessionState,
}: {
  initialSettings?: CompanionSettings;
  initialActiveEntry?: ControlSurfaceId;
  initialPresenceState?: CompanionPresenceState;
  initialAudioActivationState?: AudioActivationState;
  initialVoiceSessionState?: VoiceSessionState;
  settingsStore?: SettingsStore;
  trustFoundationStore?: TrustFoundationStore;
  soulGuidanceStore?: SoulGuidanceStore;
  memoryStore?: MemoryStore;
  presenceStateSource?: PresenceStateSource;
}) {
  const experienceTokenStyle = (
    <style
      data-plato-experience-tokens="true"
      dangerouslySetInnerHTML={{ __html: experienceTokenCss }}
    />
  );
  const durableSettingsStore = useMemo(
    () => settingsStore ?? createTauriSettingsStore(),
    [settingsStore],
  );
  const companionPresenceStateSource = useMemo(
    () =>
      presenceStateSource ?? createMemoryPresenceStateSource(initialPresenceState),
    [initialPresenceState, presenceStateSource],
  );
  const durableSoulGuidanceStore = useMemo(
    () => soulGuidanceStore ?? createTauriSoulGuidanceStore(),
    [soulGuidanceStore],
  );
  const durableMemoryStore = useMemo(
    () => memoryStore ?? createTauriMemoryStore(),
    [memoryStore],
  );
  const presence = usePresenceState(companionPresenceStateSource);
  const [activeEntry, setActiveEntry] =
    useState<ControlSurfaceId>(initialActiveEntry);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasAvatarClickReaction, setHasAvatarClickReaction] = useState(false);
  const [settings, setSettings] = useState<CompanionSettings>(
    () => initialSettings ?? defaultCompanionSettings,
  );
  const [voiceSession, setVoiceSession] = useState(createVoiceOutputSession);
  const [audioActivation, setAudioActivation] = useState(() =>
    initialAudioActivationState
      ? audioActivationSnapshotForState(initialAudioActivationState)
      : createAudioActivationSnapshot(),
  );
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(
    () => initialSettings !== undefined,
  );
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [voiceInteraction, setVoiceInteraction] =
    useState<VoiceInteractionSnapshot>(() =>
      initialVoiceSessionState
        ? nextMockVoiceSnapshot(
            defaultVoiceInteractionSnapshot,
            initialVoiceSessionState,
          )
        : defaultVoiceInteractionSnapshot,
    );
  const [soulGuidance, setSoulGuidance] =
    useState<SoulGuidance>(fallbackSoulGuidance);
  const voiceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const avatarReactionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const correctionPromptRequestId = useRef(0);

  function clearVoiceTimers() {
    for (const timer of voiceTimers.current) {
      clearTimeout(timer);
    }

    voiceTimers.current = [];
  }

  function scheduleVoiceState(
    delay: number,
    sessionState: VoiceSessionState,
    source: "voice" | "text",
  ) {
    voiceTimers.current.push(
      setTimeout(() => {
        if (sessionState === "speaking") {
          setVoiceInteractionWithCorrectionPrompt(source);
          return;
        }

        setVoiceInteraction((current) => {
          if (source === "text") {
            return { ...current, sessionState, companionPrompt: null };
          }

          return nextMockVoiceSnapshot(current, sessionState, soulGuidance);
        });
      }, delay),
    );
  }

  function setVoiceInteractionWithCorrectionPrompt(source: "voice" | "text") {
    setVoiceInteraction((current) => {
      const requestId = correctionPromptRequestId.current + 1;
      correctionPromptRequestId.current = requestId;
      const responseSnapshot =
        source === "text"
          ? textFallbackResponseSnapshot(current, soulGuidance)
          : nextMockVoiceSnapshot(current, "speaking", soulGuidance);
      const promptInput =
        source === "text"
          ? (current.submittedFallbackText ?? current.transcript)
          : current.transcript || mockVoiceTranscript;

      void companionPromptForInputWithCorrections(
        promptInput,
        durableMemoryStore,
        soulGuidance,
      )
        .then((companionPrompt) => {
          setVoiceInteraction((latest) => {
            if (
              !isActiveCorrectionPromptTransition({
                snapshot: latest,
                source,
                promptInput,
                requestId,
                activeRequestId: correctionPromptRequestId.current,
              })
            ) {
              return latest;
            }

            return {
              ...(source === "text"
                ? textFallbackResponseSnapshot(latest, soulGuidance)
                : nextMockVoiceSnapshot(latest, "speaking", soulGuidance)),
              companionPrompt,
            };
          });
        })
        .catch(() => undefined);

      return responseSnapshot;
    });
  }

  function startVoiceInteraction() {
    clearVoiceTimers();
    correctionPromptRequestId.current += 1;
    setVoiceInteraction((current) =>
      nextMockVoiceSnapshot(current, "listening", soulGuidance),
    );
    scheduleVoiceState(900, "thinking", "voice");
    scheduleVoiceState(1800, "speaking", "voice");
    scheduleVoiceState(3000, "idle", "voice");
  }

  function acknowledgeAvatarClick() {
    if (avatarReactionTimer.current) {
      clearTimeout(avatarReactionTimer.current);
    }

    setHasAvatarClickReaction(true);
    avatarReactionTimer.current = setTimeout(() => {
      setHasAvatarClickReaction(false);
      avatarReactionTimer.current = null;
    }, 520);
  }

  function openVoiceControls() {
    setActiveEntry("voice");
  }

  function openCenteredChatPanel() {
    setIsChatPanelOpen(true);
  }

  function activateVoiceListening() {
    if (
      canStartVoiceInteractionWithAudio(audioActivation) ||
      voiceSession.isMuted
    ) {
      setAudioActivation((snapshot) =>
        voiceSession.isMuted ? setAudioActivationMuted(snapshot, true) : snapshot,
      );
      startVoiceInteraction();
      return;
    }

    void playComingOnlineSound().then((result) => {
      const nextSnapshot = markAudioActivationResult(audioActivation, result);
      setAudioActivation(nextSnapshot);

      if (canStartVoiceInteractionWithAudio(nextSnapshot)) {
        startVoiceInteraction();
      }
    });
  }

  function activateAvatarListening() {
    acknowledgeAvatarClick();
    openVoiceControls();
    activateVoiceListening();
  }

  function stopVoiceInteraction() {
    clearVoiceTimers();
    correctionPromptRequestId.current += 1;
    setVoiceInteraction((current) => ({
      ...current,
      sessionState: "idle",
      response: "Voice session stopped.",
      companionPrompt: null,
    }));
  }

  function pauseCurrentTask() {
    companionPresenceStateSource.setState(
      currentTaskPresenceStateForAction("pause"),
    );
    setVoiceInteraction((current) => ({
      ...current,
      response: "Paused the current task.",
      companionPrompt: null,
    }));
  }

  function resumeCurrentTask() {
    companionPresenceStateSource.setState(
      currentTaskPresenceStateForAction("resume"),
    );
    setVoiceInteraction((current) => ({
      ...current,
      response: "Resumed the current task.",
      companionPrompt: null,
    }));
  }

  function cancelCurrentTask() {
    clearVoiceTimers();
    correctionPromptRequestId.current += 1;
    companionPresenceStateSource.setState(
      currentTaskPresenceStateForAction("cancel"),
    );
    setVoiceInteraction((current) => ({
      ...current,
      sessionState: "idle",
      response: "Cancelled the current task.",
      companionPrompt: null,
    }));
  }

  function submitTextFallback() {
    const fallbackText = voiceInteraction.fallbackText.trim();

    if (!fallbackText) {
      setVoiceInteraction((current) => ({
        ...current,
        response: "Text fallback cannot be empty.",
      }));
      return;
    }

    clearVoiceTimers();
    correctionPromptRequestId.current += 1;
    setVoiceInteraction((current) =>
      textFallbackThinkingSnapshot(current, fallbackText),
    );
    scheduleVoiceState(700, "speaking", "text");
    scheduleVoiceState(1800, "idle", "text");
  }

  function approveCurrentTask() {
    companionPresenceStateSource.setState(
      currentTaskPresenceStateForAction("approve"),
    );
    setVoiceInteraction((current) => ({
      ...current,
      response: "Approved. Continuing the current task.",
    }));
  }

  function rejectCurrentTask() {
    clearVoiceTimers();
    correctionPromptRequestId.current += 1;
    companionPresenceStateSource.setState(
      currentTaskPresenceStateForAction("reject"),
    );
    setVoiceInteraction((current) => ({
      ...current,
      sessionState: "idle",
      response: "Rejected. Current task stopped.",
      companionPrompt: null,
    }));
  }

  const renderedPresenceState = renderedPresenceStateFor({
    audioActivationState: audioActivation.state,
    voiceOutputPresenceState: voiceSession.presenceState,
    voiceInteractionSessionState: voiceInteraction.sessionState,
    sharedPresenceState: presence.state,
  });
  const avatarPresenceState = avatarPresenceStateFor(renderedPresenceState);
  const avatarSurfaceHook = getLive2DAvatarSurfaceHook(avatarPresenceState);
  const showCenteredChatPanelOpener = shouldShowCenteredChatPanelOpener({
    voiceInteractionSessionState: voiceInteraction.sessionState,
    currentTaskState: presence,
  });

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
    let isCurrent = true;

    durableSoulGuidanceStore
      .read()
      .then((nextGuidance) => {
        if (isCurrent) {
          setSoulGuidance(nextGuidance);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSoulGuidance(fallbackSoulGuidance);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [durableSoulGuidanceStore]);

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

  useEffect(
    () => () => {
      clearVoiceTimers();

      if (avatarReactionTimer.current) {
        clearTimeout(avatarReactionTimer.current);
      }
    },
    [],
  );

  async function completeOnboarding(updatedSettings: CompanionSettings) {
    await durableSettingsStore.save(updatedSettings);
    setSettings(updatedSettings);
  }

  if (!isSettingsLoaded) {
    return (
      <main className="presence-shell">
        {experienceTokenStyle}
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
        {experienceTokenStyle}
        <FirstRunOnboarding
          initialSettings={settings}
          onComplete={completeOnboarding}
        />
      </main>
    );
  }

  return (
    <main className="presence-shell" aria-labelledby="presence-title">
      {experienceTokenStyle}

      <section
        className="control-surface"
        aria-label="Top Plato control surface"
      >
        <nav className="control-nav" aria-label="Control surface entries">
          {controlSurfaceEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === activeEntry ? "active" : undefined}
              aria-pressed={entry.id === activeEntry}
              data-control-state={
                entry.id === activeEntry ? "active" : entry.state
              }
              onClick={() => setActiveEntry(entry.id)}
            >
              <span>{entry.label}</span>
              <small>{entry.id === activeEntry ? "active" : entry.state}</small>
            </button>
          ))}
        </nav>

        <ControlSurfacePanel
          activeEntry={activeEntry}
          settings={settings}
          onSettingsChange={completeOnboarding}
          trustFoundationStore={trustFoundationStore}
          voiceInteraction={voiceInteraction}
          onStartVoiceInteraction={activateVoiceListening}
          onStopVoiceInteraction={stopVoiceInteraction}
          onMuteChange={(isMuted) =>
            setVoiceInteraction((current) => ({ ...current, isMuted }))
          }
          onTextFallbackChange={(fallbackText) =>
            setVoiceInteraction((current) => ({ ...current, fallbackText }))
          }
          onSubmitTextFallback={submitTextFallback}
          soulGuidanceStore={durableSoulGuidanceStore}
          onSoulGuidanceChange={setSoulGuidance}
          memoryStore={durableMemoryStore}
        />
      </section>

      {isChatPanelOpen ? (
        <CenteredChatPanel
          voiceInteraction={voiceInteraction}
          currentTaskState={presence}
          onDismiss={() => setIsChatPanelOpen(false)}
          onTextFallbackChange={(fallbackText) =>
            setVoiceInteraction((current) => ({ ...current, fallbackText }))
          }
          onSubmitTextFallback={submitTextFallback}
          onPauseCurrentTask={pauseCurrentTask}
          onResumeCurrentTask={resumeCurrentTask}
          onCancelCurrentTask={cancelCurrentTask}
          onApproveCurrentTask={approveCurrentTask}
          onRejectCurrentTask={rejectCurrentTask}
        />
      ) : null}

      <section className="companion-presence-zone" aria-label="Bottom Plato presence area">
        {isDismissed ? (
          <DismissedPresence onRestore={() => setIsDismissed(false)} />
        ) : (
          <section
            className={`presence-card presence-${renderedPresenceState}${
              hasAvatarClickReaction ? " presence-click-reaction" : ""
            }`}
            aria-label="Floating Plato presence"
          >
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

            <button
              className="avatar-action"
              type="button"
              onClick={activateAvatarListening}
              aria-label={`Activate audio with ${settings.companionName}`}
            >
              <Live2DAvatarSurface presenceState={avatarPresenceState} />
            </button>

            {showCenteredChatPanelOpener ? (
              <PresenceListeningBubble
                state={avatarPresenceState}
                label={
                  isCurrentTaskControlState(presence.state)
                    ? presence.label
                    : undefined
                }
                ariaLabel={
                  isCurrentTaskControlState(presence.state)
                    ? `Open current task controls: ${presence.label}`
                    : undefined
                }
                onOpenControls={openCenteredChatPanel}
              />
            ) : null}

            <div className="presence-copy sr-only">
              <p className="product-name">usePlatoAI</p>
              <h1 id="presence-title">{settings.companionName}</h1>
              <p className="status-label">{avatarSurfaceHook.statusText}</p>
              <p className="wake-name">Wake name: {settings.wakeName}</p>
            </div>

            <section className="voice-output-panel" aria-label="Voice output controls">
              <AudioActivationStatus audioActivation={audioActivation} />
              <div className="voice-status-row">
                <span>{voiceSession.statusLabel}</span>
                <strong>{voiceSession.isMuted ? "Muted" : "Audible"}</strong>
              </div>
              <p className="voice-fallback">{voiceSession.textFallback}</p>
              <div className="voice-controls">
                <button
                  type="button"
                  aria-pressed={voiceSession.isMuted}
                  onClick={() => {
                    setVoiceSession((session) =>
                      setVoiceOutputMuted(session, !session.isMuted),
                    );
                    setAudioActivation((snapshot) =>
                      setAudioActivationMuted(snapshot, !voiceSession.isMuted),
                    );
                  }}
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
      </section>
    </main>
  );
}
