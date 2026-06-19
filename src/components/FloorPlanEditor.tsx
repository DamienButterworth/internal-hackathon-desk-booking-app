"use client";

import { useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { RotateCw } from "lucide-react";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { FixtureShape } from "./FixtureShape";
import {
  DESK_W,
  DESK_H,
  zoneVisual,
  pointsToAttr,
  labelAnchor,
  type Point,
} from "@/lib/floor";

export type EditDesk = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  zoneId: string | null;
  isAvailable: boolean;
};
export type EditZone = {
  id: string;
  name: string;
  type: string;
  points: Point[];
};
export type EditFixture = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type SelKind = "desk" | "zone" | "fixture";
export type SelItem = { kind: SelKind; id: string };
// Selection is now a (possibly empty) multi-selection.
export type Selection = SelItem[];

export type FixtureGeom = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Tracks an in-progress drag of either a single vertex or a whole zone.
type Drag = {
  zoneId: string;
  vertex: number | null; // null = dragging the whole shape
  startX: number;
  startY: number;
  origin: Point[];
};

// Snapshot of every selected entity's geometry at the start of a group drag,
// so a delta can be applied uniformly to the whole selection.
type GroupOrigin = {
  anchor: SelItem;
  desks: Map<string, { x: number; y: number }>;
  fixtures: Map<string, FixtureGeom>;
  zones: Map<string, Point[]>;
};

// Rubber-band marquee (world coords) for select-by-area.
type Marquee = { x0: number; y0: number; x1: number; y1: number };

export function FloorPlanEditor({
  mapWidth,
  mapHeight,
  originX = 0,
  originY = 0,
  backgroundUrl,
  zones,
  desks,
  fixtures,
  selection,
  onSelectionChange,
  onZoneChange,
  onDeskChange,
  onFixtureChange,
  onFixtureRotate,
}: {
  mapWidth: number;
  mapHeight: number;
  originX?: number;
  originY?: number;
  backgroundUrl?: string | null;
  zones: EditZone[];
  desks: EditDesk[];
  fixtures: EditFixture[];
  selection: Selection;
  onSelectionChange: (s: Selection) => void;
  onZoneChange: (id: string, points: Point[]) => void;
  onDeskChange: (id: string, pos: { x: number; y: number }) => void;
  onFixtureChange: (id: string, geom: FixtureGeom) => void;
  onFixtureRotate: (id: string, rotation: number, commit: boolean) => void;
}) {
  const sel = (kind: SelKind, id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);

  // Select a single entity, or toggle it in/out when additive (Shift/Ctrl).
  // A plain click on an entity that's already part of a multi-selection keeps
  // the whole selection, so the group can be dragged together.
  function pick(item: SelItem, additive: boolean) {
    const has = selection.some((s) => s.kind === item.kind && s.id === item.id);
    if (additive) {
      onSelectionChange(
        has
          ? selection.filter(
              (s) => !(s.kind === item.kind && s.id === item.id),
            )
          : [...selection, item],
      );
    } else if (!(has && selection.length > 1)) {
      onSelectionChange([item]);
    }
  }

  // Used at drag start: make sure the item is selected without ever toggling it
  // off, so a group stays intact and can be dragged.
  function ensureSelected(item: SelItem, additive: boolean) {
    const has = selection.some((s) => s.kind === item.kind && s.id === item.id);
    if (has) return;
    onSelectionChange(additive ? [...selection, item] : [item]);
  }

  // The CanvasFrame scales its children by CSS transform; we read that scale so
  // pointer deltas (screen px) can be converted back into map coordinates.
  const scaleRef = useRef(1);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Group move (multi-selection) + rubber-band marquee state.
  const groupRef = useRef<GroupOrigin | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<{ additive: boolean } | null>(null);
  // Suppresses the click-to-select that fires right after a drag.
  const didDragRef = useRef(false);

  // Tracks an in-progress drag of a fixture's rotation handle.
  const originRef = useRef<SVGSVGElement | null>(null);
  const [rotating, setRotating] = useState<{
    id: string;
    cx: number;
    cy: number;
  } | null>(null);

  // No restriction: entities may be moved freely in any direction (the canvas
  // window grows to follow them), so coordinates are passed through unclamped.
  const clampX = (x: number) => x;
  const clampY = (y: number) => y;

  // Convert a screen pointer position into map coordinates. The SVG layer is
  // pinned to map (0,0) and visually scaled, so its bounding rect gives the
  // on-screen origin and we divide the offset back out by the scale.
  function toMap(e: React.PointerEvent) {
    const rect = originRef.current?.getBoundingClientRect();
    const scale = scaleRef.current || 1;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  // ---- Group move (multi-selection) ----------------------------------------
  // Returns true if a group drag should take over (anchor is part of a 2+
  // selection); records each selected entity's starting geometry.
  function captureGroup(anchor: SelItem): boolean {
    const has = selection.some(
      (s) => s.kind === anchor.kind && s.id === anchor.id,
    );
    if (!has || selection.length < 2) return false;
    const g: GroupOrigin = {
      anchor,
      desks: new Map(),
      fixtures: new Map(),
      zones: new Map(),
    };
    for (const s of selection) {
      if (s.kind === "desk") {
        const d = desks.find((x) => x.id === s.id);
        if (d) g.desks.set(d.id, { x: d.x, y: d.y });
      } else if (s.kind === "fixture") {
        const f = fixtures.find((x) => x.id === s.id);
        if (f)
          g.fixtures.set(f.id, {
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
          });
      } else {
        const z = zones.find((x) => x.id === s.id);
        if (z) g.zones.set(z.id, z.points);
      }
    }
    groupRef.current = g;
    return true;
  }

  // Apply a world-space delta to every entity in the captured group. The anchor
  // is excluded during live drag (react-rnd / the zone drag moves it visually)
  // and included on commit.
  function applyGroupDelta(dx: number, dy: number, includeAnchor: boolean) {
    const g = groupRef.current;
    if (!g) return;
    const isAnchor = (kind: SelKind, id: string) =>
      g.anchor.kind === kind && g.anchor.id === id;
    g.desks.forEach((o, id) => {
      if (!includeAnchor && isAnchor("desk", id)) return;
      onDeskChange(id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
    });
    g.fixtures.forEach((o, id) => {
      if (!includeAnchor && isAnchor("fixture", id)) return;
      onFixtureChange(id, {
        x: Math.round(o.x + dx),
        y: Math.round(o.y + dy),
        width: o.width,
        height: o.height,
      });
    });
    g.zones.forEach((pts, id) => {
      if (!includeAnchor && isAnchor("zone", id)) return;
      onZoneChange(
        id,
        pts.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) })),
      );
    });
  }

  // ---- Rubber-band marquee --------------------------------------------------
  function beginMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return; // left button only
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toMap(e);
    marqueeRef.current = { additive: e.shiftKey || e.metaKey || e.ctrlKey };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function moveMarquee(e: React.PointerEvent) {
    if (!marqueeRef.current) return;
    const p = toMap(e);
    setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
  }

  function endMarquee() {
    const m = marquee;
    const opts = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m || !opts) return;
    const minX = Math.min(m.x0, m.x1);
    const maxX = Math.max(m.x0, m.x1);
    const minY = Math.min(m.y0, m.y1);
    const maxY = Math.max(m.y0, m.y1);
    // Ignore an incidental click (tiny rect) — that's handled as deselect.
    if (maxX - minX < 4 && maxY - minY < 4) {
      if (!opts.additive) onSelectionChange([]);
      return;
    }
    const hit = (
      bx0: number,
      by0: number,
      bx1: number,
      by1: number,
    ): boolean => bx0 <= maxX && bx1 >= minX && by0 <= maxY && by1 >= minY;
    const found: SelItem[] = [];
    for (const d of desks) {
      const w = d.type === "ROOM" ? DESK_W + 60 : DESK_W;
      const h = d.type === "ROOM" ? DESK_H + 70 : DESK_H;
      if (hit(d.x, d.y, d.x + w, d.y + h)) found.push({ kind: "desk", id: d.id });
    }
    for (const f of fixtures) {
      if (hit(f.x, f.y, f.x + f.width, f.y + f.height))
        found.push({ kind: "fixture", id: f.id });
    }
    for (const z of zones) {
      const xs = z.points.map((p) => p.x);
      const ys = z.points.map((p) => p.y);
      if (
        hit(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
      )
        found.push({ kind: "zone", id: z.id });
    }
    if (opts.additive) {
      const merged = [...selection];
      for (const it of found)
        if (!merged.some((s) => s.kind === it.kind && s.id === it.id))
          merged.push(it);
      onSelectionChange(merged);
    } else {
      onSelectionChange(found);
    }
  }

  // Angle (deg, 0 = pointing up, clockwise) from the fixture centre to the
  // pointer; Shift snaps to 15° increments for clean orthogonal/diagonal runs.
  function rotationFor(e: React.PointerEvent) {
    if (!rotating) return 0;
    const p = toMap(e);
    let deg =
      (Math.atan2(p.x - rotating.cx, -(p.y - rotating.cy)) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    if (e.shiftKey) deg = (Math.round(deg / 15) * 15) % 360;
    return Math.round(deg);
  }

  function beginRotate(e: React.PointerEvent, f: EditFixture) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelectionChange([{ kind: "fixture", id: f.id }]);
    setRotating({
      id: f.id,
      cx: f.x + f.width / 2,
      cy: f.y + f.height / 2,
    });
  }

  function moveRotate(e: React.PointerEvent) {
    if (!rotating) return;
    onFixtureRotate(rotating.id, rotationFor(e), false);
  }

  function endRotate(e: React.PointerEvent) {
    if (!rotating) return;
    onFixtureRotate(rotating.id, rotationFor(e), true);
    setRotating(null);
  }

  function beginDrag(
    e: React.PointerEvent,
    zone: EditZone,
    vertex: number | null,
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    didDragRef.current = false;
    if (vertex === null) {
      pick({ kind: "zone", id: zone.id }, e.shiftKey);
      captureGroup({ kind: "zone", id: zone.id });
    } else {
      // Reshaping a vertex is always single-zone.
      onSelectionChange([{ kind: "zone", id: zone.id }]);
      groupRef.current = null;
    }
    setDrag({
      zoneId: zone.id,
      vertex,
      startX: e.clientX,
      startY: e.clientY,
      origin: zone.points,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    didDragRef.current = true;
    const scale = scaleRef.current || 1;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const next =
      drag.vertex === null
        ? drag.origin.map((p) => ({
            x: clampX(p.x + dx),
            y: clampY(p.y + dy),
          }))
        : drag.origin.map((p, i) =>
            i === drag.vertex
              ? { x: clampX(p.x + dx), y: clampY(p.y + dy) }
              : p,
          );
    onZoneChange(drag.zoneId, next);
    if (drag.vertex === null && groupRef.current) applyGroupDelta(dx, dy, false);
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    const scale = scaleRef.current || 1;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const rounded =
      drag.vertex === null
        ? drag.origin.map((p) => ({
            x: Math.round(clampX(p.x + dx)),
            y: Math.round(clampY(p.y + dy)),
          }))
        : drag.origin.map((p, i) =>
            i === drag.vertex
              ? { x: Math.round(clampX(p.x + dx)), y: Math.round(clampY(p.y + dy)) }
              : p,
          );
    onZoneChange(drag.zoneId, rounded);
    if (drag.vertex === null && groupRef.current) {
      applyGroupDelta(dx, dy, false);
      groupRef.current = null;
    }
    setDrag(null);
  }

  // Insert a vertex at the midpoint of edge i → i+1.
  function addVertex(zone: EditZone, edge: number) {
    const a = zone.points[edge];
    const b = zone.points[(edge + 1) % zone.points.length];
    const mid = {
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
    };
    const next = [...zone.points];
    next.splice(edge + 1, 0, mid);
    onZoneChange(zone.id, next);
  }

  // Remove a vertex (keep at least a triangle).
  function removeVertex(zone: EditZone, vertex: number) {
    if (zone.points.length <= 3) return;
    onZoneChange(
      zone.id,
      zone.points.filter((_, i) => i !== vertex),
    );
  }

  return (
    <CanvasFrame
      mapWidth={mapWidth}
      mapHeight={mapHeight}
      originX={originX}
      originY={originY}
      zoomable
    >
      {(scale) => {
        scaleRef.current = scale;
        return (
          <>
            {backgroundUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backgroundUrl}
                alt=""
                className="pointer-events-none absolute object-contain"
                style={{
                  left: originX,
                  top: originY,
                  width: mapWidth,
                  height: mapHeight,
                  zIndex: 0,
                }}
              />
            )}

            {/* Empty-canvas catcher: left-drag draws a marquee, click deselects. */}
            <div
              className="absolute"
              style={{
                left: originX,
                top: originY,
                width: mapWidth,
                height: mapHeight,
                zIndex: 0,
              }}
              onPointerDown={beginMarquee}
              onPointerMove={moveMarquee}
              onPointerUp={endMarquee}
            />

            {marquee && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-brand"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                  background: "rgba(13,148,136,0.12)",
                  zIndex: 50,
                }}
              />
            )}

            <svg
              ref={originRef}
              className="absolute left-0 top-0"
              width={mapWidth}
              height={mapHeight}
              style={{ pointerEvents: "none", zIndex: 1, overflow: "visible" }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >
              {zones.map((z) => {
                const v = zoneVisual(z.type);
                const selected = sel("zone", z.id);
                const anchor = labelAnchor(z.points);
                return (
                  <g key={z.id}>
                    <polygon
                      points={pointsToAttr(z.points)}
                      fill={v.tint}
                      stroke={v.color}
                      strokeWidth={2}
                      strokeDasharray={selected ? undefined : "6 4"}
                      style={{ cursor: "move", pointerEvents: "all" }}
                      onPointerDown={(e) => beginDrag(e, z, null)}
                    />

                    <foreignObject
                      x={anchor.x + 8}
                      y={anchor.y + 8}
                      width={Math.max(60, z.name.length * 8 + 24)}
                      height={24}
                      style={{ pointerEvents: "none" }}
                    >
                      <span
                        className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: v.color, color: "#fff" }}
                      >
                        {z.name}
                      </span>
                    </foreignObject>

                    {/* Edit handles only on the selected zone. */}
                    {selected && (
                      <>
                        {/* Midpoint "+" markers — click to add a vertex. */}
                        {z.points.map((p, i) => {
                          const b = z.points[(i + 1) % z.points.length];
                          const mx = (p.x + b.x) / 2;
                          const my = (p.y + b.y) / 2;
                          return (
                            <g
                              key={`mid-${i}`}
                              style={{ cursor: "copy", pointerEvents: "all" }}
                              onClick={() => addVertex(z, i)}
                            >
                              <circle
                                cx={mx}
                                cy={my}
                                r={6}
                                fill="#fff"
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                              <line
                                x1={mx - 3}
                                y1={my}
                                x2={mx + 3}
                                y2={my}
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                              <line
                                x1={mx}
                                y1={my - 3}
                                x2={mx}
                                y2={my + 3}
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                            </g>
                          );
                        })}

                        {/* Vertex handles — drag to reshape, double-click to remove. */}
                        {z.points.map((p, i) => (
                          <circle
                            key={`v-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={7}
                            fill="#fff"
                            stroke={v.color}
                            strokeWidth={2.5}
                            style={{
                              cursor: "grab",
                              pointerEvents: "all",
                            }}
                            onPointerDown={(e) => beginDrag(e, z, i)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              removeVertex(z, i);
                            }}
                          />
                        ))}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {fixtures.map((f) => {
              const selected = sel("fixture", f.id);
              const horizontal = f.width >= f.height;
              const minW = horizontal ? 24 : 8;
              const minH = horizontal ? 8 : 24;
              // Thin elements (walls/windows) are mostly resize handles, leaving
              // nowhere to grab for a move. Restrict resizing to the two ends of
              // the long axis so the body drags, and widen the grab area.
              const thin = Math.min(f.width, f.height) <= 20;
              const enableResizing = thin
                ? horizontal
                  ? { left: true, right: true }
                  : { top: true, bottom: true }
                : undefined;
              return (
                <Rnd
                  key={f.id}
                  scale={scale}
                  enableResizing={enableResizing}
                  size={{ width: f.width, height: f.height }}
                  position={{ x: f.x, y: f.y }}
                  minWidth={minW}
                  minHeight={minH}
                  onDragStart={(e) => {
                    didDragRef.current = false;
                    // Shift-selection is handled on click (toggle); here we only
                    // make a plain drag of an unselected item grab it.
                    if (!(e as MouseEvent).shiftKey)
                      ensureSelected({ kind: "fixture", id: f.id }, false);
                    captureGroup({ kind: "fixture", id: f.id });
                  }}
                  onDrag={(_e, data) => {
                    didDragRef.current = true;
                    const g = groupRef.current;
                    if (g) {
                      const o = g.fixtures.get(f.id);
                      if (o) applyGroupDelta(data.x - o.x, data.y - o.y, false);
                    }
                  }}
                  onDragStop={(_e, p) => {
                    const g = groupRef.current;
                    groupRef.current = null;
                    if (!didDragRef.current) return;
                    if (g) {
                      const o = g.fixtures.get(f.id);
                      if (o)
                        applyGroupDelta(
                          Math.round(p.x) - o.x,
                          Math.round(p.y) - o.y,
                          true,
                        );
                    } else {
                      onFixtureChange(f.id, {
                        x: Math.round(p.x),
                        y: Math.round(p.y),
                        width: f.width,
                        height: f.height,
                      });
                    }
                  }}
                  onResizeStart={() =>
                    onSelectionChange([{ kind: "fixture", id: f.id }])
                  }
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    onFixtureChange(f.id, {
                      x: Math.round(pos.x),
                      y: Math.round(pos.y),
                      width: Math.round(ref.offsetWidth),
                      height: Math.round(ref.offsetHeight),
                    })
                  }
                  onClick={(e: React.MouseEvent) => {
                    if (didDragRef.current) return;
                    pick({ kind: "fixture", id: f.id }, e.shiftKey);
                  }}
                  style={{ zIndex: selected ? 28 : 10 }}
                >
                  <div
                    className="relative h-full w-full cursor-move"
                    style={{
                      transform: f.rotation
                        ? `rotate(${f.rotation}deg)`
                        : undefined,
                    }}
                  >
                    {/* Invisible grab strip so thin walls are easy to drag. */}
                    {thin && (
                      <span
                        aria-hidden
                        className="absolute"
                        style={
                          horizontal
                            ? { left: 12, right: 12, top: -9, bottom: -9 }
                            : { top: 12, bottom: 12, left: -9, right: -9 }
                        }
                      />
                    )}
                    <FixtureShape
                      type={f.type}
                      label={f.label}
                      selected={selected}
                    />
                  </div>
                </Rnd>
              );
            })}

            {/* Drag-to-rotate handle on the single selected fixture. */}
            {selection.length === 1 &&
              selection[0].kind === "fixture" &&
              (() => {
                const f = fixtures.find((x) => x.id === selection[0].id);
                if (!f) return null;
                const cx = f.x + f.width / 2;
                const cy = f.y + f.height / 2;
                const r = ((f.rotation || 0) * Math.PI) / 180;
                const dist = f.height / 2 + 30;
                const hx = cx + dist * Math.sin(r);
                const hy = cy - dist * Math.cos(r);
                return (
                  <>
                    <svg
                      className="pointer-events-none absolute left-0 top-0"
                      width={mapWidth}
                      height={mapHeight}
                      style={{ zIndex: 34, overflow: "visible" }}
                    >
                      <line
                        x1={cx}
                        y1={cy}
                        x2={hx}
                        y2={hy}
                        stroke="#0f766e"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    </svg>
                    <div
                      className="absolute flex items-center justify-center rounded-full bg-white shadow ring-2 ring-brand"
                      style={{
                        left: hx - 12,
                        top: hy - 12,
                        width: 24,
                        height: 24,
                        zIndex: 40,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                      title="Drag to rotate · hold Shift to snap to 15°"
                      onPointerDown={(e) => beginRotate(e, f)}
                      onPointerMove={moveRotate}
                      onPointerUp={endRotate}
                    >
                      <RotateCw size={13} className="text-brand-strong" />
                    </div>
                    {rotating?.id === f.id && (
                      <div
                        className="pointer-events-none absolute rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ left: hx + 16, top: hy - 8, zIndex: 41 }}
                      >
                        {Math.round(f.rotation)}°
                      </div>
                    )}
                  </>
                );
              })()}

            {desks.map((d) => {
              const isRoom = d.type === "ROOM";
              const selected = sel("desk", d.id);
              return (
                <Rnd
                  key={d.id}
                  scale={scale}
                  enableResizing={false}
                  size={{
                    width: isRoom ? DESK_W + 60 : DESK_W,
                    height: isRoom ? DESK_H + 70 : DESK_H,
                  }}
                  position={{ x: d.x, y: d.y }}
                  onDragStart={(e) => {
                    didDragRef.current = false;
                    if (!(e as MouseEvent).shiftKey)
                      ensureSelected({ kind: "desk", id: d.id }, false);
                    captureGroup({ kind: "desk", id: d.id });
                  }}
                  onDrag={(_e, data) => {
                    didDragRef.current = true;
                    const g = groupRef.current;
                    if (g) {
                      const o = g.desks.get(d.id);
                      if (o) applyGroupDelta(data.x - o.x, data.y - o.y, false);
                    }
                  }}
                  onDragStop={(_e, p) => {
                    const g = groupRef.current;
                    groupRef.current = null;
                    if (!didDragRef.current) return;
                    if (g) {
                      const o = g.desks.get(d.id);
                      if (o)
                        applyGroupDelta(
                          Math.round(p.x) - o.x,
                          Math.round(p.y) - o.y,
                          true,
                        );
                    } else {
                      onDeskChange(d.id, {
                        x: Math.round(p.x),
                        y: Math.round(p.y),
                      });
                    }
                  }}
                  onClick={(e: React.MouseEvent) => {
                    if (didDragRef.current) return;
                    pick({ kind: "desk", id: d.id }, e.shiftKey);
                  }}
                  style={{ zIndex: selected ? 30 : 20 }}
                >
                  <div
                    className={clsx(
                      "flex h-full w-full cursor-move flex-col items-center justify-center rounded-lg bg-white text-[11px] font-semibold shadow-sm",
                      selected
                        ? "ring-2 ring-brand"
                        : "border border-[#cbd5d8]",
                      !d.isAvailable && "opacity-50",
                    )}
                    style={{ color: "#0b2b33" }}
                  >
                    {d.name}
                    {isRoom && (
                      <span className="text-[9px] font-medium text-muted">
                        room
                      </span>
                    )}
                  </div>
                </Rnd>
              );
            })}
          </>
        );
      }}
    </CanvasFrame>
  );
}
