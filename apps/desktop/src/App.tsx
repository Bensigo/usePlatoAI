import "./styles.css";

import { useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

function startPresenceDrag(event: MouseEvent<HTMLButtonElement>) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  void getCurrentWindow().startDragging();
}

export function DismissedPresence({ onRestore }: { onRestore: () => void }) {
  return (
    <main className="presence-shell" aria-labelledby="restore-title">
      <section className="restore-card" aria-label="Plato presence hidden">
        <p id="restore-title">Plato is hidden</p>
        <button className="restore-button" type="button" onClick={onRestore}>
          Show Plato presence
        </button>
      </section>
    </main>
  );
}

export function App() {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return <DismissedPresence onRestore={() => setIsDismissed(false)} />;
  }

  return (
    <main className="presence-shell" aria-labelledby="presence-title">
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
    </main>
  );
}
