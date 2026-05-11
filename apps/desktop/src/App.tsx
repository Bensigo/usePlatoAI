import "./styles.css";

const shellItems = [
  "Floating presence placeholder",
  "Menu bar controls pending",
  "First-run setup pending",
];

export function App() {
  return (
    <main className="app-shell" aria-labelledby="app-title">
      <section className="presence-panel" aria-label="Plato desktop shell">
        <div className="presence-orb" aria-hidden="true">
          P
        </div>
        <div className="presence-copy">
          <p className="product-name">usePlatoAI</p>
          <h1 id="app-title">Plato</h1>
          <p className="status-label">First run shell</p>
          <p className="status-copy">
            Ready for local setup. This launchable shell establishes the desktop
            foundation before Live2D, voice, memory, or agent features exist.
          </p>
        </div>
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
