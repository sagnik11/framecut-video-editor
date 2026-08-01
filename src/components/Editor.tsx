import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  DownloadSimpleIcon,
  FileVideoIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { EditorSettings, Project } from "../types";
import { defaultEditorSettings, normalizeSettings } from "../types";
import { api, uploadMedia } from "../lib/api";
import { formatBytes, formatDuration } from "../lib/format";
import { navigate } from "../lib/navigation";
import { browserRenderer } from "../lib/renderer";
import { createVideoThumbnails, readVideoMetadata } from "../lib/video";
import { AutterMark } from "./AutterMark";
import { Brand } from "./Brand";
import { Inspector } from "./Inspector";
import { LoadingView } from "./LoadingView";
import { ThemeToggle } from "./ThemeToggle";
import { Timeline } from "./Timeline";

type UploadState = { active: boolean; progress: number; error: string };

export function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [notice, setNotice] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [settings, setSettings] = useState<EditorSettings>(() => defaultEditorSettings());
  const [settingsReady, setSettingsReady] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ active: false, progress: 0, error: "" });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef("");

  const sourceWidth = project?.width ?? settings.crop.width ?? 1920;
  const sourceHeight = project?.height ?? settings.crop.height ?? 1080;
  const sourceDuration = project?.duration ?? settings.trim.end ?? 0;
  const sourceUrl = localUrl || (project?.sourceReady ? `/api/projects/${projectId}/media/source` : "");

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await api.getProject(projectId);
      setProject(loaded);
      const duration = loaded.duration ?? 0;
      const width = loaded.width ?? 1920;
      const height = loaded.height ?? 1080;
      setSettings(normalizeSettings(loaded.settings, duration, width, height));
      setSettingsReady(true);
      setFatalError("");
    } catch (caught) {
      setFatalError(caught instanceof Error ? caught.message : "This project could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  useEffect(() => {
    if (!localFile) {
      setLocalUrl("");
      return;
    }
    const url = URL.createObjectURL(localFile);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  useEffect(() => {
    if (!sourceUrl || !sourceDuration) {
      setThumbnails([]);
      return;
    }
    let cancelled = false;
    setThumbnails([]);
    void createVideoThumbnails(sourceUrl, sourceDuration)
      .then((images) => { if (!cancelled) setThumbnails(images); })
      .catch(() => { if (!cancelled) setThumbnails([]); });
    return () => { cancelled = true; };
  }, [sourceDuration, sourceUrl]);

  useEffect(() => {
    if (!settingsReady || !project) return;
    const timeout = window.setTimeout(() => {
      void api.updateProject(project.id, { settings }).catch(() => setNotice("Changes are local. Cloud autosave is temporarily unavailable."));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [project, settings, settingsReady]);

  useEffect(() => { resultUrlRef.current = resultUrl; }, [resultUrl]);

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      browserRenderer.cancel();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  async function attachFile(file: File) {
    if (!file.type.startsWith("video/") && !/\.(mov|mp4|m4v|webm|avi|mkv)$/i.test(file.name)) {
      setUpload({ active: false, progress: 0, error: "Choose a supported video file." });
      return;
    }

    setUpload({ active: true, progress: 0, error: "" });
    setNotice("");
    try {
      const metadata = await readVideoMetadata(file);
      if (!metadata.duration || !metadata.width || !metadata.height) throw new Error("The video metadata could not be read.");
      const nextSettings = defaultEditorSettings(metadata.duration, metadata.width, metadata.height);
      setLocalFile(file);
      setSettings(nextSettings);
      setSettingsReady(true);
      setCurrentTime(0);
      setThumbnails([]);

      const prepared = await api.updateProject(projectId, {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        settings: nextSettings,
      });
      setProject(prepared);

      const uploaded = await uploadMedia({
        projectId,
        blob: file,
        fileName: file.name,
        contentType: file.type || "video/mp4",
        kind: "source",
        metadata,
        onProgress: (progress) => setUpload({ active: true, progress, error: "" }),
      });
      setProject(uploaded);
      setUpload({ active: false, progress: 100, error: "" });
      setNotice("Source video saved to Cloudflare R2.");
    } catch (caught) {
      setUpload({ active: false, progress: 0, error: caught instanceof Error ? caught.message : "The video could not be added." });
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void attachFile(file);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void attachFile(file);
  }

  function seek(time: number) {
    const bounded = Math.max(0, Math.min(sourceDuration, time));
    setCurrentTime(bounded);
    if (videoRef.current) videoRef.current.currentTime = bounded;
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < settings.trim.start || video.currentTime >= settings.trim.end - 0.02) {
      video.currentTime = settings.trim.start;
    }
    await video.play();
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime >= settings.trim.end) {
      video.pause();
      video.currentTime = settings.trim.end;
    }
    setCurrentTime(video.currentTime);
  }

  async function renameProject() {
    if (!project || !project.name.trim()) return;
    try {
      setProject(await api.updateProject(project.id, { name: project.name.trim() }));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The project name could not be saved.");
    }
  }

  async function renderVideo() {
    if (!project || !sourceUrl || exporting) return;
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setExporting(true);
    setExportProgress(0);
    setExportStatus("Starting browser renderer...");
    setNotice("");

    try {
      const source: File | string = localFile ?? sourceUrl;
      const rendered = await browserRenderer.render(
        source,
        localFile?.name ?? project.sourceName ?? "source.mp4",
        settings,
        (progress) => setExportProgress(Math.round(progress * 0.82)),
        setExportStatus,
      );
      if (abortController.signal.aborted) return;

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const nextResultUrl = URL.createObjectURL(rendered);
      setResultUrl(nextResultUrl);
      setExportProgress(84);
      setExportStatus("Saving export to Cloudflare R2...");

      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "framecut";
      const updated = await uploadMedia({
        projectId,
        blob: rendered,
        fileName: `${safeName}.mp4`,
        contentType: "video/mp4",
        kind: "export",
        onProgress: (progress) => setExportProgress(84 + Math.round(progress * 0.16)),
        signal: abortController.signal,
      });
      setProject(updated);
      setExportProgress(100);
      setExportStatus("Export ready.");
      setNotice("Export saved to Cloudflare R2 and ready to download.");
    } catch (caught) {
      if (!abortController.signal.aborted) {
        console.error("Export failed", caught);
        const message = caught instanceof Error
          ? caught.message
          : typeof caught === "string"
            ? caught
            : "The export could not be completed.";
        setNotice(message);
      }
    } finally {
      setExporting(false);
      exportAbortRef.current = null;
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
    browserRenderer.cancel();
    setExporting(false);
    setExportStatus("Export cancelled.");
    setExportProgress(0);
    setNotice("Export cancelled. Your project is unchanged.");
  }

  if (loading) return <LoadingView label="Opening editor..." />;

  if (fatalError || !project) {
    return (
      <main className="fatal-view">
        <WarningCircleIcon />
        <h1>Project unavailable</h1>
        <p>{fatalError || "This project could not be found."}</p>
        <button className="button primary" type="button" onClick={() => navigate("/projects")}>Back to projects</button>
      </main>
    );
  }

  const cropStyle = settings.crop.enabled ? {
    left: `${(settings.crop.x / sourceWidth) * 100}%`,
    top: `${(settings.crop.y / sourceHeight) * 100}%`,
    width: `${(settings.crop.width / sourceWidth) * 100}%`,
    height: `${(settings.crop.height / sourceHeight) * 100}%`,
  } : undefined;

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="icon-button" type="button" onClick={() => navigate("/projects")} aria-label="Back to projects"><ArrowLeftIcon /></button>
          <Brand compact />
          <span className="header-divider" />
          <input className="project-name-input" value={project.name} maxLength={80} aria-label="Project name" onChange={(event) => setProject({ ...project, name: event.target.value })} onBlur={() => void renameProject()} />
        </div>
        <div className="editor-header-right">
          {upload.active ? <span className="cloud-status"><CloudArrowUpIcon /> Uploading {upload.progress}%</span> : project.sourceReady ? <span className="cloud-status saved"><CheckCircleIcon weight="fill" /> Saved</span> : null}
          <AutterMark compact />
          <ThemeToggle />
          <button className="button primary" type="button" onClick={() => void renderVideo()} disabled={!sourceUrl || exporting}><DownloadSimpleIcon /> Export</button>
        </div>
      </header>

      <main className="editor-main">
        <section className="workspace-stage" aria-label="Video preview">
          {sourceUrl ? (
            <>
              <div className="video-canvas" style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}>
                <video
                  key={sourceUrl}
                  ref={videoRef}
                  src={sourceUrl}
                  preload="metadata"
                  playsInline
                  onTimeUpdate={onTimeUpdate}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={() => void togglePlay()}
                />
                {cropStyle && <div className="crop-guide" style={cropStyle}><span /><span /><span /><span /></div>}
              </div>
              <div className="source-meta">
                <span>{project.sourceName ?? localFile?.name}</span>
                <span>{sourceWidth} × {sourceHeight}</span>
                <span>{formatDuration(sourceDuration)}</span>
                <span>{formatBytes(project.sourceSize ?? localFile?.size)}</span>
              </div>
            </>
          ) : (
            <div className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              <span className="upload-icon"><FileVideoIcon /></span>
              <h2>Add your source video</h2>
              <p>Drop a clip here or choose one from your device.</p>
              <button className="button primary" type="button" onClick={() => fileInputRef.current?.click()}><UploadSimpleIcon /> Choose video</button>
              <small>MP4, MOV, WebM, AVI, or MKV. Maximum 2 GB in this starter.</small>
            </div>
          )}
          {upload.error && <div className="stage-error" role="alert"><WarningCircleIcon /><span>{upload.error}</span><button type="button" onClick={() => fileInputRef.current?.click()}>Choose another</button></div>}
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*,.mov,.m4v,.mkv,.avi" onChange={onFileInput} />
        </section>

        <Inspector
          settings={settings}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          exporting={exporting}
          progress={exportProgress}
          exportStatus={exportStatus}
          resultUrl={resultUrl}
          onChange={setSettings}
          onExport={() => void renderVideo()}
          onCancel={cancelExport}
        />

        <Timeline
          duration={sourceDuration}
          currentTime={currentTime}
          trimStart={settings.trim.start}
          trimEnd={settings.trim.end}
          thumbnails={thumbnails}
          playing={playing}
          onTogglePlay={() => void togglePlay()}
          onSeek={seek}
          onTrimChange={(start, end) => setSettings({ ...settings, trim: { start, end } })}
        />
      </main>

      {notice && <button className="workspace-notice" type="button" onClick={() => setNotice("")} aria-label="Dismiss message">{notice}</button>}
    </div>
  );
}
