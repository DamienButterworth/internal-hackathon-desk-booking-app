"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Measures available width and scales a fixed mapWidth×mapHeight canvas to fit.
// Children are rendered inside a layer that receives the computed `scale`, so
// both the static view and the react-rnd editor share the same coordinate space.
//
// When `zoomable` is set the frame becomes a free pan/zoom surface: the content
// layer is positioned with a `translate(pan) scale` transform (not a scroll
// container), so it floats anywhere — including off-canvas — and zoom anchors on
// the cursor. `scale` passed to children folds in the zoom so react-rnd drag
// math stays correct (a constant translate doesn't affect pointer deltas).
//
// `originX/originY` is the world-space coordinate of the window's top-left (may
// be negative). It is applied as an innermost `translate(-origin)` so children
// render at their raw world coordinates — the caller owns all world content
// (including any background image) and never has to offset coordinates itself.
export function CanvasFrame({
  mapWidth,
  mapHeight,
  originX = 0,
  originY = 0,
  zoomable = false,
  children,
}: {
  mapWidth: number;
  mapHeight: number;
  originX?: number;
  originY?: number;
  zoomable?: boolean;
  children: (scale: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setFit(Math.min(1, w / mapWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapWidth]);

  const scale = zoomable ? fit * zoom : fit;

  // Mirror live values into refs so the (non-passive) wheel + pan handlers read
  // current state without re-subscribing on every step.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  // Re-zoom around a focal point (client coords within the viewport), keeping
  // the map point under that focal point fixed by adjusting the pan offset.
  const applyZoom = useCallback(
    (nextZoom: number, focalX?: number, focalY?: number) => {
      const el = ref.current;
      if (!el) return;
      const z = clampZoom(nextZoom);
      const oldScale = scaleRef.current;
      const newScale = fit * z;
      const rect = el.getBoundingClientRect();
      const fx = focalX ?? rect.width / 2;
      const fy = focalY ?? rect.height / 2;
      const cur = panRef.current;
      const ratio = newScale / oldScale;
      setZoom(z);
      setPan({
        x: fx - ratio * (fx - cur.x),
        y: fy - ratio * (fy - cur.y),
      });
    },
    [fit],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Scroll wheel zooms toward the cursor; middle-mouse drag pans freely. Both
  // use non-passive native listeners (capture phase, so they win over react-rnd
  // children) and preventDefault the browser's page-zoom / autoscroll gestures.
  useEffect(() => {
    const el = ref.current;
    if (!el || !zoomable) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(
        zoomRef.current * factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };

    let start: { x: number; y: number; panX: number; panY: number } | null =
      null;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return; // middle button only
      // Stop in the capture phase so react-rnd never starts dragging the entity
      // under the cursor; preventDefault suppresses browser autoscroll.
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = panRef.current;
      start = { x: e.clientX, y: e.clientY, panX: cur.x, panY: cur.y };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!start) return;
      setPan({
        x: start.panX + (e.clientX - start.x),
        y: start.panY + (e.clientY - start.y),
      });
    };
    const endPan = (e: PointerEvent) => {
      if (!start) return;
      start = null;
      el.style.cursor = "";
      el.releasePointerCapture?.(e.pointerId);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("pointermove", onPointerMove, true);
    el.addEventListener("pointerup", endPan, true);
    el.addEventListener("pointercancel", endPan, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("pointermove", onPointerMove, true);
      el.removeEventListener("pointerup", endPan, true);
      el.removeEventListener("pointercancel", endPan, true);
    };
  }, [zoomable, applyZoom]);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-xl border border-line"
        style={{
          height: mapHeight * fit,
          background:
            "linear-gradient(#f6fafa,#eef3f4), repeating-linear-gradient(0deg,transparent,transparent 39px,#e6edee 39px,#e6edee 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,#e6edee 39px,#e6edee 40px)",
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: mapWidth,
            height: mapHeight,
            transform: `${
              zoomable ? `translate(${pan.x}px, ${pan.y}px) ` : ""
            }scale(${scale}) translate(${-originX}px, ${-originY}px)`,
          }}
        >
          {children(scale)}
        </div>
      </div>

      {zoomable && (
        <div className="absolute bottom-3 right-3 z-50 flex items-center gap-1 rounded-lg border border-line bg-white/95 p-1 shadow-md backdrop-blur">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-brand-tint disabled:opacity-40"
            title="Zoom out"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => applyZoom(zoom / 1.2)}
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="min-w-[3.25rem] rounded-md px-1 text-center text-xs font-semibold tabular-nums text-ink-soft hover:bg-brand-tint"
            title="Reset view"
            onClick={resetView}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-brand-tint disabled:opacity-40"
            title="Zoom in"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => applyZoom(zoom * 1.2)}
          >
            <ZoomIn size={15} />
          </button>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-brand-tint"
            title="Reset view (fit)"
            onClick={resetView}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
