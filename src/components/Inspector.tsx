import {
  ArrowsOutIcon,
  CropIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  GaugeIcon,
  ScissorsIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { CropSettings, EditorSettings } from "../types";
import { even, formatDuration } from "../lib/format";

type Tab = "motion" | "crop" | "resize" | "compress" | "export";

type InspectorProps = {
  settings: EditorSettings;
  sourceWidth: number;
  sourceHeight: number;
  exporting: boolean;
  progress: number;
  exportStatus: string;
  resultUrl: string;
  onChange: (settings: EditorSettings) => void;
  onExport: () => void;
  onCancel: () => void;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof FilmSlateIcon }> = [
  { id: "motion", label: "Motion", icon: FilmSlateIcon },
  { id: "crop", label: "Crop", icon: CropIcon },
  { id: "resize", label: "Resize", icon: ArrowsOutIcon },
  { id: "compress", label: "Compress", icon: GaugeIcon },
  { id: "export", label: "Export", icon: DownloadSimpleIcon },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button className={`toggle ${checked ? "active" : ""}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><i /></button>
    </label>
  );
}

function aspectCrop(aspect: CropSettings["aspect"], sourceWidth: number, sourceHeight: number): Pick<CropSettings, "x" | "y" | "width" | "height"> {
  if (aspect === "free") return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const [horizontal, vertical] = aspect.split(":").map(Number);
  const target = horizontal / vertical;
  const source = sourceWidth / sourceHeight;
  const width = even(source > target ? sourceHeight * target : sourceWidth);
  const height = even(source > target ? sourceHeight : sourceWidth / target);
  return { x: even((sourceWidth - width) / 2), y: even((sourceHeight - height) / 2), width, height };
}

export function Inspector(props: InspectorProps) {
  const { settings, sourceWidth, sourceHeight, exporting, progress, exportStatus, resultUrl, onChange, onExport, onCancel } = props;
  const [tab, setTab] = useState<Tab>("motion");

  function patch<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function setAspect(aspect: CropSettings["aspect"]) {
    patch("crop", { ...settings.crop, aspect, ...aspectCrop(aspect, sourceWidth, sourceHeight) });
  }

  function setCropField(field: "x" | "y" | "width" | "height", value: number) {
    const crop = { ...settings.crop, aspect: "free" as const, [field]: value };
    crop.x = Math.max(0, Math.min(crop.x, sourceWidth - 2));
    crop.y = Math.max(0, Math.min(crop.y, sourceHeight - 2));
    crop.width = Math.max(2, Math.min(crop.width, sourceWidth - crop.x));
    crop.height = Math.max(2, Math.min(crop.height, sourceHeight - crop.y));
    patch("crop", crop);
  }

  return (
    <aside className="inspector-panel" aria-label="Edit controls">
      <div className="inspector-tabs" role="tablist" aria-label="Edit tools">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)} role="tab" aria-selected={tab === id} title={label}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === "motion" && (
          <section className="control-section">
            <div className="control-heading"><FilmSlateIcon /><div><h2>Stop motion</h2><p>Hold sampled frames while preserving the clip timing.</p></div></div>
            <Toggle checked={settings.stopMotion.enabled} onChange={(enabled) => patch("stopMotion", { ...settings.stopMotion, enabled })} label="Enable effect" />
            <label className="range-control">
              <span>Frame rate <strong>{settings.stopMotion.fps} fps</strong></span>
              <input type="range" min="1" max="24" step="1" value={settings.stopMotion.fps} disabled={!settings.stopMotion.enabled} onChange={(event) => patch("stopMotion", { ...settings.stopMotion, fps: Number(event.target.value) })} />
              <small><span>More stepped</span><span>Smoother</span></small>
            </label>
            <p className={`preview-status ${settings.stopMotion.enabled ? "active" : ""}`} aria-live="polite">
              <i aria-hidden="true" />
              {settings.stopMotion.enabled ? `Previewing live at ${settings.stopMotion.fps} fps` : "Enable the effect to preview it live"}
            </p>
            <div className="trim-summary"><ScissorsIcon /><span>Export range</span><strong>{formatDuration(settings.trim.end - settings.trim.start)}</strong></div>
          </section>
        )}

        {tab === "crop" && (
          <section className="control-section">
            <div className="control-heading"><CropIcon /><div><h2>Crop</h2><p>Reframe the visible part of your source.</p></div></div>
            <Toggle checked={settings.crop.enabled} onChange={(enabled) => patch("crop", { ...settings.crop, enabled })} label="Enable crop" />
            <fieldset disabled={!settings.crop.enabled}>
              <legend>Aspect ratio</legend>
              <div className="preset-grid crop-presets">
                {(["free", "16:9", "9:16", "1:1", "4:5"] as const).map((aspect) => (
                  <button key={aspect} type="button" className={settings.crop.aspect === aspect ? "active" : ""} onClick={() => setAspect(aspect)}>{aspect === "free" ? "Free" : aspect}</button>
                ))}
              </div>
              <div className="number-grid">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <label key={field}><span>{field === "width" ? "Width" : field === "height" ? "Height" : field.toUpperCase()}</span><input type="number" min={field === "width" || field === "height" ? "2" : "0"} max={field === "x" || field === "width" ? sourceWidth : sourceHeight} value={Math.round(settings.crop[field])} onChange={(event) => setCropField(field, Number(event.target.value))} /></label>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {tab === "resize" && (
          <section className="control-section">
            <div className="control-heading"><ArrowsOutIcon /><div><h2>Resize</h2><p>Fit the video inside exact output dimensions.</p></div></div>
            <Toggle checked={settings.resize.enabled} onChange={(enabled) => patch("resize", { ...settings.resize, enabled })} label="Enable resize" />
            <fieldset disabled={!settings.resize.enabled}>
              <legend>Output preset</legend>
              <div className="preset-grid">
                {[
                  ["1080p", 1920, 1080], ["720p", 1280, 720], ["Square", 1080, 1080], ["Vertical", 1080, 1920],
                ].map(([label, width, height]) => (
                  <button key={label} type="button" className={settings.resize.width === width && settings.resize.height === height ? "active" : ""} onClick={() => patch("resize", { enabled: true, width: Number(width), height: Number(height) })}>{label}</button>
                ))}
              </div>
              <div className="number-grid two">
                <label><span>Width</span><input type="number" min="2" max="8192" step="2" value={settings.resize.width} onChange={(event) => patch("resize", { ...settings.resize, width: Number(event.target.value) })} /></label>
                <label><span>Height</span><input type="number" min="2" max="8192" step="2" value={settings.resize.height} onChange={(event) => patch("resize", { ...settings.resize, height: Number(event.target.value) })} /></label>
              </div>
              <p className="control-note">Aspect ratio is preserved. Empty space is letterboxed.</p>
            </fieldset>
          </section>
        )}

        {tab === "compress" && (
          <section className="control-section">
            <div className="control-heading"><GaugeIcon /><div><h2>Compression</h2><p>Choose the visual quality of the H.264 export.</p></div></div>
            <label className="range-control quality-range">
              <span>Quality <strong>{settings.compression.quality}</strong></span>
              <input type="range" min="0" max="100" step="1" value={settings.compression.quality} onChange={(event) => patch("compression", { quality: Number(event.target.value) })} />
              <small><span>Smaller file</span><span>Sharper image</span></small>
            </label>
            <p className="control-note">Actual file size depends on movement, detail, duration, and source noise.</p>
          </section>
        )}

        {tab === "export" && (
          <section className="control-section export-controls">
            <div className="control-heading"><DownloadSimpleIcon /><div><h2>Export</h2><p>Render in your browser, then save the result to your project.</p></div></div>
            <dl className="export-summary">
              <div><dt>Duration</dt><dd>{formatDuration(settings.trim.end - settings.trim.start)}</dd></div>
              <div><dt>Frame cadence</dt><dd>{settings.stopMotion.enabled ? `${settings.stopMotion.fps} fps stop motion` : "Original motion"}</dd></div>
              <div><dt>Output</dt><dd>{settings.resize.enabled ? `${settings.resize.width} × ${settings.resize.height}` : "Source dimensions"}</dd></div>
              <div><dt>Format</dt><dd>MP4, H.264</dd></div>
            </dl>
            {exporting ? (
              <div className="export-progress" aria-live="polite">
                <div><span>{exportStatus}</span><strong>{progress}%</strong></div>
                <progress max="100" value={progress}>{progress}%</progress>
                <button className="button secondary" type="button" onClick={onCancel}><StopIcon weight="fill" /> Cancel</button>
              </div>
            ) : (
              <button className="button primary export-button" type="button" onClick={onExport}><DownloadSimpleIcon /> Render video</button>
            )}
            {resultUrl && !exporting && <a className="button secondary download-button" href={resultUrl} download="framecut-export.mp4"><DownloadSimpleIcon /> Download latest export</a>}
          </section>
        )}
      </div>
    </aside>
  );
}
