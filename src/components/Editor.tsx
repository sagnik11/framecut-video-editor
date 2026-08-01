import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileVideoIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import type { EditorSettings, Project } from "../types";
import { defaultEditorSettings, normalizeSettings } from "../types";
import { api, uploadMedia } from "../lib/api";
import { moveCrop, resizeCrop } from "../lib/crop-interaction";
import type { CropHandle } from "../lib/crop-interaction";
import { formatBytes, formatDuration } from "../lib/format";
import { navigate } from "../lib/navigation";
import { browserRenderer } from "../lib/renderer";
import { buildClipTimeline, clipLocalTime, findTimelineClipIndex } from "../lib/clip-timeline";
import { getStopMotionFrameIndex } from "../lib/stop-motion-preview";
import { createVideoThumbnails, readVideoMetadata } from "../lib/video";
import { getSegmentIndexAtTime, getVideoSegments, normalizeSplitPoints } from "../lib/video-split";
import { AutterMark } from "./AutterMark";
import { Brand } from "./Brand";
import { Inspector } from "./Inspector";
import { LoadingView } from "./LoadingView";
import { ThemeToggle } from "./ThemeToggle";
import { Timeline } from "./Timeline";

type UploadState = { active: boolean; progress: number; error: string };
type CropDrag = {
  handle: CropHandle | "move";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  crop: EditorSettings["crop"];
};

export function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [notice, setNotice] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [settings, setSettings] = useState<EditorSettings>(() => defaultEditorSettings());
  const [settingsReady, setSettingsReady] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string[]>>({});
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ active: false, progress: 0, error: "" });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [exportingSegmentIndex, setExportingSegmentIndex] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [resultFileName, setResultFileName] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewFrameIndexRef = useRef(-1);
  const cropDragRef = useRef<CropDrag | null>(null);
  const [activeCropDrag, setActiveCropDrag] = useState<CropDrag["handle"] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef("");
  const pendingSeekRef = useRef<number | null>(null);
  const autoPlayAfterLoadRef = useRef(false);

  const sourceWidth = project?.width ?? settings.crop.width ?? 1920;
  const sourceHeight = project?.height ?? settings.crop.height ?? 1080;
  const sourceDuration = project?.duration ?? settings.trim.end ?? 0;
  const timelineClips = useMemo(() => {
    const clips = project?.clips.length
      ? project.clips
      : localFile && project
        ? [{
            id: "source", name: localFile.name, type: localFile.type || "video/mp4", size: localFile.size,
            duration: project.duration ?? 0, width: project.width ?? 1920, height: project.height ?? 1080, position: 0,
          }]
        : [];
    return buildClipTimeline(clips);
  }, [localFile, project]);
  const selectedClipIndex = Math.min(activeClipIndex, Math.max(0, timelineClips.length - 1));
  const activeClip = timelineClips[selectedClipIndex];
  const sourceUrl = activeClip
    ? activeClip.id === "source" && localUrl
      ? localUrl
      : `/api/projects/${projectId}/clips/${encodeURIComponent(activeClip.id)}/media`
    : "";
  const segments = getVideoSegments(settings.trim.start, settings.trim.end, settings.split.points);
  const selectedSegmentIndex = Math.min(activeSegmentIndex, Math.max(0, segments.length - 1));
  const activeSegment = segments[selectedSegmentIndex] ?? { index: 0, start: settings.trim.start, end: settings.trim.end, duration: settings.trim.end - settings.trim.start };

  const drawStopMotionFrame = useCallback((force = false) => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!settings.stopMotion.enabled || !video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const timelineTime = (activeClip?.start ?? 0) + video.currentTime;
    const frameIndex = getStopMotionFrameIndex(timelineTime, activeSegment.start, settings.stopMotion.fps);
    if (!force && frameIndex === previewFrameIndexRef.current) return;

    const width = sourceWidth;
    const height = sourceHeight;
    if (!width || !height || !video.videoWidth || !video.videoHeight) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    context.fillStyle = "#050505";
    context.fillRect(0, 0, width, height);
    context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    previewFrameIndexRef.current = frameIndex;
    canvas.dataset.frameIndex = String(frameIndex);
    canvas.dataset.previewFps = String(settings.stopMotion.fps);
  }, [activeClip?.start, activeSegment.start, settings.stopMotion.enabled, settings.stopMotion.fps, sourceHeight, sourceWidth]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await api.getProject(projectId);
      setProject(loaded);
      const duration = loaded.duration ?? 0;
      const width = loaded.width ?? 1920;
      const height = loaded.height ?? 1080;
      const nextSettings = normalizeSettings(loaded.settings, duration, width, height);
      setSettings(nextSettings);
      setCurrentTime(nextSettings.trim.start);
      setActiveSegmentIndex(0);
      setActiveClipIndex(0);
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
    if (!project?.sourceReady || timelineClips.length === 0) {
      setThumbnails({});
      return;
    }
    let cancelled = false;
    setThumbnails({});
    void Promise.all(timelineClips.map(async (clip) => {
      const url = clip.id === "source" && localUrl
        ? localUrl
        : `/api/projects/${projectId}/clips/${encodeURIComponent(clip.id)}/media`;
      try {
        return [clip.id, await createVideoThumbnails(url, clip.duration, 4)] as const;
      } catch {
        return [clip.id, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setThumbnails(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [localUrl, project?.sourceReady, projectId, timelineClips]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    previewFrameIndexRef.current = -1;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      delete canvas.dataset.frameIndex;
    }

    if (!settings.stopMotion.enabled) return;

    let animationFrame = 0;
    const tick = () => {
      drawStopMotionFrame();
      if (playing) animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [drawStopMotionFrame, playing, settings.stopMotion.enabled, sourceUrl]);

  useEffect(() => {
    if (!settingsReady || !project) return;
    const timeout = window.setTimeout(() => {
      void api.updateProject(project.id, { settings }).catch(() => setNotice("Changes are local. Autosave is temporarily unavailable."));
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
      setActiveSegmentIndex(0);
      setThumbnails({});

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
      setActiveClipIndex(0);
      setUpload({ active: false, progress: 100, error: "" });
      setNotice("Source video saved to your project.");
    } catch (caught) {
      setUpload({ active: false, progress: 0, error: caught instanceof Error ? caught.message : "The video could not be added." });
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void attachFile(file);
    event.target.value = "";
  }

  async function appendFiles(files: File[]) {
    if (!project?.sourceReady || files.length === 0 || upload.active) return;
    const remaining = 20 - timelineClips.length;
    const selected = files.slice(0, remaining);
    if (selected.length === 0) {
      setNotice("A timeline can contain up to 20 videos.");
      return;
    }
    const invalid = selected.find((file) => !file.type.startsWith("video/") && !/\.(mov|mp4|m4v|webm|avi|mkv)$/i.test(file.name));
    if (invalid) {
      setUpload({ active: false, progress: 0, error: `${invalid.name} is not a supported video.` });
      return;
    }

    setUpload({ active: true, progress: 0, error: "" });
    setNotice("");
    try {
      let updatedProject = project;
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        const metadata = await readVideoMetadata(file);
        if (!metadata.duration || !metadata.width || !metadata.height) throw new Error(`${file.name} metadata could not be read.`);
        updatedProject = await uploadMedia({
          projectId,
          blob: file,
          fileName: file.name,
          contentType: file.type || "video/mp4",
          kind: "clip",
          metadata,
          onProgress: (progress) => setUpload({
            active: true,
            progress: Math.round(((index + progress / 100) / selected.length) * 100),
            error: "",
          }),
        });
        setProject(updatedProject);
      }

      const duration = updatedProject.duration ?? 0;
      const nextSettings = normalizeSettings({
        ...settings,
        trim: { start: settings.trim.start, end: duration },
      }, duration, sourceWidth, sourceHeight);
      updatedProject = await api.updateProject(projectId, { settings: nextSettings });
      const nextTimeline = buildClipTimeline(updatedProject.clips);
      const lastIndex = Math.max(0, nextTimeline.length - 1);
      setProject(updatedProject);
      setSettings(nextSettings);
      setActiveClipIndex(lastIndex);
      setCurrentTime(nextTimeline[lastIndex]?.start ?? 0);
      pendingSeekRef.current = 0;
      setUpload({ active: false, progress: 100, error: "" });
      setNotice(`${selected.length} ${selected.length === 1 ? "video" : "videos"} added to the end of the timeline.`);
    } catch (caught) {
      setUpload({ active: false, progress: 0, error: caught instanceof Error ? caught.message : "The video could not be added." });
    }
  }

  function onAppendInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) void appendFiles(files);
    event.target.value = "";
  }

  async function removeActiveClip() {
    if (!project || !activeClip || timelineClips.length <= 1 || upload.active) return;
    if (!window.confirm(`Remove “${activeClip.name}” from this timeline?`)) return;
    videoRef.current?.pause();
    setUpload({ active: true, progress: 0, error: "" });
    try {
      const removedLocalSource = activeClip.id === "source" && Boolean(localFile);
      let updated = await api.deleteClip(project.id, activeClip.id);
      const duration = updated.duration ?? 0;
      const nextSettings = normalizeSettings({
        ...settings,
        trim: { start: Math.min(settings.trim.start, duration), end: duration },
      }, duration, updated.width ?? sourceWidth, updated.height ?? sourceHeight);
      updated = await api.updateProject(project.id, { settings: nextSettings });
      const nextTimeline = buildClipTimeline(updated.clips);
      const nextIndex = Math.min(selectedClipIndex, Math.max(0, nextTimeline.length - 1));
      setProject(updated);
      if (removedLocalSource) setLocalFile(null);
      setSettings(nextSettings);
      setActiveClipIndex(nextIndex);
      setCurrentTime(nextTimeline[nextIndex]?.start ?? 0);
      pendingSeekRef.current = 0;
      setUpload({ active: false, progress: 100, error: "" });
      setNotice("Video removed. The remaining clips closed the gap.");
    } catch (caught) {
      setUpload({ active: false, progress: 0, error: caught instanceof Error ? caught.message : "The video could not be removed." });
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void attachFile(file);
  }

  function seek(time: number, playAfterSeek?: boolean) {
    const bounded = Math.max(0, Math.min(sourceDuration, time));
    const clipIndex = findTimelineClipIndex(timelineClips, bounded);
    const clip = timelineClips[clipIndex];
    const localTime = clip ? clipLocalTime(clip, bounded) : bounded;
    const shouldPlay = playAfterSeek ?? Boolean(videoRef.current && !videoRef.current.paused);
    setActiveSegmentIndex(getSegmentIndexAtTime(segments, bounded));
    setCurrentTime(bounded);
    if (clipIndex !== selectedClipIndex) {
      pendingSeekRef.current = localTime;
      autoPlayAfterLoadRef.current = shouldPlay;
      videoRef.current?.pause();
      setActiveClipIndex(clipIndex);
    } else if (videoRef.current) {
      videoRef.current.currentTime = localTime;
      if (shouldPlay) void videoRef.current.play().catch(() => undefined);
    }
  }

  function selectSegment(index: number) {
    const segment = segments[Math.max(0, Math.min(index, segments.length - 1))];
    if (!segment) return;
    videoRef.current?.pause();
    setActiveSegmentIndex(segment.index);
    seek(segment.start, false);
  }

  function splitAtPlayhead() {
    const nextPoints = normalizeSplitPoints([...settings.split.points, currentTime], settings.trim.start, settings.trim.end);
    if (nextPoints.length === settings.split.points.length) {
      setNotice("Move the playhead away from an existing split or part edge.");
      return;
    }
    const nextSegments = getVideoSegments(settings.trim.start, settings.trim.end, nextPoints);
    const splitPointIndex = nextPoints.reduce((closestIndex, point, index) => (
      Math.abs(point - currentTime) < Math.abs(nextPoints[closestIndex] - currentTime) ? index : closestIndex
    ), 0);
    const splitPoint = nextPoints[splitPointIndex];
    videoRef.current?.pause();
    setSettings({ ...settings, split: { points: nextPoints } });
    seek(splitPoint, false);
    setActiveSegmentIndex(Math.min(splitPointIndex + 1, nextSegments.length - 1));
    setNotice(`Split added at ${formatDuration(splitPoint)}.`);
  }

  function removeSplit(pointIndex: number) {
    const nextPoints = settings.split.points.filter((_, index) => index !== pointIndex);
    const nextSegments = getVideoSegments(settings.trim.start, settings.trim.end, nextPoints);
    setSettings({ ...settings, split: { points: nextPoints } });
    setActiveSegmentIndex(getSegmentIndexAtTime(nextSegments, currentTime));
    setNotice("Split removed. The neighboring parts are joined again.");
  }

  function changeTrim(start: number, end: number) {
    const nextPoints = normalizeSplitPoints(settings.split.points, start, end);
    const nextSegments = getVideoSegments(start, end, nextPoints);
    setSettings({ ...settings, trim: { start, end }, split: { points: nextPoints } });
    setActiveSegmentIndex(getSegmentIndexAtTime(nextSegments, currentTime));
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (currentTime < activeSegment.start || currentTime >= activeSegment.end - 0.02) {
      seek(activeSegment.start, true);
      return;
    }
    await video.play();
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    const timelineTime = Math.min(activeClip.end, activeClip.start + video.currentTime);
    if (timelineTime >= activeSegment.end) {
      video.pause();
      video.currentTime = clipLocalTime(activeClip, activeSegment.end);
      setCurrentTime(activeSegment.end);
      return;
    }
    setCurrentTime(timelineTime);
  }

  function onVideoLoaded() {
    const video = videoRef.current;
    if (!video) return;
    if (pendingSeekRef.current !== null) {
      video.currentTime = Math.min(video.duration || Number.POSITIVE_INFINITY, pendingSeekRef.current);
      pendingSeekRef.current = null;
    }
    drawStopMotionFrame(true);
    if (autoPlayAfterLoadRef.current) {
      autoPlayAfterLoadRef.current = false;
      void video.play().catch(() => setPlaying(false));
    }
  }

  function onVideoEnded() {
    if (!activeClip) return;
    const boundary = Math.min(activeClip.end, activeSegment.end);
    if (activeClip.end < activeSegment.end - 0.02 && selectedClipIndex < timelineClips.length - 1) {
      seek(activeClip.end, true);
      return;
    }
    setPlaying(false);
    setCurrentTime(boundary);
  }

  function startCropDrag(event: ReactPointerEvent<HTMLElement>, handle: CropDrag["handle"]) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const guide = event.currentTarget.closest<HTMLDivElement>(".crop-guide");
    if (!guide) return;
    const stage = guide.parentElement?.getBoundingClientRect();
    if (!stage?.width || !stage.height) return;

    event.preventDefault();
    event.stopPropagation();
    videoRef.current?.pause();
    try {
      guide.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers and interrupted touch gestures may not be capturable.
    }
    cropDragRef.current = {
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: stage.width,
      stageHeight: stage.height,
      sourceWidth,
      sourceHeight,
      crop: { ...settings.crop },
    };
    setActiveCropDrag(handle);
  }

  function updateCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const deltaX = ((event.clientX - drag.startClientX) / drag.stageWidth) * drag.sourceWidth;
    const deltaY = ((event.clientY - drag.startClientY) / drag.stageHeight) * drag.sourceHeight;
    const crop = drag.handle === "move"
      ? moveCrop(drag.crop, deltaX, deltaY, drag.sourceWidth, drag.sourceHeight)
      : resizeCrop(drag.crop, drag.handle, deltaX, deltaY, drag.sourceWidth, drag.sourceHeight);
    setSettings((current) => ({ ...current, crop }));
  }

  function finishCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cropDragRef.current = null;
    setActiveCropDrag(null);
  }

  async function renameProject() {
    if (!project || !project.name.trim()) return;
    try {
      setProject(await api.updateProject(project.id, { name: project.name.trim() }));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The project name could not be saved.");
    }
  }

  async function renderVideo(targetSegmentIndex = selectedSegmentIndex, downloadWhenReady = false) {
    if (!project || timelineClips.length === 0 || exporting) return;
    const targetSegment = segments[Math.max(0, Math.min(targetSegmentIndex, segments.length - 1))];
    if (!targetSegment) return;
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setExporting(true);
    setExportingSegmentIndex(targetSegment.index);
    setExportProgress(0);
    setExportStatus("Starting browser renderer...");
    setNotice("");

    try {
      const renderSources = timelineClips.map((clip) => ({
        source: clip.id === "source" && localFile
          ? localFile
          : `/api/projects/${projectId}/clips/${encodeURIComponent(clip.id)}/media`,
        name: clip.name,
        duration: clip.duration,
        width: clip.width,
        height: clip.height,
      }));
      const exportSettings: EditorSettings = {
        ...settings,
        trim: { start: targetSegment.start, end: targetSegment.end },
      };
      const rendered = await browserRenderer.render(
        renderSources,
        exportSettings,
        (progress) => setExportProgress(Math.round(progress * 0.82)),
        setExportStatus,
      );
      if (abortController.signal.aborted) return;

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const nextResultUrl = URL.createObjectURL(rendered);
      setResultUrl(nextResultUrl);
      setExportProgress(84);

      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "framecut";
      const fileName = segments.length > 1 ? `${safeName}-part-${targetSegment.index + 1}.mp4` : `${safeName}.mp4`;
      setResultFileName(fileName);

      if (downloadWhenReady) {
        const download = document.createElement("a");
        download.href = nextResultUrl;
        download.download = fileName;
        download.style.display = "none";
        document.body.append(download);
        download.click();
        download.remove();
        setExportProgress(100);
        setExportStatus("Download ready.");
        setNotice(`${segments.length > 1 ? `Part ${targetSegment.index + 1}` : "Video"} is ready. The download has started.`);
        return;
      }

      setExportStatus("Saving export to your project...");
      const updated = await uploadMedia({
        projectId,
        blob: rendered,
        fileName,
        contentType: "video/mp4",
        kind: "export",
        onProgress: (progress) => setExportProgress(84 + Math.round(progress * 0.16)),
        signal: abortController.signal,
      });
      setProject(updated);
      setExportProgress(100);
      setExportStatus("Export ready.");
      setNotice(`${segments.length > 1 ? `Part ${targetSegment.index + 1}` : "Export"} saved to your project and ready to download.`);
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
      setExportingSegmentIndex(null);
      exportAbortRef.current = null;
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
    browserRenderer.cancel();
    setExporting(false);
    setExportingSegmentIndex(null);
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
          {upload.active ? <span className="save-status"><UploadSimpleIcon /> Uploading {upload.progress}%</span> : project.sourceReady ? <span className="save-status saved"><CheckCircleIcon weight="fill" /> Saved</span> : null}
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
                  onLoadedData={onVideoLoaded}
                  onSeeked={() => drawStopMotionFrame(true)}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={onVideoEnded}
                  onPlay={() => setPlaying(true)}
                  onPause={() => {
                    setPlaying(false);
                    drawStopMotionFrame(true);
                  }}
                  onClick={() => void togglePlay()}
                />
                <canvas
                  ref={previewCanvasRef}
                  className="stop-motion-preview"
                  hidden={!settings.stopMotion.enabled}
                  aria-hidden="true"
                />
                {settings.stopMotion.enabled && (
                  <span className="preview-mode-badge" aria-live="polite">Live preview · {settings.stopMotion.fps} fps</span>
                )}
                {cropStyle && (
                  <div
                    className="crop-guide"
                    style={cropStyle}
                    role="group"
                    aria-label="Crop selection. Drag to move it or drag a corner to resize it."
                    data-dragging={activeCropDrag ?? undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerDown={(event) => startCropDrag(event, "move")}
                    onPointerMove={updateCropDrag}
                    onPointerUp={finishCropDrag}
                    onPointerCancel={finishCropDrag}
                    onLostPointerCapture={finishCropDrag}
                  >
                    {(["nw", "ne", "se", "sw"] as const).map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        className={`crop-handle crop-handle-${handle}`}
                        aria-label={`Resize crop from the ${handle} corner`}
                        onPointerDown={(event) => startCropDrag(event, handle)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="source-meta">
                <span>{activeClip?.name}</span>
                <span>Video {selectedClipIndex + 1} of {timelineClips.length}</span>
                <span>{activeClip?.width} × {activeClip?.height}</span>
                <span>{formatDuration(activeClip?.duration ?? 0)}</span>
                <span>{formatBytes(activeClip?.size)}</span>
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
          {upload.error && <div className="stage-error" role="alert"><WarningCircleIcon /><span>{upload.error}</span><button type="button" onClick={() => (project.sourceReady ? appendInputRef.current : fileInputRef.current)?.click()}>Choose another</button></div>}
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*,.mov,.m4v,.mkv,.avi" onChange={onFileInput} />
          <input ref={appendInputRef} className="visually-hidden" type="file" accept="video/*,.mov,.m4v,.mkv,.avi" multiple onChange={onAppendInput} />
        </section>

        <Inspector
          settings={settings}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          exporting={exporting}
          progress={exportProgress}
          exportStatus={exportStatus}
          resultUrl={resultUrl}
          resultFileName={resultFileName}
          currentTime={currentTime}
          activeSegmentIndex={selectedSegmentIndex}
          exportingSegmentIndex={exportingSegmentIndex}
          onChange={setSettings}
          onSplitHere={splitAtPlayhead}
          onRemoveSplit={removeSplit}
          onSelectSegment={selectSegment}
          onDownloadSegment={(index) => void renderVideo(index, true)}
          onExport={() => void renderVideo()}
          onCancel={cancelExport}
        />

        <Timeline
          duration={sourceDuration}
          currentTime={currentTime}
          trimStart={settings.trim.start}
          trimEnd={settings.trim.end}
          splitPoints={settings.split.points}
          activeSegmentIndex={selectedSegmentIndex}
          clips={timelineClips}
          thumbnails={thumbnails}
          activeClipIndex={selectedClipIndex}
          addingClip={upload.active}
          playing={playing}
          onTogglePlay={() => void togglePlay()}
          onSeek={seek}
          onTrimChange={changeTrim}
          onSelectSegment={selectSegment}
          onAddClip={() => appendInputRef.current?.click()}
          onRemoveClip={() => void removeActiveClip()}
        />
      </main>

      {notice && <button className="workspace-notice" type="button" onClick={() => setNotice("")} aria-label="Dismiss message">{notice}</button>}
    </div>
  );
}
