"use client";

import { Rnd } from "react-rnd";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { DESK_W, DESK_H, zoneVisual } from "@/lib/floor";

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
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Selection =
  | { kind: "desk"; id: string }
  | { kind: "zone"; id: string }
  | null;

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
  onZoneChange: (
    id: string,
    box: { x: number; y: number; width: number; height: number },
  ) => void;
  onDeskChange: (id: string, pos: { x: number; y: number }) => void;
}) {
  const sel = (kind: "desk" | "zone", id: string) =>
    selection?.kind === kind && selection.id === id;

  return (
    <CanvasFrame mapWidth={mapWidth} mapHeight={mapHeight}>
      {(scale) => (
        <>
          {zones.map((z) => {
            const v = zoneVisual(z.type);
            return (
              <Rnd
                key={z.id}
                scale={scale}
                bounds="parent"
                size={{ width: z.width, height: z.height }}
                position={{ x: z.x, y: z.y }}
                minWidth={140}
                minHeight={120}
                onDragStart={() => onSelect({ kind: "zone", id: z.id })}
                onDragStop={(_e, d) =>
                  onZoneChange(z.id, {
                    x: Math.round(d.x),
                    y: Math.round(d.y),
                    width: z.width,
                    height: z.height,
                  })
                }
                onResizeStart={() => onSelect({ kind: "zone", id: z.id })}
                onResizeStop={(_e, _dir, refEl, _delta, pos) =>
                  onZoneChange(z.id, {
                    x: Math.round(pos.x),
                    y: Math.round(pos.y),
                    width: Math.round(parseFloat(refEl.style.width)),
                    height: Math.round(parseFloat(refEl.style.height)),
                  })
                }
                onClick={() => onSelect({ kind: "zone", id: z.id })}
                className="rounded-xl"
                style={{
                  background: v.tint,
                  border: `2px ${sel("zone", z.id) ? "solid" : "dashed"} ${v.color}`,
                  zIndex: 1,
                }}
              >
                <span
                  className="pointer-events-none absolute left-2 top-2 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: v.color, color: "#fff" }}
                >
                  {z.name}
                </span>
              </Rnd>
            );
          })}

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
      )}
    </CanvasFrame>
  );
}
