import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { formatDuration } from "../lib/format";
import type { TimelineClip } from "../lib/clip-timeline";
import { getVideoSegments } from "../lib/video-split";

type TimelineProps = {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  splitPoints: number[];
  activeSegmentIndex: number;
  clips: TimelineClip[];
  thumbnails: Record<string, string[]>;
  activeClipIndex: number;
  addingClip: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onSelectSegment: (segmentIndex: number) => void;
  onAddClip: () => void;
  onRemoveClip: () => void;
};

type DragMode = "playhead" | "start" | "end" | null;

export function Timeline(props: TimelineProps) {
  const {
    duration, currentTime, trimStart, trimEnd, clips, thumbnails, activeClipIndex, addingClip, playing,
    splitPoints, activeSegmentIndex, onTogglePlay, onSeek, onTrimChange, onSelectSegment,
    onAddClip, onRemoveClip,
  } = props;
  const [zoom, setZoom] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<DragMode>(null);
  const pixelsPerSecond = 64 * zoom;
  const trackWidth = Math.max(760, duration * pixelsPerSecond);
  const segments = getVideoSegments(trimStart, trimEnd, splitPoints);
  const activeSegment = segments[Math.min(activeSegmentIndex, segments.length - 1)] ?? segments[0];

  const markers = useMemo(() => {
    const targetSpacing = 85;
    const rawStep = targetSpacing / pixelsPerSecond;
    const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = steps.find((value) => value >= rawStep) ?? 60;
    return Array.from({ length: Math.ceil(duration / step) + 1 }, (_, index) => index * step).filter((time) => time <= duration);
  }, [duration, pixelsPerSecond]);

  function pointerTime(event: PointerEvent<HTMLDivElement>): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(duration, (event.clientX - rect.left) / pixelsPerSecond));
  }

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const time = pointerTime(event);
    if (dragMode.current === "start") {
      onTrimChange(Math.min(time, trimEnd - 0.1), trimEnd);
      onSeek(Math.min(time, trimEnd - 0.1));
    } else if (dragMode.current === "end") {
      onTrimChange(trimStart, Math.max(time, trimStart + 0.1));
      onSeek(Math.max(time, trimStart + 0.1));
    } else {
      onSeek(time);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-drag]");
    dragMode.current = (handle?.dataset.drag as DragMode) ?? "playhead";
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragMode.current) return;
    updateFromPointer(event);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragMode.current = null;
  }

  return (
    <section className="timeline-panel" aria-label="Video timeline">
      <div className="timeline-toolbar">
        <div className="playback-controls">
          <button className="icon-button" type="button" onClick={() => onSeek(activeSegment?.start ?? trimStart)} aria-label="Go to selected part start"><SkipBackIcon weight="fill" /></button>
          <button className="play-button" type="button" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
          </button>
          <button className="icon-button" type="button" onClick={() => onSeek(activeSegment?.end ?? trimEnd)} aria-label="Go to selected part end"><SkipForwardIcon weight="fill" /></button>
          <span className="timecode"><strong>{formatDuration(currentTime)}</strong> / {formatDuration(duration)}</span>
        </div>
        <div className="timeline-toolbar-actions">
          <button className="timeline-add-button" type="button" onClick={onAddClip} disabled={addingClip || clips.length === 0 || clips.length >= 20}>
            <PlusIcon weight="bold" /> {addingClip ? "Adding…" : "Add video"}
          </button>
          <button className="timeline-remove-button" type="button" onClick={onRemoveClip} disabled={clips.length <= 1} aria-label="Remove selected video" title="Remove selected video">
            <TrashIcon />
          </button>
          <div className="timeline-zoom">
            <MagnifyingGlassMinusIcon aria-hidden="true" />
            <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Timeline zoom" />
            <MagnifyingGlassPlusIcon aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="timeline-scroll">
        <div
          className="timeline-track"
          ref={trackRef}
          style={{ width: trackWidth }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="timeline-ruler">
            {markers.map((time) => (
              <span key={time} style={{ left: time * pixelsPerSecond }}><i />{formatDuration(time)}</span>
            ))}
          </div>
          <div className="timeline-lane">
            {clips.map((clip, clipIndex) => (
              <div
                key={clip.id}
                className="timeline-source-clip"
                data-selected={clipIndex === activeClipIndex ? "true" : undefined}
                style={{ left: clip.start * pixelsPerSecond, width: Math.max(8, clip.duration * pixelsPerSecond) }}
                title={`${clipIndex + 1}. ${clip.name}`}
              >
                <span className="timeline-clip-label">{clipIndex + 1} · {clip.name}</span>
                <div className="thumbnail-strip">
                  {(thumbnails[clip.id] ?? []).length > 0
                    ? thumbnails[clip.id].map((thumbnail, index) => <img key={`${clip.id}-${index}`} src={thumbnail} alt="" draggable={false} />)
                    : <span className="thumbnail-placeholder">Video {clipIndex + 1}</span>}
                </div>
              </div>
            ))}
            <div
              className="timeline-trim-window"
              style={{ left: trimStart * pixelsPerSecond, width: Math.max(8, (trimEnd - trimStart) * pixelsPerSecond) }}
            >
              <button className="trim-handle trim-start" data-drag="start" type="button" aria-label="Adjust trim start"><i /></button>
              <button className="trim-handle trim-end" data-drag="end" type="button" aria-label="Adjust trim end"><i /></button>
            </div>
            {splitPoints.length > 0 && activeSegment && (
              <div
                className="timeline-active-segment"
                style={{ left: activeSegment.start * pixelsPerSecond, width: Math.max(2, activeSegment.duration * pixelsPerSecond) }}
                aria-hidden="true"
              />
            )}
            {splitPoints.map((point, index) => (
              <button
                key={point}
                className="timeline-split-marker"
                style={{ left: point * pixelsPerSecond }}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelectSegment(index + 1)}
                aria-label={`Select part ${index + 2} at ${formatDuration(point)}`}
                title={`Split at ${formatDuration(point)}`}
              ><span>{index + 2}</span></button>
            ))}
          </div>
          <div className="playhead" data-drag="playhead" style={{ left: currentTime * pixelsPerSecond }} aria-hidden="true"><span /></div>
        </div>
      </div>
    </section>
  );
}
