import {
  ArrowRightIcon,
  CropIcon,
  FilmSlateIcon,
  GaugeIcon,
  ResizeIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
import { AutterMark, autterUrl } from "./AutterMark";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { navigate } from "../lib/navigation";

const sourceUrl = "https://github.com/sagnik11/framecut-video-editor";

const tools = [
  {
    icon: FilmSlateIcon,
    index: "1.0",
    name: "Stop motion",
    description: "Pick a rhythm from one to 24 frames per second. Four fps is ready when you are.",
    output: "Custom FPS",
  },
  {
    icon: ScissorsIcon,
    index: "2.0",
    name: "Split",
    description: "Cut at the playhead, audition each part, and download any one as its own MP4.",
    output: "Clean parts",
  },
  {
    icon: CropIcon,
    index: "3.0",
    name: "Crop",
    description: "Keep the good bit. Reframe freely or grab a familiar 16:9, 9:16, 1:1, or 4:5 preset.",
    output: "Exact frame",
  },
  {
    icon: ResizeIcon,
    index: "4.0",
    name: "Resize",
    description: "Make it fit the feed, the screen, or your own exact dimensions without squashing the picture.",
    output: "Up to 8K",
  },
  {
    icon: GaugeIcon,
    index: "5.0",
    name: "Compress",
    description: "Shrink the file with one friendly quality control, then export a dependable MP4.",
    output: "H.264 MP4",
  },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const workspacePath = signedIn ? "/projects" : "/sign-up";

  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand compact />
        <nav aria-label="Primary navigation">
          <a href="#editor-tour">Editor</a>
          <a href={autterUrl} target="_blank" rel="noreferrer">Autter</a>
          <a href={sourceUrl} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <button className="button header-cta" type="button" onClick={() => navigate(workspacePath)}>
            {signedIn ? "Open projects" : "Try the editor"}
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Make stop motion. Right now.</h1>
            <p className="hero-lede">Drop in a clip, pick the rhythm, and shape every frame without learning a giant video suite first.</p>
            <div className="hero-actions">
              <button className="button primary hero-cta" type="button" onClick={() => navigate(workspacePath)}>
                {signedIn ? "Open the editor" : "Try the editor"}<ArrowRightIcon />
              </button>
              <a className="text-link" href="#editor-tour">See how it works</a>
            </div>
            <dl className="hero-notes">
              <div><dt>First move</dt><dd>Pick 4 fps</dd></div>
              <div><dt>Then</dt><dd>Play with the timing</dd></div>
            </dl>
          </div>

          <figure className="hero-media">
            <div className="hero-image-wrap">
              <img
                src="/framecut-editor.jpg"
                alt="Framecut editor showing a four frames-per-second stop-motion project, preview canvas, inspector, and thumbnail timeline"
                width="1280"
                height="720"
                fetchPriority="high"
              />
            </div>
            <span className="frame-character" aria-hidden="true"><i /><i /><strong>4 fps</strong></span>
            <figcaption><span>Actual editor capture</span><span>4 fps stop motion</span></figcaption>
          </figure>
        </section>

        <aside className="privacy-note" aria-label="Privacy and storage">
          <span className="privacy-index">A</span>
          <strong>Your browser does the rendering.</strong>
          <p>Your clip stays close while you work. Only the projects and media you choose to save are stored.</p>
        </aside>

        <section className="editor-tour" id="editor-tour" aria-labelledby="editor-tour-title">
          <div className="section-heading">
            <h2 id="editor-tour-title">Everything stays where you can see it.</h2>
            <p>Preview, play, crop, time, and export without hunting through a maze of menus.</p>
          </div>

          <div className="annotated-editor">
            <figure className="annotated-image">
              <img
                src="/framecut-editor.jpg"
                alt="The Framecut browser editor with four numbered interface callouts"
                width="1280"
                height="720"
                loading="lazy"
              />
              <span className="annotation-pin pin-preview" aria-hidden="true">1</span>
              <span className="annotation-pin pin-tools" aria-hidden="true">2</span>
              <span className="annotation-pin pin-timeline" aria-hidden="true">3</span>
              <span className="annotation-pin pin-export" aria-hidden="true">4</span>
            </figure>
            <ol className="annotation-key">
              <li><span>1</span><div><strong>Source preview</strong><p>Inspect the visible frame and crop boundary.</p></div></li>
              <li><span>2</span><div><strong>Focused inspector</strong><p>Motion, split, crop, resize, and compression stay together.</p></div></li>
              <li><span>3</span><div><strong>Thumbnail timeline</strong><p>Scrub, split, zoom, and set exact in and out points.</p></div></li>
              <li><span>4</span><div><strong>Browser export</strong><p>Render locally, then download or save it to your project.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="workflow-section" id="features" aria-labelledby="tools-title">
          <div className="workflow-intro">
            <h2 id="tools-title">Five moves. One finished clip.</h2>
            <p><span className="head-inline">The order is simple.</span> Set the rhythm, split the take, keep the good part, choose the canvas, then trim the weight.</p>
          </div>
          <ol className="workflow-list">
            {tools.map(({ icon: Icon, index, name, description, output }) => (
              <li className="workflow-step" key={name}>
                <span className="workflow-index">{index}</span>
                <div className="workflow-name">
                  <Icon aria-hidden="true" />
                  <h3>{name}</h3>
                </div>
                <p>{description}</p>
                <span className="workflow-output">{output}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="sponsor-section" aria-labelledby="sponsor-title">
          <div>
            <h2 id="sponsor-title">Open source, with a little help from <a className="sponsor-name-link" href={autterUrl} target="_blank" rel="noreferrer">Autter</a>.</h2>
          </div>
          <div className="sponsor-copy">
            <p>Framecut is a public, browser-based editor. Peek under the hood, pick a roadmap issue, or make the focused media tool you wish existed.</p>
            <div className="sponsor-actions">
              <a className="button secondary" href={sourceUrl} target="_blank" rel="noreferrer">View repository <ArrowRightIcon /></a>
              <AutterMark label="Sponsored by" />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>A small editor with a soft spot for frames.</p>
        <div className="footer-meta">
          <Brand compact />
          <AutterMark />
          <a href={sourceUrl} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>

      <aside className="sticky-action" aria-label="Start editing">
        <p><strong>Start at 4 fps.</strong> Change your mind whenever.</p>
        <button className="button primary" type="button" onClick={() => navigate(workspacePath)}>
          {signedIn ? "Open projects" : "Try the editor"}<ArrowRightIcon />
        </button>
      </aside>
    </div>
  );
}
