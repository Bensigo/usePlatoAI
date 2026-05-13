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

export function App() {
  const [isHiddenFallback, setIsHiddenFallback] = useState(false);

  function hidePresence() {
    setIsHiddenFallback(true);
    void getCurrentWindow().hide().catch(() => {
      setIsHiddenFallback(true);
    });
  }

  if (isHiddenFallback) {
    return null;
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
            onClick={hidePresence}
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
