import "./styles.css";

import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  controlSurfaceEntries,
  isControlSurfaceId,
  type ControlSurfaceId,
} from "./controlSurface";

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
}: {
  activeEntry: ControlSurfaceId;
}) {
  const activeControl = controlSurfaceEntries.find(
    (entry) => entry.id === activeEntry,
  )!;

  return (
    <section className="placeholder-panel" aria-live="polite">
      <p className="status-label">Placeholder panel</p>
      <h2>{activeControl.label}</h2>
      <p>{activeControl.description}</p>
      <p className="placeholder-note">
        This area is reachable from the macOS menu bar now. The underlying
        feature is intentionally not implemented in this slice.
      </p>
    </section>
  );
}

export function App() {
  const [activeEntry, setActiveEntry] = useState<ControlSurfaceId>("settings");
  const [isDismissed, setIsDismissed] = useState(false);

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
            <h1 id="presence-title">Plato</h1>
            <p className="status-label">Idle presence</p>
          </div>
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

        <ControlSurfacePanel activeEntry={activeEntry} />
      </section>
    </main>
  );
}
