"use client";

import { useRef, useState } from "react";
import { Rnd } from "react-rnd";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
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

export type Selection =
  | { kind: "desk"; id: string }
  | { kind: "zone"; id: string }
  | null;

// Tracks an in-progress drag of either a single vertex or a whole zone.
type Drag = {
  zoneId: string;
  vertex: number | null; // null = dragging the whole shape
  startX: number;
  startY: number;
  origin: Point[];
};

export function FloorPlanEditor({
  mapWidth,
  mapHeight,
  zones,
  desks,
  selection,
  onSelect,
  onZoneChange,
  onDeskChange,
}: {
  mapWidth: number;
  mapHeight: number;
  zones: EditZone[];
  desks: EditDesk[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onZoneChange: (id: string, points: Point[]) => void;
  onDeskChange: (id: string, pos: { x: number; y: number }) => void;
}) {
  const sel = (kind: "desk" | "zone", id: string) =>
    selection?.kind === kind && selection.id === id;

  // The CanvasFrame scales its children by CSS transform; we read that scale so
  // pointer deltas (screen px) can be converted back into map coordinates.
  const scaleRef = useRef(1);
  const [drag, setDrag] = useState<Drag | null>(null);

  const clampX = (x: number) => Math.max(0, Math.min(mapWidth, x));
  const clampY = (y: number) => Math.max(0, Math.min(mapHeight, y));

  function beginDrag(
    e: React.PointerEvent,
    zone: EditZone,
    vertex: number | null,
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelect({ kind: "zone", id: zone.id });
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
    <CanvasFrame mapWidth={mapWidth} mapHeight={mapHeight}>
      {(scale) => {
        scaleRef.current = scale;
        return (
          <>
            <svg
              className="absolute left-0 top-0"
              width={mapWidth}
              height={mapHeight}
              style={{ pointerEvents: "none", zIndex: 1 }}
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
                      onClick={() => onSelect({ kind: "zone", id: z.id })}
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

            {desks.map((d) => {
              const isRoom = d.type === "ROOM";
              const selected = sel("desk", d.id);
              return (
                <Rnd
                  key={d.id}
                  scale={scale}
                  bounds="parent"
                  enableResizing={false}
                  size={{
                    width: isRoom ? DESK_W + 60 : DESK_W,
                    height: isRoom ? DESK_H + 70 : DESK_H,
                  }}
                  position={{ x: d.x, y: d.y }}
                  onDragStart={() => onSelect({ kind: "desk", id: d.id })}
                  onDragStop={(_e, p) =>
                    onDeskChange(d.id, {
                      x: Math.round(p.x),
                      y: Math.round(p.y),
                    })
                  }
                  onClick={() => onSelect({ kind: "desk", id: d.id })}
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
