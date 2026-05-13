import { useEffect, useState } from "react";

import {
  controlSurfaceEntries,
  isControlSurfaceId,
  type ControlSurfaceId,
} from "./controlSurface";
import "./styles.css";

const shellItems = [
  "Floating presence placeholder",
  "Menu bar controls available",
  "First-run setup pending",
];

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
  const [presenceVisible, setPresenceVisible] = useState(true);

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
    <main className="app-shell" aria-labelledby="app-title">
      {presenceVisible ? (
        <section className="presence-panel" aria-label="Plato desktop shell">
          <div className="presence-orb" aria-hidden="true">
            P
          </div>
          <div className="presence-copy">
            <p className="product-name">usePlatoAI</p>
            <h1 id="app-title">Plato</h1>
            <p className="status-label">First run shell</p>
            <p className="status-copy">
              Ready for local setup. This launchable shell establishes the
              desktop foundation before Live2D, voice, memory, or agent features
              exist.
            </p>
          </div>
          <button
            className="presence-dismiss"
            type="button"
            onClick={() => setPresenceVisible(false)}
          >
            Hide presence
          </button>
        </section>
      ) : (
        <section className="presence-hidden" aria-labelledby="app-title">
          <div>
            <p className="product-name">usePlatoAI</p>
            <h1 id="app-title">Plato</h1>
            <p className="status-copy">
              Floating presence hidden. The macOS menu bar control surface still
              opens every placeholder area.
            </p>
          </div>
          <button type="button" onClick={() => setPresenceVisible(true)}>
            Show presence
          </button>
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

      <section className="readiness-panel" aria-label="Shell readiness">
        <h2>Desktop foundation</h2>
        <ul>
          {shellItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
