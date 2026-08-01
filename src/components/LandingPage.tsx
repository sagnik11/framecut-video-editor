import {
  ArrowRightIcon,
  CropIcon,
  FilmSlateIcon,
  GaugeIcon,
  ResizeIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { navigate } from "../lib/navigation";

function EditorPreview() {
  return (
    <div className="landing-preview" aria-label="Interactive editor feature preview">
      <div className="preview-toolbar">
        <span>night-walk.mov</span>
        <button type="button" onClick={() => navigate("/sign-up")}>Try editor</button>
      </div>
      <div className="preview-stage">
        <div className="preview-frame preview-frame-one"><span>01</span></div>
        <div className="preview-frame preview-frame-two"><span>02</span></div>
        <div className="preview-frame preview-frame-three"><span>03</span></div>
      </div>
      <div className="preview-timeline">
        <div className="preview-ruler"><span>0:00</span><span>0:04</span><span>0:08</span></div>
        <div className="preview-clip">
          {Array.from({ length: 9 }, (_, index) => <span key={index} style={{ "--frame": index } as React.CSSProperties} />)}
          <i aria-hidden="true" />
        </div>
      </div>
      <div className="preview-inspector">
        <span>Stop motion</span><strong>4 fps</strong>
      </div>
    </div>
  );
}

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <nav aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="https://github.com/sagnik11/autter-video-editor" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <button className="button secondary" type="button" onClick={() => navigate(signedIn ? "/projects" : "/sign-in")}>
            {signedIn ? "Projects" : "Sign in"}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="hero-kicker">A focused browser video editor</p>
            <h1>Turn ordinary footage into deliberate frames.</h1>
            <p>Stop motion, crop, resize, and compression in one private browser workspace.</p>
            <button className="button primary hero-cta" type="button" onClick={() => navigate(signedIn ? "/projects" : "/sign-up")}>
              {signedIn ? "Open projects" : "Create free account"}<ArrowRightIcon />
            </button>
          </div>
          <EditorPreview />
        </section>

        <section className="privacy-note" aria-label="Privacy note">
          <strong>Your browser does the heavy work.</strong>
          <p>Rendering happens locally. Cloudflare stores only the files and projects you choose to save.</p>
        </section>

        <section className="feature-section" id="features">
          <div className="feature-heading">
            <h2>Four tools. Nothing distracting.</h2>
            <p>A compact timeline gives every edit a clear place and a precise preview.</p>
          </div>
          <div className="feature-grid">
            <article className="feature feature-wide">
              <FilmSlateIcon />
              <h3>Custom stop motion</h3>
              <p>Choose 1-24 fps and keep the source timing and audio intact.</p>
            </article>
            <article className="feature"><GaugeIcon /><h3>Compress</h3><p>Balance file size and visual quality.</p></article>
            <article className="feature"><ResizeIcon /><h3>Resize</h3><p>Use social presets or exact dimensions.</p></article>
            <article className="feature"><CropIcon /><h3>Crop</h3><p>Frame freely or use a standard aspect ratio.</p></article>
            <article className="feature feature-timeline"><ScissorsIcon /><h3>Timeline control</h3><p>Scrub, trim, zoom, and preview before export.</p></article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <Brand compact />
        <p>Open source and sponsored by <strong>AUTTER</strong>.</p>
        <a href="https://github.com/sagnik11/autter-video-editor" target="_blank" rel="noreferrer">View source</a>
      </footer>
    </div>
  );
}
