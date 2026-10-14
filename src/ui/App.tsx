
import "./style.css";

const sampleFrames = [
  { id: "1", name: "Cover Slide", size: "1920 × 1080" },
  { id: "2", name: "Product Overview", size: "1920 × 1080" },
];

export default function App() {
  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Frame2Slides</h1>
          <p>Convert Figma frames into presentation slides.</p>
        </div>
        <span className="version">v0.1.0</span>
      </header>

      <section className="section">
        <div className="section-heading">
          <h2>Selected Frames</h2>
          <span>{sampleFrames.length} frames</span>
        </div>

        <div className="frame-list">
          {sampleFrames.map((frame, index) => (
            <div className="frame-card" key={frame.id}>
              <div className="frame-preview">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="frame-details">
                <strong>{frame.name}</strong>
                <span>{frame.size}</span>
              </div>
              <span className="drag-handle">⋮⋮</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Export Settings</h2>
        </div>

        <div className="settings-row">
          <span>Conversion Mode</span>
          <strong>Smart Hybrid</strong>
        </div>
        <div className="settings-row">
          <span>Image Quality</span>
          <strong>PNG · 2×</strong>
        </div>
      </section>

      <footer className="app-footer">
        <button type="button" disabled>
          Export Presentation
        </button>
        <p>Export will be available in a future update.</p>
      </footer>
    </main>
  );
}
